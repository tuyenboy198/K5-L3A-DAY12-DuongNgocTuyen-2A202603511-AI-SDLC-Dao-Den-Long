// Screenshot the real browser build with headless Chrome/Edge.
// node tools/screenshot.js <out.png> [query] [ms]   e.g. node tools/screenshot.js docs/proof/phase-1/lit.png "scenario=../scenarios/safe_lantern.scenario.json" 6000
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [outArg, query = '', ms = '5000'] = process.argv.slice(2);
if (!outArg) { console.error('usage: node tools/screenshot.js <out.png> [query] [ms]'); process.exit(1); }
const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });

const candidates = [
  process.env.CHROME,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found; set CHROME=/path/to/browser'); process.exit(1); }

const PORT = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'serve.js'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const url = `http://localhost:${PORT}/web/?autostart&shot&seed=7${query ? '&' + query : ''}`;
const r = spawnSync(browser, ['--headless=new', '--enable-unsafe-swiftshader', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ddl-shot-'))}`,
  '--window-size=1280,720', `--virtual-time-budget=${ms}`, `--screenshot=${out}`, url], { stdio: 'ignore', timeout: 60000 });
server.kill();
if (!existsSync(out)) { console.error(`screenshot failed (exit ${r.status})`); process.exit(1); }
console.log(`saved ${out}  <-  ${url}`);
