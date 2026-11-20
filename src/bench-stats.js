// Ticket-04 §1 frame statistics from per-frame times dt (ms).
export function benchStats(dts) {
  const n = dts.length, sum = dts.reduce((a, b) => a + b, 0);
  const desc = [...dts].sort((a, b) => b - a), k = Math.max(1, Math.ceil(0.01 * n));
  const worst = desc.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const asc = desc.reverse(), p95 = asc[Math.max(0, Math.ceil(0.95 * n) - 1)]; // nearest-rank percentile
  const r1 = (v) => Math.round(v * 10) / 10;
  return { avg_fps: r1((1000 * n) / sum), p1_low_fps: r1(1000 / worst), frame_ms_p95: r1(p95), frames: n };
}
