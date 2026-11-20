# Test Contract v1.3: tóm tắt (nguồn: Ticket-04 §1, §2, §3, §6; nền là v1.2)

- `contract_version: "1.3"`. Mọi yêu cầu v1.0–v1.2 giữ nguyên.
- `game.contract.json` thêm:
  - `bench_cmd` = `node tools/bench.js`
  - `soak_cmd` = `node --expose-gc --max-semi-space-size=1 --no-opt --no-maglev tools/soak.js`
- **Bench:** `<bench_cmd> --seed 42 --duration 30 --out bench.json`
  - Kết quả là `{contract_version, avg_fps, p1_low_fps, frame_ms_p95, frames, load_ms, peak_mem_mb, vsync_off, renderer, os}`.
  - `avg_fps = 1000·N/Σdt`.
  - 1% low: k = max(1, ceil(0.01·N)) khung chậm nhất, lấy 1000 / trung bình của chúng.
  - p95: phân vị 95 của dt theo nearest-rank.
- **Soak:** `<soak_cmd> --seed 7 --nights 10 --out soak.json`
  - Kết quả là `{nights, crashes, results[], mem_start_mb, mem_end_mb, duration_s}`.
  - Đạt khi crashes = 0 và mem_end_mb ≤ 1.2 × mem_start_mb.
- **Bảng xếp hạng:** `<run_cmd> --export-leaderboard out.json`
  - `run_cmd` = `node tools/serve.js`.
  - Kết quả là `{"entries": [{name, score, nights_won, achieved_at, seed}, …]}`: tối đa 10 mục, điểm giảm dần, bằng điểm thì ai đạt trước đứng trên.
