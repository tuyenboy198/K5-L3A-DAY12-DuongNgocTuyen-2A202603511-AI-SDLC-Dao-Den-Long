// Ticket-04 §1 benchmark scene: Night 1, 200 wandering shades + 100 motes spread over the island (seeded),
// L1-L3 lit with fuel 100, Mây still at (0,0,0). g.bench switches off spawning, damage, pickup, fuel decay and the end.
import { createGame, mulberry32 } from './game.js';
import { TUNING as T, RULES as R } from './config.js';
import { MAPS } from './maps.js';

export const BENCH = { shades: 200, motes: 100, litIds: ['L1', 'L2', 'L3'], islandR: 38 };

export function createBenchGame(seed = 42) {
  const map = MAPS[1], rng = mulberry32(seed);
  const lit = map.lanterns.filter((L) => BENCH.litIds.includes(L.id));
  const point = () => { // uniform over the disk, outside the lit safe zones (shades there would be pushed out anyway)
    for (;;) {
      const r = BENCH.islandR * Math.sqrt(rng()), a = rng() * 2 * Math.PI, x = r * Math.cos(a), z = r * Math.sin(a);
      if (lit.every((L) => Math.hypot(x - L.pos[0], z - L.pos[2]) >= T.safe_radius)) return [x, 0, z];
    }
  };
  const g = createGame({ seed, night: 1, scenario: {
    random_motes: false, random_shades: false, random_drifters: false,
    player: { pos: [0, 0, 0] },
    lanterns: BENCH.litIds.map((id) => ({ id, lit: true, fuel: T.fuel_max })),
    motes: Array.from({ length: BENCH.motes }, point),
    shades: Array.from({ length: BENCH.shades }, (_, i) => { const [x, , z] = point(); return { id: `S${i + 1}`, pos: [x, R.shadeY, z], state: 'wander' }; }),
  } });
  g.bench = true;
  return g;
}
