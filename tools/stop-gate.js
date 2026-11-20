// Claude Code Stop hook: the agent may not finish while tests are red.
// Exit 2 + stderr blocks the stop and shows the failures to the agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
if (input.stop_hook_active) process.exit(0); // already blocked once this turn; avoid an infinite loop

const r = spawnSync(process.execPath, ['--test'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
if (r.status === 0) process.exit(0);
const failures = (r.stdout.match(/^✖.*$/gm) ?? []).slice(0, 15).join('\n');
process.stderr.write(`Tests are failing - fix them (or explain why) before finishing:\n${failures}\n`);
process.exit(2);
