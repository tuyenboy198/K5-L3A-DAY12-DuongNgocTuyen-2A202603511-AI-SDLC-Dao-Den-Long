#!/usr/bin/env node
// Ticket-04 §3-§4 end-to-end check of the real page in headless Chrome/Edge (DevTools protocol, no dependencies):
// key rebinding + duplicate warning + reset + persistence, remapped key drives the game, captions, reduced motion,
// UI text >= 18 px at 1280x720 and x1.25 large text, leaderboard save after a loss + export.
// node tools/e2e-ui.js [report.md]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = process.argv[2];
const browser = [process.env.CHROME, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find(existsSync);
if (!browser) { console.error('No Chrome/Edge found; set CHROME=/path/to/browser'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'ddl-e2e-')), board = join(tmp, 'board.json');
const port = 8100 + Math.floor(Math.random() * 800), dport = 9300 + Math.floor(Math.random() * 500);
const env = { ...process.env, LEADERBOARD_FILE: board };
const server = spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(port)], { env, stdio: 'ignore' });
const b = spawn(browser, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${dport}`, `--user-data-dir=${join(tmp, 'profile')}`,
  '--window-size=1280,720', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(b.pid), '/T', '/F'], { stdio: 'ignore' }); else b.kill('SIGKILL'); server.kill(); };

let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error'); return r.result?.result?.value; };
const until = async (expr, ms = 20000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await ev(expr)) return true; await sleep(150); } return false; };
const key = async (k, code, vk) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
const open = async (q) => { await send('Page.navigate', { url: `http://localhost:${port}/web/?${q}` }); await sleep(500); return until("typeof window.__game === 'object'"); };
const SMALL_TEXT = `(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!n.textContent.trim() || el.closest('.hidden,script,style')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 18) bad.push(el.tagName + '#' + el.id + ' ' + fs + 'px "' + n.textContent.trim().slice(0, 20) + '"'); } return bad; })()`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

try {
  for (let i = 0; i < 40 && !ws; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); }
    } catch { await sleep(250); }
  }
  if (!ws) throw new Error('could not connect to the browser');
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); // exactly 1280x720 whatever the OS scaling

  // --- text size at 1280x720 on every screen ---
  await open('noauto&seed=1');
  check('viewport is 1280x720', await ev('innerWidth === 1280 && innerHeight === 720'), await ev('innerWidth + "x" + innerHeight'));
  const small = {};
  small.menu = await ev(SMALL_TEXT);
  await ev("document.querySelector('[data-act=settings]').click()"); small.settings = await ev(SMALL_TEXT);
  await ev("document.querySelector('[data-act=\"settings-back\"]').click()");
  await ev("document.querySelector('[data-act=board]').click()"); await until("!document.getElementById('s-board').classList.contains('hidden')"); small.board = await ev(SMALL_TEXT);
  await open('autostart&seed=1&night=1'); await sleep(800); small.hud = await ev(SMALL_TEXT);
  await key('Escape', 'Escape', 27); await sleep(200); small.pause = await ev(SMALL_TEXT);
  const allSmall = Object.entries(small).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
  check('all visible UI text >= 18 px (menu, settings, leaderboard, HUD, pause)', allSmall.length === 0, allSmall.slice(0, 5).join('; '));

  // --- key rebinding ---
  await open('noauto&seed=1');
  await ev("document.querySelector('[data-act=settings]').click()");
  await ev("document.querySelector('[data-bind=jump]').click()");
  check('rebind: button asks for a key', (await ev("document.querySelector('[data-bind=jump]').textContent")).includes('Nhấn phím'));
  await key('k', 'KeyK', 75);
  check('rebind: Jump = K saved', await ev("JSON.parse(localStorage.getItem('ddl-settings')).keys.jump === 'k'"));
  await ev("document.querySelector('[data-bind=dash]').click()"); await key('w', 'KeyW', 87);
  const dupMsg = await ev("document.getElementById('bind-msg').textContent");
  check('rebind: duplicate key is detected and reported, not applied', dupMsg.includes('đang dùng') && await ev("JSON.parse(localStorage.getItem('ddl-settings')).keys.dash === 'shift'"), dupMsg);
  await ev("document.querySelector('[data-bind=pause]').click()"); await key('Escape', 'Escape', 27);
  check('rebind: Esc cancels', await ev("JSON.parse(localStorage.getItem('ddl-settings')).keys.pause === 'p'"));
  await ev("document.getElementById('set-big').click()");
  check('large text: x1.25 (22.5 px)', await ev("getComputedStyle(document.body).fontSize === '22.5px'"));
  await ev("document.getElementById('set-big').click()");
  await open('noauto&seed=1');
  check('settings persist after reload (Jump still K, menu shows K)', await ev("JSON.parse(localStorage.getItem('ddl-settings')).keys.jump === 'k' && document.getElementById('keyhelp').textContent.includes('K')"));
  await open('autostart&seed=1&night=1'); await sleep(500);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 });
  const jumped = await until('window.__game.player.grounded === false', 3000);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 });
  check('remapped key drives the game (K jumps)', jumped);
  await open('noauto&seed=1');
  await ev("document.querySelector('[data-act=settings]').click()"); await ev("document.querySelector('[data-act=\"keys-reset\"]').click()");
  check('reset to defaults', await ev("JSON.parse(localStorage.getItem('ddl-settings')).keys.jump === ' '"));

  // --- captions + spawn arrow (first shades spawn at tick 300) ---
  await open('autostart&seed=1&night=1&ff=280');
  check('caption: shade appears', await until("document.getElementById('captions').textContent.includes('Bóng Mực xuất hiện')", 15000));
  await open('autostart&seed=1&night=1&scenario=../scenarios/fuel_drain.scenario.json');
  check('caption: lantern fuel < 30', await until("document.getElementById('captions').textContent.includes('sắp cạn dầu')", 15000));

  // --- reduced motion: hit with and without ---
  const flashPeak = async () => { await open('autostart&seed=1&night=1&scenario=../scenarios/shade_hit_lose.scenario.json'); let peak = 0; const t = Date.now() + 6000;
    while (Date.now() < t) { peak = Math.max(peak, Number(await ev("document.getElementById('flash').style.opacity || 0"))); if (peak > 0) break; await sleep(30); } return peak; };
  const normalPeak = await flashPeak();
  await ev("localStorage.setItem('ddl-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('ddl-settings') ?? '{}'), reduceMotion: true }))");
  const rmPeak = await flashPeak();
  check('reduced motion: no screen flash on hit (normal mode flashes)', normalPeak > 0 && rmPeak === 0, `normal ${normalPeak}, reduced ${rmPeak}`);

  // --- leaderboard: lose a night, enter a name, scores persist on disk, export ---
  await open('autostart&seed=1&night=1&scenario=../scenarios/shade_hit_lose.scenario.json');
  check('save form shown after a loss', await until("!!document.querySelector('#result-save form')", 20000));
  await ev("document.querySelector('#result-save input').value = 'ab'; document.querySelector('#result-save form').requestSubmit()");
  check('invalid name rejected', (await ev("document.querySelector('#result-save .msg').textContent")).includes('3–12'));
  await ev("document.querySelector('#result-save input').value = 'Tuyên_01'; document.querySelector('#result-save form').requestSubmit()");
  check('valid name saved -> leaderboard screen', await until("!document.getElementById('s-board').classList.contains('hidden') && document.getElementById('board-list').textContent.includes('Tuyên_01')"));
  const out = join(tmp, 'export.json');
  spawnSync(process.execPath, [join(ROOT, 'tools/serve.js'), '--export-leaderboard', out], { env });
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  check('export-leaderboard contains the saved entry', exported.entries[0]?.name === 'Tuyên_01' && exported.entries[0].nights_won === 0 && /[+-]\d\d:\d\d$/.test(exported.entries[0].achieved_at), JSON.stringify(exported.entries[0]));
} catch (e) {
  check('e2e run', false, e.message);
} finally {
  cleanup();
}
const ok = results.every((r) => r.ok);
if (reportPath) writeFileSync(reportPath, `# UI end-to-end check (Ticket-04 §3-§4)\n\nGenerated by \`node tools/e2e-ui.js\` (headless Chrome/Edge at 1280x720, DevTools protocol). Result: **${ok ? 'PASS' : 'FAIL'}**.\n\n| Check | Result | Detail |\n|---|---|---|\n${results.map((r) => `| ${r.name} | ${r.ok ? 'ĐẠT' : 'CHƯA ĐẠT'} | ${r.detail.replace(/\|/g, '/')} |`).join('\n')}\n`);
process.exit(ok ? 0 : 1);
