# Phase 1: truy vết yêu cầu → bằng chứng

Chạy lại ở tag `phase-1`: `npm test` và `npm run verify -- phase-1`. Kết quả nằm trong [verify-report.md](verify-report.md).

| ID | Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| R1 | Đi, nhảy, camera | Unit test: tốc độ, xoay theo yaw, chuẩn hóa vector, nhảy, rào đảo; ảnh chụp camera góc nhìn thứ ba | `tests/rules.test.js` (5 test), [screenshot-start.png](screenshot-start.png) | ĐẠT |
| R2 | Đom đóm nhặt được | Đúng biên pickup ≤ 1 m (mote đặt đúng 1.000 m vẫn nhặt), giới hạn capacity, 30 con mặc định | `rules.test.js`, scenario `deposit_win` | ĐẠT |
| R3 | Nạp, thắp đèn | Nạp đủ, nạp một phần, ngoài tầm, giữ phím không nạp lặp | `rules.test.js`, scenario `deposit_win` | ĐẠT |
| R4 | Bóng Mực sinh ra và đuổi | `shade_spawned` ở tick 300; quãng đi được = 3.5 m/s | `rules.test.js` | ĐẠT |
| R5 | Bị chạm mất máu | Tính tay: chạm ở tick 35, lần sau ở 156 (bất tử 120 tick), số rơi floor(·0.5) | scenario `shade_hit_lose`, `rules.test.js` | ĐẠT (biên đúng 1.000 m chưa có test riêng, xem notes) |
| R6 | Tỏa sáng | Tính tay: đẩy 5 → 8.942 m, choáng 180 tick, chạm lại ở tick 318; cost; cooldown 90 tick | scenario `pulse_stun`, `rules.test.js`, [screenshot-pulse.png](screenshot-pulse.png) | ĐẠT |
| R7 | Sợ đèn | 600 tick đứng tại đèn đã thắp: Bóng Mực không bao giờ < 5 m, không chạm; đèn tắt thì không đẩy | scenario `safe_lantern`, `rules.test.js`, [screenshot-safe-lantern.png](screenshot-safe-lantern.png) | ĐẠT |
| R8 | Thắng, thua, điểm, HUD, chơi lại | won/all_lit với điểm tính tay 898; lost/no_flames; lost/dawn; HUD trong ảnh; chơi lại bằng Enter/R | scenario `deposit_win`, `shade_hit_lose`, `dawn`; ảnh chụp | ĐẠT (chơi lại chỉ kiểm bằng tay) |
| C1 | `game.contract.json` | So sánh deep-equal với `src/sim/config.js`; có đủ mọi khóa | `tests/contract.test.js` | ĐẠT |
| C2 | CLI và exit code | 4 kiểu inputs hỏng và 3 kiểu scenario hỏng → 2; thiếu `--seed` → ≠ 0 kèm stderr | `tests/cli.test.js` | ĐẠT |
| C3 | Tick model, JSONL | Snapshot 0/10/…/50, `--snapshot-every`, thứ tự khóa, dòng end, làm tròn 3 chữ số, dừng sớm khi kết thúc | `tests/cli.test.js` | ĐẠT |
| C4 | Tất định | Chạy CLI 2 lần cùng seed → giống từng byte; seed khác → khác | `cli.test.js`, [verify-report.md](verify-report.md) mục 2 | ĐẠT |
| C5 | macOS/Linux | Node thuần; CI chạy ubuntu-latest + macos-latest | `.github/workflows/ci.yml` (tab Actions) | ĐẠT: lần chạy CI đầu tiên trên commit `0404ab6` (tag phase-1) xanh trên cả ubuntu và macos (cập nhật sau khi tag) |

## Kiểm tra độ mạnh của test (mutation thủ công)

Cố ý sửa sai một dòng logic, chạy `npm test`, rồi khôi phục:

| Lỗi cài vào | Số test fail |
|---|---|
| `pickup <=` → `<` | 1 |
| `interact <=` → `<` | 1 |
| invuln ngắn đi 1 tick | 2 |
| Đèn chưa thắp cũng đẩy Bóng Mực | 1 |
| Bỏ event `deposit` | 3 |
| `player_speed` 6 → 7 trong config | 2 (Stop hook chặn: exit 2) |
| `shade_hit <=` → `<` | **0** (lọt: biên đúng 1.000 m không xảy ra trong test) |
