---
name: verify-phase
description: Run all checks for the current phase and save evidence (test report, determinism hashes, screenshots) under docs/proof/phase-N. Use before tagging a phase or when asked to "verify", "prove", or "collect evidence".
---

1. `npm test` — must be green. If red, fix the code (not the expectation) unless the ticket changed the rule; then note it in `docs/notes/phase-N.md`.
2. `npm run verify -- phase-N` — writes `docs/proof/phase-N/verify-report.md` (tests + byte-determinism of the CLI + environment).
3. For each new rule in the ticket, make sure a scenario in `scenarios/` covers it, with expected events computed by hand in `_why`.
4. Visual requirements: `node tools/screenshot.js docs/proof/phase-N/<name>.png "scenario=../scenarios/<x>.scenario.json" 3000`, then open the PNG and check it really shows the requirement.
5. Update `docs/proof/phase-N/traceability.md`: requirement -> how verified -> evidence file -> PASS / CHƯA ĐẠT (+ reason).
6. Commit evidence together with the code it proves (evidence must match the tag).
