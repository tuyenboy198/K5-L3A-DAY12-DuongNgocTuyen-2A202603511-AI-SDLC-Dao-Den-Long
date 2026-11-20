# Phase 3: Ticket-03 "Đèn cạn dầu" (Change Request, Test Contract v1.2)

Quyết định thiết kế: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Breaking changes: [CHANGELOG.md](../../CHANGELOG.md).

## 1. Tiêu chí nghiệm thu

| # | Yêu cầu | Tiêu chí kiểm chứng được |
|---|---|---|
| P1 | Nhiên liệu | Thắp (lần đầu hoặc thắp lại) thì fuel = 100; hao đúng 1/60 mỗi tick (sau 60 tick còn 99.0, sau 90 tick còn 98.5); snapshot làm tròn 1 chữ số; đèn tắt báo `fuel: 0` |
| P2 | Châm dầu | E ở đèn sáng chưa đầy: used = min(đang mang, ceil((100 − fuel)/10)), fuel = min(100, fuel + 10·used), phát `refuel {lantern_id, amount, fuel}`, +5 mỗi đom đóm; chọn đèn nhận được gần nhất, hòa thì id nhỏ hơn |
| P3 | Hết dầu | fuel ≤ 0 (ngay sau bước 2) thì `lantern_out`, lit = false, deposited = 0, ever_lit = true |
| P4 | Thắp lại | Đèn ever_lit cần 5, đèn chưa từng sáng cần 10; `lantern_lit {relight}`; +40 cho thắp lại, +100 cho lần đầu; `relit_count` tăng |
| P5 | Vùng an toàn theo dầu | fuel < 30 thì mất vùng; fuel ≥ 30 (kể cả đúng 30) thì còn |
| P6 | Drain | Bóng `wander` đi tới đèn yếu gần nhất (hòa thì id nhỏ hơn), không có thì tới đèn tắt gần nhất; ≤ 2 m thì `drain`, đứng yên, hút 5/s mỗi con (cộng dồn); `fuel_drain` mỗi 60 tick; rời `drain` theo đúng 5 điều kiện; hết choáng thì về `wander` |
| P7 | Đẩy ra khi châm lên ≥ 30 | Bóng trong 6 m bị đẩy ra mép trong 30 tick, không gây sát thương trong lúc đó |
| P8 | Luật thắng | Không thắng sớm; ở tick bình minh: no_flames xét trước; số đèn sáng ≥ 3/5, 4/6, 5/7 thì `won/dawn_survived`, thiếu thì `lost/dawn` |
| P9 | Sức chứa | 10 + 2 × successful_lights, tối đa 20; tính cả thắp lại, không tính đèn đặt sẵn; `player.capacity` |
| P10 | Điểm | +5/đom đóm nạp, +100 thắp lần đầu, +40 thắp lại, +5 hoặc +15 (Bóng đang drain) mỗi lần Tỏa Sáng trúng; bình minh: 50 + floor(fuel) mỗi đèn sáng + 50 mỗi Ngọn Lửa; bỏ thưởng thời gian |
| P11 | Thời lượng | 240 / 270 / 300 s |
| P12 | Hiển thị | Thanh dầu trên đèn sáng; dưới 30 thì đèn và thanh nhấp nháy 1 Hz; đèn tắt xẹp 20% và giấy rách; HUD đang mang/sức chứa |
| P13 | Mù màu | Cài đặt được lưu; Bóng Mực có viền và mắt #00B3FF; cảnh báo UI dùng #FFFFFF kèm ⚠ |
| P14 | Contract v1.2 | Tuning mới; snapshot `fuel` / `ever_lit` / `relit_count` / `capacity`; scenario `fuel` / `ever_lit` / `successful_lights` / `target_lantern_id`; event mới |

## 2. Giả định

| Chỗ chưa rõ | Giả định |
|---|---|
| Đèn "đầy dầu (used = 0)" | Không bao giờ xảy ra lúc tương tác, vì bước 2 (hao dầu) chạy trước bước 5. Một đèn vừa thắp ở tick trước đã còn 99.983, nên châm 1 đom đóm vẫn hợp lệ |
| Đèn đặt `lit: true` bằng scenario | `ever_lit` mặc định là true, `fuel` mặc định 100, `deposited` = 0; không cộng vào successful_lights |
| Scenario đặt `fuel` cho đèn đang tắt | Bỏ qua (đèn tắt luôn có fuel 0) |
| Bóng `wander` khi không có đèn yếu | Đi về đèn tắt gần nhất, không có đèn tắt thì lang thang ngẫu nhiên như Phase 2 |
| Trạng thái Bóng lúc bị đẩy ra (khi châm dầu) | Giữ trạng thái hiện tại; riêng Bóng đang hút đèn đó thì chuyển sang `wander` |
| `fuel_drain.fuel` | Lượng dầu sau lần hút ở tick đó, làm tròn 1 chữ số, không âm |
| `tuning.score` | Giữ 5 khóa cũ; `per_second_left` = 0 vì đã bỏ thưởng thời gian. Các điểm mới không có khóa trong contract, nằm trong RULES |
| Thắng/thua theo Ngọn Lửa ở tick bình minh | Hết Ngọn Lửa luôn thua `no_flames` trước, theo đúng ticket |

## 3. Test cũ bị thay và lý do (không có test nào bị skip)

| Test cũ | Xử lý | Lý do |
|---|---|---|
| scenario `deposit_win` | Đổi tên thành `deposit_light`; bỏ `game_over`; điểm 898 → 125; thêm `relight: false` | Không còn thắng khi mọi đèn sáng (§3); điểm mới (§5) |
| `win on the exact tick time runs out beats dawn` | **Xóa**, thay bằng `no early win…` và `dawn: won/dawn_survived with ceil(0.6 n)…` | Luật thắng bị thay (§3) |
| `lanterns: … +10 per mote …` | +10 → +5; kiểm thêm `relight` và `fuel` | Điểm mới (§5) |
| `night durations 300/330/360` | → 240/270/300 | Thời lượng mới (§3) |
| `contract …` | v1.2, thêm khóa mới, cập nhật số chuẩn | Contract v1.2 (§7) |
| CLI `basic run` | Thêm `capacity`, các trường đèn mới | Snapshot v1.2 |
| `stunned shade…` | Giữ nguyên | Hết choáng thì `wander`, nhưng Bóng ở gần lập tức chuyển `chase` trong cùng tick, nên kết quả không đổi |

## 4. Đánh giá Phase 3

- **Đạt:** P1–P14.
  - Có 79 test (13 test mới cho Phase 3) và 17 scenario. Có 4 scenario mới: `fuel_drain`, `lantern_out_relight`, `refuel`, `dawn_survived`, đều tính tay và khớp ngay lần chạy đầu.
  - 5 lỗi cố ý cài vào các luật mới (biên 30, chi phí thắp lại 5, điểm drain 15, ngưỡng ceil, sức chứa) đều bị test bắt.
- **Hồi quy:** mọi test Phase 1–2 không bị thay vẫn đạt.
- **Giới hạn:**
  - Phần hiển thị (thanh dầu, nhấp nháy, mù màu) mới kiểm qua ảnh chụp và code, chưa có test tự động.
  - Hành vi "Bóng đi về đèn tắt gần nhất" làm Bóng tụ quanh đèn tắt ngay từ đầu Đêm. Đây là cách hiểu cụm "như trước" trong ticket, cần hỏi trợ giảng nếu muốn chắc.
