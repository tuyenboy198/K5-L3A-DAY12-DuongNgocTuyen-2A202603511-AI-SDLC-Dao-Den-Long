# Phase 2: truy vết yêu cầu → bằng chứng

Chạy lại ở tag `phase-2`:
- `npm test` (66 test)
- `npm run verify -- phase-2`: ra [verify-report.md](verify-report.md), gồm test, tất định cho 3 Đêm, thời gian chạy một Đêm
- `node tools/fps.js 12`: ra [fps.md](fps.md)

| Yêu cầu Ticket-02 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Số chuẩn = `game.contract.json` v1.1 | So sánh deep-equal với các số trong ticket | `tests/contract.test.js` | ĐẠT |
| Chạy, nhảy, lướt | 6 m/s; đỉnh nhảy 1.225 m, không nhảy kép; lướt 2.8 m, hồi chiêu 90 tick, trên không giữ độ cao | `rules.test.js`, scenario `dash` | ĐẠT |
| Nhặt (XZ ≤ 1, chênh cao ≤ 1.5), sức chứa 10 | Đúng biên 1.0; điểm cao 1.6 m không nhặt được; đầy 10 thì không nhặt thêm | `rules.test.js` | ĐẠT |
| 20 đom đóm tại 20 điểm chuẩn, thêm 1 ở tick 240 | Đếm số lượng và đối chiếu với `motePoints` | `rules.test.js` | ĐẠT |
| Đèn: 10, nạp nhiều lần, 2.0 m, gần nhất, hòa thì id nhỏ hơn | Nạp 4 rồi nạp thêm 3 vào đèn có sẵn 7; ngoài tầm; hai đèn cách bằng nhau | `rules.test.js`, scenario `deposit_win` | ĐẠT |
| Vùng an toàn 6 m; đẩy ra trong 30 tick | Không vào được vùng; tick 15 cách đèn 4.25 m, tick 30 cách 6.0 m, không có hit | `rules.test.js`, scenario `safe_lantern` | ĐẠT |
| Tỏa Sáng 3 / 5 m (3D) / 3 s; choáng 120; đẩy 4 m trong 15 tick; làm mới; +5 | Bóng B có XZ 4 m nhưng 3D 5.12 m thì không trúng; vị trí sau 15 và 60 tick; lần Tỏa Sáng thứ hai ở tick 181 | `rules.test.js`, scenario `pulse_stun` | ĐẠT |
| Bóng Mực: phát hiện 12 / bỏ đuổi 18, 4 (4.5) m/s, đủ 5 trạng thái | Ở 12.5 m vẫn `wander`; tốc độ đuổi; Mây chạy xa thì về `wander` | `rules.test.js` | ĐẠT |
| Lịch sinh 2 con ở tick 300, rồi mỗi 480 tick; id theo thứ tự | S1, S2 ở tick 300, S3 ở tick 780, ở r = 37 | `rules.test.js` | ĐẠT |
| Bị đánh: −1, rơi floor(n/2) ra vành 1.5–2.5 m (ttl 480), bất tử 90, recoil, tối đa 1 lần/tick | Kiểm vành rơi, `ttl_s` = 8, đúng 480 tick thì mất; hai Bóng cùng chạm chỉ trừ 1 | `rules.test.js`, scenario `shade_hit_lose` | ĐẠT |
| Rơi khỏi đảo | Hit do rơi ở tick 66 với `lost` 4, hồi sinh ở (0,0,0) tại tick 126; mạng cuối thì thua | scenario `fall`, 2 test | ĐẠT |
| Thắng/thua theo thứ tự chuẩn | Thắng đúng tick hết giờ vẫn tính thắng | `rules.test.js` | ĐẠT |
| Bản đồ Đêm 1 / 2 / 3 | Chiều cao mặt đất; cầu; vách; dốc lên Y = 3; tháp; hai loại bục nhảy | 5 test bản đồ, scenario `jump_pad`, ảnh `night2-bridge-charm.png`, `night3-tiers-tower.png` | ĐẠT |
| Gió Đêm 3 | Bật ở sim tick 1800 trong 300 tick, đẩy 2 m/s; Đêm 1 không có | `rules.test.js` | ĐẠT |
| Gió Lạc (F1) | Cướp ở tick 16, rơi lại ở tick 21; `chase` thì chuyển `flee`; `removed` sau 240 tick | scenario `drifter`, 3 test, ảnh `night2-drifter.png` | ĐẠT |
| Bùa Gió (F2) | Nhặt ở tick 6; lướt liên tục, nhấn lúc đang lướt bị bỏ qua; 7.2 m/s; xuất hiện lại sau 2700 tick | scenario `charm`, `rules.test.js` | ĐẠT |
| Pause (F4) | Event `paused`/`resumed`; `sim_tick`, thời gian, hồi chiêu đứng yên | scenario `pause`, `rules.test.js` | ĐẠT |
| Contract v1.1: `--night 1/2/3`, trường snapshot mới, input/scenario mới, sai định dạng → 2 | Kiểm cấu trúc; Đêm 4 bị từ chối; trạng thái Bóng lạ → exit 2 | `tests/cli.test.js` | ĐẠT |
| Một Đêm headless đủ (21.600 tick) ≤ 30 s | Đo thời gian | `verify-report.md` mục 3 (≤ 0.3 s), `cli.test.js` | ĐẠT |
| ≥ 30 FPS ở 1280×720 | Cửa sổ trình duyệt thật, GPU thật, 12 s mỗi Đêm | [fps.md](fps.md): 83.7 / 69 / 64.4 FPS | ĐẠT |
| Chuỗi 3 Đêm, cài đặt, âm thanh (F3, F5, F6) | Chơi thử bằng tay | — | ĐẠT một phần: chưa có test tự động |
| HUD, bảng màu (F7, F8) | Ảnh chụp; hằng màu trong code | [night1-hud.png](night1-hud.png) | ĐẠT (màu chỉ kiểm qua code, chưa đo pixel) |
| AGENTS/CLAUDE.md và skill cập nhật | Lịch sử git | `git log -- CLAUDE.md .claude/` | ĐẠT |

## Kiểm tra độ mạnh của test (mutation thủ công, Phase 2)

| Lỗi cài vào | Số test fail |
|---|---|
| Gió Lạc đang `flee` không thả đồ khi trúng Tỏa Sáng | 1 |
| Bỏ chế độ pause trong sim | 2 |
| Ngưỡng rơi −10 → −20 | 2 |
| Bỏ việc đẩy Bóng ra khỏi vùng đèn vừa thắp | 0 ở lần đầu → thêm kiểm tra vị trí ở tick 15 → **1** |
| Bỏ điều kiện "nhặt từ tick sau" | 0: điều kiện này thừa (đom đóm luôn được tạo sau bước 4), nên đã xóa khỏi code |
| Lướt với Bùa vẫn đặt hồi chiêu | 0: tương đương code gốc (điều kiện `charm > 0` vẫn cho lướt) |
