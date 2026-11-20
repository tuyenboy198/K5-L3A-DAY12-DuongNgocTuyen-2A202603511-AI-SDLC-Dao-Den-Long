# ADR 0001: Đèn có nhiên liệu, thắng bằng "giữ đảo sáng tới bình minh"

- **Trạng thái:** Đã chấp nhận (Phase 3, Ticket-03, Test Contract v1.2)
- **Thay thế:** luật "đèn đã sáng là sáng mãi", "Bóng Mực không bao giờ vào vùng an toàn", "thắng ngay khi mọi đèn sáng" của Ticket-02

## Bối cảnh

Người chơi giỏi thắp hết đèn trong khoảng 2 phút rồi game kết thúc, nên cuối Đêm thiếu căng thẳng. Ticket-03 đổi mục tiêu thành giữ đủ đèn sáng tới bình minh.

## Quyết định

### 1. Mô hình trạng thái đèn

Trước đây đèn chỉ có hai trạng thái `tắt → sáng` và không quay lại. Nay đèn có vòng đời:

```
          nạp đủ 10 (lần đầu) / đủ 5 (đã từng sáng)
  TẮT ────────────────────────────────────────────▶ SÁNG (fuel = 100, ever_lit = true)
   ▲                                                  │  mỗi tick: fuel −1/60·1 (hao) − 5/60·(số Bóng đang drain)
   │       fuel ≤ 0 (ngay sau bước 2):                │  E khi chưa đầy: châm dầu +10/đom đóm
   └───── lantern_out, deposited = 0 ─────────────────┘  fuel < 30 → "yếu": mất vùng an toàn, Bóng có thể tới hút
```

- Trạng thái đèn: `lit`, `deposited`, `fuel`, `everLit`, `relitCount`.
- `fuel` lưu bằng **số nguyên đơn vị 1/60** (100 dầu = 6000 đơn vị; hao 1 đơn vị mỗi tick, bị hút 5 đơn vị mỗi tick mỗi con). Khi xuất ra mới làm tròn 1 chữ số thập phân. Cách này tránh sai số số thực tích lũy qua 18.000 tick, và giúp tính tay scenario chính xác (ví dụ `fuel_drain`: (1200 − 82 − 300)/60 = 13.6).
- Vùng an toàn là thuộc tính **suy ra** (`hasZone = lit && fuel ≥ 30`), không lưu riêng. Mọi chỗ dùng vùng an toàn (chặn Bóng, chặn đẩy lùi) đi qua một hàm duy nhất, nên không có chỗ nào bị sót luật "đúng 30 vẫn còn vùng".
- Đẩy Bóng ra khi đèn **vừa thắp** và khi đèn **được châm từ < 30 lên ≥ 30** dùng chung một cơ chế: danh sách `newlyZoned` ở bước 6. Cả hai đều là "vùng an toàn vừa xuất hiện".

### 2. Bóng Mực có thêm trạng thái `drain`

`wander` → (tới đèn yếu gần nhất, cách ≤ 2 m) → `drain`. Rời `drain` khi: Mây vào trong 6 m (`chase`), trúng Tỏa Sáng (`stunned`), đèn tắt, đèn được châm lên ≥ 30, hoặc Bóng cách đèn > 2 m (`wander`). Hết choáng thì luôn về `wander`. Bóng đang `chase` không đổi mục tiêu. Trong `drain` Bóng không gây sát thương, vì luật chạm chỉ áp dụng cho `wander` và `chase`.

### 3. Luật thắng và điểm

- Không còn kết thúc sớm.
- Ở bước "xét thắng/thua" (sau mọi cập nhật của tick): hết Ngọn Lửa thì thua `no_flames` trước. Nếu không, khi hết giờ mà số đèn sáng ≥ ceil(0.6 × tổng) thì thắng `dawn_survived`, ngược lại thua `dawn`. Ngưỡng tính bằng `Math.ceil(0.6·n − 1e-9)` để 0.6 × 5 không bị làm tròn lên thành 4 do sai số số thực.
- Điểm: +5 mỗi đom đóm nạp (thắp, thắp lại hoặc châm dầu), +100 thắp lần đầu, +40 thắp lại, +5 hoặc +15 (nếu Bóng đang `drain`) mỗi Bóng trúng Tỏa Sáng. Bình minh khi thắng: mỗi đèn sáng 50 + floor(fuel), mỗi Ngọn Lửa 50. Bỏ thưởng thời gian.
- `tuning.score` giữ 5 khóa cũ để contract không mất trường: `per_second_left` = 0 (đã bỏ). Các điểm mới mà contract không có khóa nằm trong `RULES` (`scoreRelight`, `scoreStunDrain`, `scoreDawnLantern`).

### 4. Sức chứa

`capacity = min(20, 10 + 2 × successful_lights)`. Biến này tính cả lần thắp lại, không tính đèn đặt sẵn bằng scenario, và đặt lại mỗi Đêm vì mỗi Đêm là một `createGame` mới.

## Hệ quả

- **Breaking:** contract v1.2, các trường snapshot, scenario và event mới. `all_lit` không còn dùng. Thời lượng Đêm là 240/270/300 s. Xem [CHANGELOG.md](../../CHANGELOG.md).
- **Test Phase 1–2 bị thay:**
  - `deposit_win` đổi thành `deposit_light` (không còn thắng sớm).
  - Test "thắng đúng tick hết giờ" bị xóa, thay bằng test ngưỡng 3/5, 4/6, 5/7.
  - Điểm +10 đổi thành +5; thời lượng đổi 300/330/360 thành 240/270/300.
  - Các test không bị thay (di chuyển, Tỏa Sáng, hit, rơi, Gió Lạc, Bùa, pause, bản đồ) vẫn chạy nguyên.
- **Phương án đã cân nhắc nhưng không chọn:**
  - Lưu dầu kiểu float: dễ lệch ±1 tick ở biên 30 và 0.
  - Thêm trạng thái đèn riêng "yếu": trùng lặp với `lit + fuel` và dễ lệch khi châm dầu.
