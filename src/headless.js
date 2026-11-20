#!/usr/bin/env node
// Headless runner, Test Contract v1.0:
// node src/headless.js --seed <int> --night 1 [--scenario f] [--inputs f] --ticks <int> --out f.jsonl [--snapshot-every n]
import { readFileSync, writeFileSync } from 'node:fs';
import { createGame, step, snapshot } from './sim/game.js';
import { FormatError, parseJson, validateScenario, validateInputs, inputTimeline } from './io.js';

class UsageError extends Error {}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new UsageError(`unexpected argument: ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`missing value for ${k}`);
    a[k.slice(2)] = v;
    i++;
  }
  const int = (name, def) => {
    const raw = a[name] ?? def;
    if (raw === undefined) throw new UsageError(`--${name} is required`);
    if (!/^-?\d+$/.test(String(raw))) throw new UsageError(`--${name} must be an integer`);
    return Number(raw);
  };
  const opts = { seed: int('seed'), night: int('night', '1'), ticks: int('ticks'), every: int('snapshot-every', '10'), out: a.out, scenario: a.scenario, inputs: a.inputs };
  if (!opts.out) throw new UsageError('--out is required');
  if (opts.night !== 1) throw new UsageError(`night ${opts.night} is not available (only night 1)`);
  if (opts.ticks < 0) throw new UsageError('--ticks must be >= 0');
  if (opts.every < 1) throw new UsageError('--snapshot-every must be >= 1');
  return opts;
}

const readJson = (file, what) => {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`cannot read ${what} file ${file}: ${e.message}`); }
  return parseJson(text, what);
};

export function run(opts) {
  const scenario = opts.scenario ? validateScenario(readJson(opts.scenario, 'scenario'), ['L1', 'L2', 'L3', 'L4', 'L5']) : {};
  const frames = opts.inputs ? validateInputs(readJson(opts.inputs, 'inputs')) : [];
  const g = createGame({ seed: opts.seed, scenario });
  const input = inputTimeline(frames);
  const lines = [JSON.stringify(snapshot(g))];
  for (let k = 0; k < opts.ticks && g.state === 'playing'; k++) {
    for (const e of step(g, input.at(k))) lines.push(JSON.stringify(e));
    if (g.tick % opts.every === 0) lines.push(JSON.stringify(snapshot(g)));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: g.tick, state: g.state, score: g.score }));
  writeFileSync(opts.out, lines.join('\n') + '\n');
}

try {
  run(parseArgs(process.argv.slice(2)));
} catch (e) {
  process.stderr.write(`error: ${e.message}\n`);
  process.exit(e instanceof FormatError ? 2 : 1);
}
