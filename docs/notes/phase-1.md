# Phase 1: PRD-0 + Test Contract v1.0

## 1. Bắt buộc (trích từ PRD-0) và tiêu chí nghiệm thu

| ID | Yêu cầu | Tiêu chí kiểm chứng được |
|---|---|---|
| R1 | Đi lại, nhảy, camera 3D | `move [0,1]` 60 tick → z = +6.000; yaw 90 → +X; nhảy thì y > 0 rồi về 0; camera góc nhìn thứ ba bám theo |
| R2 | Đom đóm rải rác, nhặt được | Mặc định 30 con; khoảng cách ≤ 1 m thì nhặt, phát `mote_picked`; không vượt 10 con |
| R3 | Nạp ánh sáng thắp đèn | Nhấn interact trong ≤ 2.5 m → `deposit`; đủ 5 → `lantern_lit` |
| R4 | Bóng Mực xuất hiện và đuổi | `shade_spawned` ở tick 300, sau đó cứ 1200 tick một con; tốc độ 3.5 m/s về phía người chơi |
| R5 | Bị chạm thì mất máu | Khoảng cách ≤ 1 m → `player_hit` (flames −1, rơi floor(carried·0.5)); bất tử 120 tick |
| R6 | Tỏa sáng xua Bóng Mực, tốn ánh sáng | Tốn 2 đom đóm; Bóng Mực trong 6 m bị đẩy 4 m và choáng 180 tick; hồi chiêu 90 tick |
| R7 | Bóng Mực sợ đèn | Không vào được bán kính 5 m quanh đèn **đã thắp** |
| R8 | Thắng/thua, điểm, HUD, chơi lại | `all_lit` → won; `no_flames` / `dawn` → lost; điểm theo bảng trong README; HUD; Enter/R chơi lại |
| C1 | `game.contract.json` đúng số | Test so sánh với `src/sim/config.js` |
| C2 | CLI headless đúng tham số, exit code | Exit 0; sai định dạng → 2; thiếu tham số → 1 |
| C3 | Mô hình tick, định dạng JSONL | Snapshot tick 0, 10, 20…; event gắn tick k+1; dòng `end` cuối; làm tròn 3 chữ số |
| C4 | Tất định | Cùng seed/scenario/inputs → output giống từng byte |
| C5 | Chạy trên macOS/Linux | Node thuần, không dependency; CI chạy cả ubuntu và macos |

## 2. Giả định cho chỗ mơ hồ

| Chỗ mơ hồ | Giả định của tôi | Lý do |
|---|---|---|
| "Ánh sáng" tốn khi Tỏa sáng | Trừ vào **đom đóm đang mang** (`pulse_cost` = 2) | PRD nói "tốn ánh sáng", và đom đóm chính là ánh sáng Mây mang theo |
| `safe_radius` áp dụng cho đèn nào | Chỉ đèn **đã thắp** | Đèn tắt thì chưa có ánh sáng. Demo nền trên lab board cũng lọc theo `L.lit` |
| Tốc độ di chuyển | Tức thời, không có gia tốc | Test sẽ tính vị trí từ `player_speed`, có gia tốc thì khó đoán |
| Nạp đèn | Mỗi lần nhấn interact nạp `min(carried, còn thiếu)` vào đèn chưa thắp gần nhất trong `interact_radius` | Ví dụ inputs trong contract nhấn interact một lần |
| Đom đóm bị rơi khi trúng đòn | Mất luôn (không rơi xuống đất) | Rơi xuống đất thì sẽ bị nhặt lại ngay (vì trong pickup radius), làm mất ý nghĩa hình phạt |
| Nhiều Bóng Mực chạm cùng lúc | Chỉ mất 1 ngọn lửa, sau đó bất tử | Tránh mất hết máu trong một tick |
| Bóng Mực bị choáng | Không di chuyển và không gây sát thương | Đúng nghĩa "choáng" |
| Điểm thưởng thời gian | `per_second_left × floor(time_left_s)`, chỉ cộng khi thắng | Giữ điểm là số nguyên |
| Rơi khỏi đảo | Không có (`fall_enabled: false`), có rào vô hình bán kính 48 m | Giảm phạm vi; PRD không bắt buộc |
| Bóng Mực có sẵn lúc đầu? | Không. Con đầu sinh ở tick 300 (có event), sau đó 1200 tick một con, tối đa 6 | Để có thời gian làm quen; mọi Bóng Mực đều có `shade_spawned` |
| Vị trí 5 đèn | Đặt trên vòng tròn bán kính 25 m, L1 ở (0,0,25), mỗi đèn cách nhau 72° | Khớp với ví dụ `L1 pos [0,0,25]` trong contract |
| Đom đóm hồi lại | Cứ 180 tick sinh 1 con nếu đang ít hơn 30 | Đủ đom đóm cho 5 × 5 = 25 lần nạp cộng phần dùng cho Tỏa sáng |
| Thứ tự trong một tick | di chuyển → nhặt → nạp → Bóng Mực đi → Tỏa sáng → va chạm → sinh → kiểm tra kết thúc | Tỏa sáng trước va chạm để tỏa sáng đúng lúc vẫn cứu được người chơi |
| Scenario đặt `deposited ≥ lantern_cost` | Coi như đèn đã thắp (không phát event, không cộng điểm) | Tránh trạng thái mâu thuẫn |
| Thành phần `move` ngoài [−1, 1] | Kẹp về [−1, 1] | Contract chỉ bắt exit 2 với file sai định dạng |

## 3. Thiết kế

- `src/sim/game.js` là logic thuần: `createGame`, `step` (một tick), `snapshot`. RNG mulberry32 lấy theo seed. Mọi thời gian tính bằng **tick nguyên** (`round(s × 60)`) để không lệch do số thực.
- `src/headless.js` + `src/io.js`: phần CLI và validate. `FormatError` → exit 2.
- `web/main.js` chỉ có nhiệm vụ hiển thị: bàn phím → input đúng định dạng contract → `step()` 60 Hz → vẽ. Vì vậy hành vi trên web và trong headless giống hệt nhau.
- Chọn JS thuần + Three.js, không dùng bundler: chạy được mọi nơi có Node, không có bước build, giảm rủi ro khi người chấm chạy trên macOS/Linux.

## 4. Đánh giá Phase 1

- **Đạt:** R1–R8, C1–C5 (xem [traceability](../proof/phase-1/traceability.md)).
- **Giới hạn đã biết:**
  - Biên `shade_hit_radius` (đúng 1.000 m) không có unit test riêng. Mutation `<=`→`<` không bị bắt vì Bóng Mực di chuyển liên tục nên hầu như không đứng đúng biên.
  - Ảnh chụp headless của Edge không chạy đồng hồ game, nên ảnh chỉ là khung đầu của scenario.
  - Chưa chơi thử đủ một ván thắng bằng tay. Đường thắng được kiểm bằng scenario `deposit_win`.
- **Harness:** CLAUDE.md, skill `verify-phase`, Stop hook chặn kết thúc khi test đỏ, CI trên ubuntu và macos.
