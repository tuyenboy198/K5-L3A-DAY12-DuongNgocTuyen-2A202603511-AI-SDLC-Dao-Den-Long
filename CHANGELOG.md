# Changelog

## v1.0.0 / phase-4 (Ticket-04 "Bình minh", Test Contract v1.3)
- contract_version 1.3: `bench_cmd` (`node tools/bench.js`) and `soak_cmd` added; `run_cmd` is now `node tools/serve.js` (same program as `npm run play`) so `--export-leaderboard` reaches it. No gameplay rule changed; headless output is byte-identical to phase-3.
- Benchmark mode: standard scene (Night 1, 200 wandering shades, 100 motes, L1-L3 lit), real browser window at 1280x720 with vsync off, 3 s warm-up, avg / 1% low / p95 / load / peak memory -> bench.json. Shades are now drawn instanced (~1800 draw calls -> 5).
- Soak test: 10 nights in one process with seeded random input -> soak.json.
- Local leaderboard: name entry after a loss or at dawn (Vietnamese names accepted), top 10 on disk (data/leaderboard.json), menu screen, `--export-leaderboard`.
- Accessibility: rebind every action (duplicate warning, reset, saved), captions + edge arrow for new shades, wind / last 10 s / low-fuel cues, reduced motion, all UI text >= 18 px at 1280x720 and a x1.25 large-text option.
- Docs: README (requirements, bench, soak, leaderboard), ADR 0002, phase-4 notes, retro; tools/e2e-ui.js end-to-end UI check.

## phase-3 (Ticket-03 "Đèn cạn dầu", Test Contract v1.2)

### BREAKING CHANGES
- contract_version 1.2; tuning adds fuel_max, fuel_decay_per_s, fuel_per_mote, relight_cost, win_ratio, drain_per_s, low_fuel_threshold, capacity_max.
- Night durations 300/330/360 s -> **240/270/300 s**.
- Win rule replaced: no early win; **won/dawn_survived** if alive at dawn with >= ceil(0.6 x lanterns) lit, else lost/dawn. game_over reason **all_lit removed**.
- Score formula replaced: +5 per mote deposited (was +10), +100 first light, +40 relight, +5 (+15 if draining) per pulsed shade, dawn: 50 + floor(fuel) per lit lantern + 50 per flame; **time bonus removed** (score.per_second_left = 0).
- Lit lanterns burn fuel and can go out (lantern_out, deposited reset, relight costs 5); lit lanterns accept refuel (refuel event).
- Safe zone only while fuel >= 30. Shades gain state **drain** (fuel_drain event every 60 ticks); stun now always ends in wander.
- Carry capacity grows: 10 + 2 x successful lights (max 20).
- Snapshot: lanterns[].fuel/ever_lit/relit_count, player.capacity. lantern_lit gains relight. Scenario: lanterns[].fuel/ever_lit, player.successful_lights, shades[].target_lantern_id.

### Other
- UI: fuel bar + 1 Hz blink under 30, squashed/torn unlit lanterns, colour-blind palette setting (#00B3FF shades, white warnings with ⚠), HUD carried/capacity and lanterns needed, refuel/relight prompts.
- Design decision: docs/adr/0001-lantern-fuel-and-dawn-win.md.

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
