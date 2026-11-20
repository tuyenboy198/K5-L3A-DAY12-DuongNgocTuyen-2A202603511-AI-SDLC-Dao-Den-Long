// Standard maps from Ticket-02 Part 2. Angles are measured from +X counter-clockwise seen from above:
// x = r·cos(θ), z = r·sin(θ) (this is the convention that puts tier 1 / ramps / tier-1 motes at z > 0).
const rad = (d) => (d * Math.PI) / 180;
const ring = (n, r, startDeg, stepDeg, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => { const a = rad(startDeg + i * stepDeg); return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)]; });
const lanterns = (list) => list.map((pos, i) => ({ id: `L${i + 1}`, pos }));
const hyp = Math.hypot;

const RAMPS = [30, 150].map((d) => [Math.cos(rad(d)), Math.sin(rad(d))]);

export const MAPS = {
  1: {
    night: 1, name: 'Đảo Bến', duration_s: 300, shadeSpeed: 4.0, shadeEvery: 480, shadeMax: 6,
    start: [0, 0, 0],
    // returns surface height at (x,z), or null over the cloud sea (fall)
    heightAt: (x, z) => (hyp(x, z) <= 40 ? 0 : null),
    islands: [{ c: [0, 0], r: 40 }],
    lanterns: lanterns([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
    motePoints: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
    shadePoints: ring(12, 37, 15, 30),
    pads: [], charms: [], drifters: false, wind: false,
  },
  2: {
    night: 2, name: 'Đảo Cau', duration_s: 330, shadeSpeed: 4.0, shadeEvery: 420, shadeMax: 8,
    start: [0, 0, 0],
    heightAt: (x, z) => (hyp(x, z) <= 28 || hyp(x - 70, z) <= 28 || (x >= 26 && x <= 44 && Math.abs(z) <= 2) ? 0 : null),
    islands: [{ c: [0, 0], r: 28 }, { c: [70, 0], r: 28 }],
    bridge: { x: [26, 44], z: [-2, 2] },
    lanterns: lanterns([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
    motePoints: [...ring(4, 10, 0, 90), ...ring(8, 22, 0, 45), ...ring(4, 10, 0, 90, 0, 70), ...ring(8, 22, 0, 45, 0, 70)],
    shadePoints: [...ring(8, 26, 22.5, 45), ...ring(8, 26, 22.5, 45, 0, 70)],
    pads: [
      { pos: [20, 0, 18], vy: 14, h: 24, toward: [70, 0] },
      { pos: [50, 0, -18], vy: 14, h: 24, toward: [0, 0] },
    ],
    charms: [[35, 0, 0]], drifters: true, wind: false,
  },
  3: {
    night: 3, name: 'Đảo Chuông', duration_s: 360, shadeSpeed: 4.5, shadeEvery: 360, shadeMax: 10,
    start: [0, 0, 0],
    heightAt: (x, z) => {
      const r = hyp(x, z);
      if (r > 45) return null;
      if (r <= 2) return 14;           // bell tower: an unclimbable wall
      if (r <= 8) return 6;            // tier 2
      for (const [ux, uz] of RAMPS) {  // ramps: foot r=30 (Y=0) -> top r=24 (Y=3), 3 m wide
        const s = x * ux + z * uz, t = -x * uz + z * ux;
        if (Math.abs(t) <= 1.5 && s >= 24 && s <= 30) return (3 * (30 - s)) / 6;
      }
      if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1
      return 0;
    },
    islands: [{ c: [0, 0], r: 45 }],
    tower: { r: 2, top: 14 },
    ramps: [30, 150],
    lanterns: lanterns([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
    motePoints: [...ring(18, 34, 0, 20), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
    shadePoints: ring(16, 43, 0, 22.5),
    pads: [{ pos: [0, 3, 13], vy: 12, h: 8, dir: [0, -1] }],
    charms: [[30, 0, 25], [-30, 0, 25]], drifters: true, wind: true,
  },
};
