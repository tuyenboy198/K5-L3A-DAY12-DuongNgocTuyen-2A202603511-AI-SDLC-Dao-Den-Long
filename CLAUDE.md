# Đảo Đèn Lồng – agent guide

3D game (Three.js, browser) + headless sim (Node), 3 nights. Plain JS ES modules, **zero npm dependencies**.
Current contract: **Test Contract v1.1** (Ticket-02). Spec summary: `docs/notes/test-contract-v1.1.md`.

## Commands
- Test everything: `npm test` (node:test; must stay green — a Stop hook blocks finishing when red)
- Proof report: `npm run verify -- phase-N` -> `docs/proof/phase-N/verify-report.md` (tests, determinism of nights 1-3, full-night time)
- Headless: `node src/headless.js --seed 1 --night <1|2|3> --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Play: `npm run play` -> http://localhost:8080/  (`?night=2&autostart`, `?scenario=..&inputs=..&ff=N` replays a test)
- Screenshot real build: `node tools/screenshot.js <out.png> "night=2&scenario=../scenarios/<x>.scenario.json" [ms]` (prints page errors)
- FPS on the real GPU (opens a browser window): `node tools/fps.js 12` -> `docs/proof/phase-N/fps.md`

## Layout
- `src/sim/config.js` TUNING (= game.contract.json) + RULES (other standard numbers). `src/sim/maps.js` the 3 standard maps.
- `src/sim/game.js` `step()` follows the ticket's mandatory 12-step tick order; keep the numbered comments in sync.
- `src/io.js` scenario/inputs validation (bad format -> FormatError -> exit 2).
- `web/` renderer + menus/HUD/audio only: never put game rules here.
- `scenarios/*.scenario.json` (+ optional `.inputs.json`) carry `night` and an `expect` block, auto-checked by `tests/cli.test.js`.

## Rules
- Contract output is graded byte-for-byte: no `Math.random`, no `Date`, no iteration over unordered data in `src/sim`.
- Ticket numbers are law: changing `config.js` => update `game.contract.json` (contract.test.js enforces the standard values).
- Expected values in tests/scenarios are derived by hand from the ticket (write the derivation in `_why`), never copied from program output.
- Avoid float boundaries in hand-computed scenarios (e.g. start 3.05 m, not 3.0 m) so the expected tick is unambiguous.
- Map angles: x = r·cos θ, z = r·sin θ. Use the map's `heightAt` for ground; `null` = void (fall).
- Creative extras must be render-only or disabled in headless; headless output must not change.
- A ticket that replaces an old rule: edit/remove the old test **with a reason** in `docs/notes/phase-N.md`; never skip silently.
- Do not invent requirements: put every assumption in `docs/notes/phase-N.md` (Đêm 3 start is one; ask the TA).
- In scenarios, Mây's move `[x, z]` with yaw 0: `[1,0]` is **+X**, `[0,1]` is +Z (an AI slip in Phase 2 used `[-1,0]` for +X).
