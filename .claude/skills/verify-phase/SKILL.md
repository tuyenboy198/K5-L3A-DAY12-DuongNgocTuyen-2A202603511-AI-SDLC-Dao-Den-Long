---
name: verify-phase
description: Run all checks for the current phase and save evidence (test report, determinism + full-night timing, FPS, screenshots) under docs/proof/phase-N. Use before tagging a phase or when asked to "verify", "prove", or "collect evidence".
---

1. `npm test` — must be green. If red, fix the code (not the expectation) unless the ticket changed the rule; then note it in `docs/notes/phase-N.md`.
2. `npm run verify -- phase-N` — writes `docs/proof/phase-N/verify-report.md` (tests, byte-determinism of nights 1-3, full-night headless time vs the 30 s limit).
3. For each new rule in the ticket, make sure a scenario in `scenarios/` covers it (set `"night"`), with expected events computed by hand in `_why`. Run it once and compare with your hand result before trusting it.
4. Quick mutation check for new rules: break one line with `sed` into the file, confirm `npm test` fails, restore. If nothing fails, the test is weak — strengthen it. Always `cmp` the mutated file to make sure the mutation actually applied.
5. Visual requirements: `node tools/screenshot.js docs/proof/phase-N/<name>.png "night=K&scenario=../scenarios/<x>.scenario.json[&inputs=..&ff=N]" 3000`, then open the PNG and check it really shows the requirement; fix any `page:` errors it prints.
6. FPS requirement: `node tools/fps.js 12` (real GPU window, retries on a stuck launch) -> `docs/proof/phase-N/fps.md`. Release checks (Ticket-04): `node tools/bench.js --seed 42 --duration 30 --out bench.json`, `npm run soak`, `node tools/e2e-ui.js docs/proof/phase-N/e2e-ui.md`; commit bench.json + soak.json.
7. Update `docs/proof/phase-N/traceability.md`: requirement -> how verified -> evidence file -> ĐẠT / CHƯA ĐẠT (+ reason).
8. Commit evidence together with the code it proves (evidence must match the tag), then `git tag phase-N`.
