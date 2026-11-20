# Đảo Đèn Lồng – agent guide

3D game (Three.js, browser) + headless sim (Node). Plain JS ES modules, **zero npm dependencies**.

## Commands
- Test everything: `npm test` (node:test; must stay green — a Stop hook blocks finishing when red)
- Proof report: `npm run verify -- phase-N` -> `docs/proof/phase-N/verify-report.md`
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Play: `npm run play` -> http://localhost:8080/
- Screenshot real build: `node tools/screenshot.js <out.png> "scenario=../scenarios/<x>.scenario.json" [ms]`

## Layout
- `src/sim/` pure game logic, shared by CLI and browser. `config.js` = every gameplay number.
- `src/io.js` scenario/inputs validation (bad format -> FormatError -> exit 2).
- `src/headless.js` CLI per Test Contract (spec: `docs/notes/test-contract-v1.0.md`).
- `web/` renderer only: never put game rules here.
- `scenarios/*.scenario.json` carry an `expect` block, auto-checked by `tests/cli.test.js`.

## Rules
- Contract output is graded byte-for-byte: no `Math.random`, no `Date`, no iteration over unordered data in `src/sim`.
- Changing a number in `src/sim/config.js` => update `game.contract.json` too (contract.test.js enforces).
- Expected values in tests/scenarios are derived by hand from the rules (write the derivation in `_why`), never copied from program output.
- Creative extras must be render-only or disabled in headless; headless output must not change.
- A ticket that replaces an old rule: edit/remove the old test **with a reason** in `docs/notes/phase-N.md`; never skip silently.
- Do not invent requirements: quote the ticket text in `docs/notes/phase-N.md` when you make an assumption.
