#!/usr/bin/env node
// Ticket-04 §1 benchmark: node tools/bench.js --seed 42 --duration 30 --out bench.json
// Opens the real game in a headed Chrome/Edge app window (real GPU, vsync and the frame-rate cap off), loads the
// standard bench scene (web/?scene=bench), waits 3 s warm-up, measures --duration s, writes bench.json, exits 0.
// The page sends frame times; this process adds load_ms (from its own start) and the browser's peak RSS.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, release, version, arch } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROCESS_START = performance.timeOrigin; // epoch ms when this process started
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const opts = { seed: 42, duration: 30, out: 'bench.json' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i]?.replace(/^--/, ''), v = argv[i + 1];
  if (!(k in opts) || v === undefined) { console.error(`usage: bench.js --seed <int> --duration <s> --out <file> (bad: ${argv[i]})`); process.exit(1); }
  opts[k] = k === 'out' ? v : Number(v);
  if (k !== 'out' && !(Number.isFinite(opts[k]) && opts[k] >= (k === 'duration' ? 1 : -2147483648))) { console.error(`--${k} must be a number`); process.exit(1); }
}
const browser = [process.env.CHROME, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find(existsSync);
if (!browser) { console.error('No Chrome/Edge found; set CHROME=/path/to/browser'); process.exit(1); }
const killTree = (p) => { if (platform() === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill('SIGKILL'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// RSS of the browser process tree (all its renderer/GPU processes), in MB. Async so it never blocks the page.
function treeRssMb(rootPid) {
  const win = platform() === 'win32';
  const [cmd, args] = win
    ? ['powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize | % { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }']]
    : ['ps', ['-A', '-o', 'pid=,ppid=,rss=']];
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const rows = out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length === 3 && r.every(Number.isFinite));
      const tree = new Set([rootPid]);
      for (let grew = true; grew;) { grew = false; for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) { tree.add(pid); grew = true; } }
      const bytes = rows.filter(([pid]) => tree.has(pid)).reduce((a, [, , m]) => a + (win ? m : m * 1024), 0);
      resolve(bytes > 0 ? Math.round(bytes / 1048576) : null);
    });
  });
}

async function attempt(n) {
  const start = n === 1 ? PROCESS_START : performance.timeOrigin + performance.now(); // a retry restarts the clock (fresh browser + server)
  const dir = mkdtempSync(join(tmpdir(), 'ddl-bench-')), benchOut = join(dir, 'result.json');
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(port)], { env: { ...process.env, BENCH_OUT: benchOut }, stdio: 'ignore' });
  await sleep(500);
  const url = `http://localhost:${port}/web/?scene=bench&seed=${opts.seed}&duration=${opts.duration}`;
  const b = spawn(browser, [`--app=${url}`, '--window-size=1300,780', '--window-position=20,20', '--force-device-scale-factor=1',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', // vsync off
    `--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], { stdio: 'ignore' });
  let peak = null;
  const deadline = Date.now() + (opts.duration + 60) * 1000;
  let nextSample = Date.now() + 2000;
  while (!existsSync(benchOut) && Date.now() < deadline) {
    if (Date.now() >= nextSample) { nextSample = Date.now() + 5000; treeRssMb(b.pid).then((m) => { if (m !== null) peak = Math.max(peak ?? 0, m); }); }
    await sleep(250);
  }
  const last = await treeRssMb(b.pid);
  if (last !== null) peak = Math.max(peak ?? 0, last);
  killTree(b); killTree(server);
  const result = existsSync(benchOut) ? JSON.parse(readFileSync(benchOut, 'utf8')) : null;
  await sleep(500);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* the browser may still hold files */ }
  return result && { result, peak, start };
}

let got = null;
for (let i = 1; i <= 3 && !got; i++) { // a fresh headed window occasionally never starts rendering: retry
  got = await attempt(i);
  if (!got) console.error(`no result (attempt ${i}/3)`);
}
if (!got) process.exit(1);
const { result: r, peak, start } = got;
const bench = {
  contract_version: '1.3',
  avg_fps: r.avg_fps, p1_low_fps: r.p1_low_fps, frame_ms_p95: r.frame_ms_p95, frames: r.frames,
  load_ms: Math.round(r.first_frame_epoch - start),
  peak_mem_mb: peak, // sum of the working sets / RSS of the browser process tree, sampled every 5 s
  vsync_off: true,
  renderer: `three.js r${r.three} WebGL${r.webgl} · ${r.gpu} · ${r.browser} · ${r.width}x${r.height} @${r.pixel_ratio}x`,
  os: `${version()} ${release()} (${platform()} ${arch()})`,
};
writeFileSync(opts.out, JSON.stringify(bench, null, 2) + '\n');
const pass = bench.avg_fps >= 60 && bench.p1_low_fps >= 30 && bench.load_ms <= 10000;
console.log(`${pass ? 'PASS' : 'BELOW TARGET'} (avg>=60, 1% low>=30, load<=10000 ms) -> ${opts.out}\n${JSON.stringify(bench)}`);
process.exit(0);
