# Changelog

## phase-2 (Ticket-02, Test Contract v1.1)
- Standard numbers everywhere; sim rewritten to the mandatory 12-step tick order.
- Three standard maps (Đảo Bến / Đảo Cau / Đảo Chuông): bridge, jump pads, tiers, ramps, bell tower, wind.
- Dash, fall off the island + respawn, dropped motes, shade states (spawning/wander/chase/recoil/stunned), safe-zone expel.
- Gió Lạc (drifters), Bùa Gió (charms), pause; snapshot/scenario/input/event additions of v1.1.
- UI: 3-night flow with intros and Bình Minh screen, pause menu, persisted settings, music + SFX, required HUD layout, off-screen lantern arrow, standard palette.
- 66 tests incl. 13 hand-computed scenarios; verify covers nights 1-3; real-GPU FPS benchmark (tools/fps.js).

## Unreleased (visual upgrade, render-only)
- New renderer: bloom, ACES tone mapping, soft shadows, 1.5x supersampling; sky dome with stars/moon, cloud sea, floating islands, crystals, mushrooms, stone paths.
- Animations: Mây walk cycle, pendulum hat lantern, jump stretch/landing squash; Shade wobble, tentacles, spawn, stun spin.
- Interactions (visual): mote flies into Mây's lantern, deposit stream to lantern, lit burst, barrier flinch, hit knockback + shake, pulse shockwave.
- Replay mode (?inputs, ?ff), occluder fading, new HUD and end-of-run stats.
- Headless output unchanged (same determinism hash as phase-1).

## phase-1
- Night 1 playable in the browser (Three.js): move, jump, 3rd-person camera, fireflies, 5 lanterns, Shades, pulse, win/lose, score, HUD, replay.
- Headless mode + `game.contract.json` per Test Contract v1.0; deterministic output.
- 44 tests (rules, CLI, contract, hand-computed scenarios), `npm run verify`, CI on ubuntu + macOS.
- Harness: CLAUDE.md, `verify-phase` skill, Stop hook blocking finish on red tests.
