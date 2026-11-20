# Phase 2: Ticket-02 "Ba hòn đảo" (Test Contract v1.1)

## 1. Thay đổi so với Phase 1 và cách xử lý

Ticket-02 bắt buộc dùng **số chuẩn**, thay mọi số Phase 1 tự chọn. Toàn bộ `src/sim/game.js` được viết lại theo **thứ tự 12 bước trong một tick** của ticket (mỗi bước có comment đánh số trong code).

| Luật Phase 1 (của tôi) | Luật Phase 2 (chuẩn) | Test cũ bị ảnh hưởng và cách xử lý |
|---|---|---|
| Đèn cần 5, nạp trong 2.5 m | 10, trong 2.0 m | `deposit_win` tính lại: L1 nạp sẵn 5, dừng ở z = 23.1, thắng ở tick 33 |
| Điểm khi **nhặt** đom đóm | **+10 mỗi đom đóm nạp vào đèn**; +5 mỗi lần Tỏa Sáng trúng | Test điểm sửa lại theo luật mới |
| Tỏa sáng 2 / 6 m / 1.5 s, đẩy 4 m tức thì, choáng 3 s | 3 / 5 m (3D, tâm = chân + 0.8) / 3 s, đẩy 4 m trong 15 tick, choáng 120 tick | `pulse_stun` tính lại: bị đánh ở tick 230 |
| Bóng Mực luôn đuổi, 3.5 m/s | wander/chase (phát hiện 12 m, bỏ đuổi 18 m), 4 m/s (Đêm 3: 4.5), có recoil 60 tick | `shade_hit_lose` tính lại: đánh ở tick 31 và 121 |
| Bất tử 2 s | 90 tick | như trên |
| Vùng an toàn 5 m | 6 m, Bóng ở trong lúc đèn vừa thắp bị đẩy ra trong 30 tick | `safe_lantern` giữ ý, đổi số; thêm test đẩy ra |
| Đảo r = 48, không rơi | r = 40, **rơi khỏi đảo** (Y < −10) | Bỏ test "rào vô hình"; thay bằng scenario `fall` |
| 30 đom đóm ngẫu nhiên mọi chỗ, cứ 3 s thêm 1 | 20 đom đóm tại 20 **điểm chuẩn**, trần 30, thêm 1 ở tick 240k | Test số lượng sửa theo số mới |
| 1 Bóng ở tick 300, cứ 1200 tick thêm 1 | 2 Bóng ở tick 300, sau đó cứ 480/420/360 tick (theo Đêm), trên các điểm chuẩn | Test spawn sửa: S1, S2 ở tick 300, S3 ở tick 780 |
| Snapshot v1.0 | v1.1: thêm `night`, `wind`, `player.{vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s}`, `motes[].kind/ttl_s`, `drifters`, `charms` | Test CLI kiểm tra cấu trúc mới |

Không có test nào bị tắt. Mọi test cũ đều được **tính lại bằng tay theo số chuẩn**, phần tính ghi trong `_why` của từng scenario.

## 2. Giả định cho chỗ ticket chưa quy định

| Chỗ chưa rõ | Giả định | Lý do |
|---|---|---|
| **Điểm xuất phát Đêm 3** | **(0, 0, −30)**, quay về +Z | Theo bản đồ, (0,0,0) nằm trong tháp chuông và dưới tầng 2, không đứng được. **Cần hỏi trợ giảng** |
| Quy ước góc | x = r·cos θ, z = r·sin θ | Chỉ với quy ước này thì tầng 1, dốc 30°/150° và các điểm đom đóm tầng 1 mới nằm ở z > 0 như ticket mô tả |
| Tăng tốc/dừng ≤ 0.1 s | Tức thời (0 s) | Thỏa ≤ 0.1 s và dễ đoán vị trí nhất |
| Độ cao của Bóng Mực | Lơ lửng ở mặt đất + 1 m (đặt lại mỗi khi di chuyển) | "Chênh cao ≤ 1.5" thì Bóng ở tầng 0 không chạm được Mây ở tầng 1 (cao 3 m) |
| Trạng thái `spawning` | 30 tick, không đi, không gây sát thương | Ticket chỉ nói "thực thể mới tương tác từ tick sau" |
| Tốc độ `wander` | 1.5 m/s về một điểm ngẫu nhiên (theo seed) trong 6 m | Không quy định |
| Recoil | Lùi theo hướng ra xa Mây, 2/60 m mỗi tick | "lùi 2 m trong 60 tick" |
| Bóng đang bị đẩy ra khỏi vùng đèn vừa thắp | Vẫn giữ trạng thái cũ trong snapshot; không gây sát thương 30 tick | Ticket không đặt tên trạng thái cho việc này |
| "Vật cản" khi đẩy lùi | Tháp chuông và vùng an toàn của đèn đã thắp | Hai vật cản duy nhất có trên bản đồ |
| `player.invuln` | Kiểu boolean | Các trường khác có hậu tố `_s` là giây; `invuln` không có hậu tố |
| `night_start` | Event của bước đầu tiên (tick 1) | Giữ dòng đầu tiên là snapshot tick 0; event bước k gắn tick k+1 |
| Gió Lạc: "điểm sương" | Dùng các điểm sinh Bóng Mực của Đêm đó | Không quy định |
| Gió Lạc chạm khi Mây không mang gì | Không cướp | min(3, 0) = 0, không có gì để cướp |
| Gió Lạc ở trạng thái `removed` | Vẫn giữ trong mảng `drifters` với `state: "removed"` | `removed` được liệt kê là một trạng thái |
| Lướt khi đang bay bằng bục nhảy | Được phép; hết lướt thì tiếp tục quỹ đạo bục | "vẫn được lướt" |
| Hướng gió | Số nguyên độ, chọn theo seed khi bắt đầu cơn gió; khi lặng, `dir_deg` giữ hướng cơn gió trước (0 lúc đầu) | Không quy định |
| Tương tác đèn theo chiều cao | XZ ≤ 2.0 và chênh cao ≤ 1.5 | Để không nạp được đèn L2 (tầng 1) khi đang đứng ở tầng 0 ngay dưới |

## 3. Spec và tiêu chí nghiệm thu (Phần 3: tính năng mới)

| # | Tính năng | Tiêu chí nghiệm thu (kiểm chứng được) | Kiểm chứng |
|---|---|---|---|
| F1 | Gió Lạc | (a) chỉ sinh ở Đêm 2, 3: D1 ở tick 1200, tối đa 2 con; (b) `idle` cho tới khi Mây mang ≥ 5 và cách ≤ 15 m thì `chase` 7 m/s; (c) chạm XZ ≤ 1.2: cướp min(3, đang mang), `flee` 240 tick rồi `removed`, mỗi con cướp 1 lần; bất tử không ngăn được; (d) Tỏa Sáng trúng lúc `chase` thì `flee` mà không cướp; trúng lúc `flee` có mang đồ thì thả lại hết thành đom đóm rơi (`drifter_drop`), biến mất sau 120 tick; (e) không làm mất Ngọn Lửa | scenario `drifter`; test `drifter: idle unless…`, `pulse on a chasing drifter…`, `drifters spawn at tick 1200…` |
| F2 | Bùa Gió | (a) vị trí: Đêm 2 (35,0,0), Đêm 3 (±30,0,25); (b) nhặt như đom đóm, phát `charm_picked {charm_id, charm_ticks: 600}`; (c) trong 600 tick: chạy 7.2 m/s, Lướt không hồi chiêu nhưng phải nhấn lại, nhấn khi đang lướt thì bỏ qua; (d) bùa xuất hiện lại sau 2700 tick | scenario `charm`; test `charm: speed 7.2…` |
| F3 | Chuỗi 3 Đêm | Menu → giới thiệu Đêm (tên đảo + lời Ông Đăng) → chơi → kết quả → Đêm kế tiếp; thắng Đêm 3 thì hiện màn Bình Minh với tổng điểm; thua thì có nút "Chơi lại Đêm" | Chơi thử bằng tay; ảnh chụp; code `introNight`/`endNight` trong `web/main.js` |
| F4 | Tạm dừng | Esc/P: logic dừng hẳn; menu có Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. Headless: `pause` làm `tick` vẫn tăng nhưng `sim_tick`, thời gian, hồi chiêu đứng yên; snapshot ghi `paused`; có event `paused`/`resumed` | scenario `pause`; test `pause freezes sim_tick…` |
| F5 | Cài đặt | Âm lượng và độ nhạy chuột, lưu vào `localStorage` (vẫn chạy được khi trình duyệt chặn bộ nhớ) | Chơi thử bằng tay |
| F6 | Âm thanh | Nhạc nền đêm và hiệu ứng: nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối | Bảng `SFX` trong `web/main.js`; nghe thử bằng tay |
| F7 | HUD | Ngọn Lửa trên trái; mm:ss trên giữa, đỏ và nhấp nháy khi ≤ 30 s; đèn k/n và điểm trên phải; thanh 10 ô đom đóm dưới giữa; hồi chiêu Lướt và Tỏa Sáng dưới phải; "E — Nạp ánh sáng (x/10)" khi gần đèn; mũi tên chỉ đèn chưa sáng gần nhất khi nó ngoài màn hình | Ảnh chụp `night1-hud.png`, `night3-tiers-tower.png` |
| F8 | Bảng màu | Các thành phần liệt kê dùng đúng hex chuẩn (không tone mapping); ánh sáng môi trường = 0.15 + 0.55 × đèn sáng / tổng đèn | Hằng `C` trong `web/main.js`; `ambient.intensity` |
| F9 | Lướt (Phần 1) | 14 m/s trong 12 tick (2.8 m), hồi chiêu 90 tick tính từ lúc bắt đầu; hướng di chuyển, nếu đứng yên thì hướng đang quay mặt; trên không giữ nguyên độ cao | scenario `dash`; test `dash: …`, `dash in the air…` |
| F10 | Bản đồ (Phần 2) | Đêm 2: hai đảo, cầu, bục nhảy đưa sang đảo kia; Đêm 3: 3 tầng, vách chặn, dốc lên tầng 1, bục lên tầng 2, tháp không leo được, gió mỗi 30 s đẩy 2 m/s | scenario `jump_pad`; test `night 2…`, `night 3 tiers…`, `night 3 jump pad…`, `night 3 wind…` |
| F11 | Rơi khỏi đảo | Y < −10: −1 Ngọn Lửa, mất hết đom đóm (`lost`), chờ 60 tick, hồi sinh ở điểm xuất phát với bất tử 90; hết Ngọn Lửa thì thua ngay | scenario `fall`; 2 test |
| F12 | Hiệu năng | Headless một Đêm đủ 21.600 tick ≤ 30 s; bản thường ≥ 30 FPS trung bình ở 1280×720 | `verify-report.md` mục 3; `fps.md` |

## 4. Đánh giá Phase 2

- **Đạt:** Phần 1 (số chuẩn), Phần 2 (3 bản đồ), Phần 4 (contract v1.1), F1–F12. Có 66 test, trong đó 13 scenario headless tính tay, mỗi tính năng mới ít nhất 1 scenario.
- **Hồi quy Phase 1:** mọi luật Phase 1 vẫn có test, đã tính lại theo số chuẩn; không test nào bị tắt.
- **Hiệu năng:** headless chạy một Đêm mất ≤ 0.3 s; bản thường đạt 64–84 FPS ở 1282×722 trên GPU tích hợp AMD Radeon.
- **Giới hạn / chưa đạt:**
  - F3, F5, F6 (luồng menu, cài đặt, âm thanh) chỉ kiểm bằng tay, chưa có test tự động.
  - Bảng màu chỉ kiểm qua code, chưa đo pixel trong ảnh. Ánh sáng và bloom làm màu thực tế trên màn hình khác hex gốc.
  - Điểm xuất phát Đêm 3 là giả định (xem mục 2).
- **AI sai ở đâu:** xem [ai-log.md](ai-log.md).
