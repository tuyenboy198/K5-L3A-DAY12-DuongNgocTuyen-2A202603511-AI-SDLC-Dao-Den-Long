// Zero-dependency static server for the browser build: node tools/serve.js [port]
// Also owns the local leaderboard file (Ticket-04 §3): node tools/serve.js --export-leaderboard out.json
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, rank } from '../src/leaderboard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = process.env.LEADERBOARD_FILE ?? join(ROOT, 'data', 'leaderboard.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const loadBoard = async () => { try { return rank(JSON.parse(await readFile(BOARD, 'utf8')).entries ?? []); } catch { return []; } };
const saveBoard = async (entries) => { await mkdir(dirname(BOARD), { recursive: true }); await writeFile(BOARD, JSON.stringify({ entries }, null, 2) + '\n'); };

const exportAt = process.argv.indexOf('--export-leaderboard');
if (exportAt !== -1) {
  const out = process.argv[exportAt + 1];
  if (!out) { console.error('usage: node tools/serve.js --export-leaderboard out.json'); process.exit(1); }
  await writeFile(out, JSON.stringify({ entries: await loadBoard() }, null, 2) + '\n');
  console.log(`leaderboard -> ${out}`);
  process.exit(0);
}

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const readBody = async (req, limit = 4096) => {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > limit) throw new Error('body too large'); }
  return body;
};
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
let queue = Promise.resolve(); // serialise leaderboard writes

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'POST' && path === '/__bench') { // benchmark result from the page (tools/fps.js, tools/bench.js set BENCH_OUT)
    const body = await readBody(req, 1 << 20).catch(() => '');
    if (process.env.BENCH_OUT && body) await writeFile(process.env.BENCH_OUT, body);
    res.writeHead(204); return res.end();
  }
  if (path === '/__leaderboard') {
    if (req.method === 'GET') return json(res, 200, { entries: await loadBoard() });
    if (req.method === 'POST') {
      try {
        const sub = JSON.parse(await readBody(req));
        const entries = await (queue = queue.then(async () => { const e = addEntry(await loadBoard(), sub); await saveBoard(e); return e; }));
        return json(res, 200, { entries });
      } catch (e) { queue = Promise.resolve(); return json(res, 400, { error: e.message }); }
    }
  }
  if (path === '/') { res.writeHead(302, { Location: '/web/' }); return res.end(); }
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); } // no path traversal
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`Đảo Đèn Lồng: open http://localhost:${PORT}/  (Ctrl+C to stop)`));
