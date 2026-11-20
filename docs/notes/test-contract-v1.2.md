# Test Contract v1.2: tóm tắt (nguồn: Ticket-03 §7; nền là v1.1)

- `contract_version: "1.2"`.
- Tuning thêm: `fuel_max` 100, `fuel_decay_per_s` 1.0, `fuel_per_mote` 10, `relight_cost` 5, `win_ratio` 0.6, `drain_per_s` 5, `low_fuel_threshold` 30, `capacity_max` 20. Thời lượng Đêm 1/2/3 = 240/270/300.
- **Snapshot:**
  - `lanterns[]` thêm `fuel` (1 chữ số thập phân, đèn tắt có fuel 0), `ever_lit`, `relit_count`.
  - `player.capacity`.
  - Trạng thái Bóng có thêm `drain`.
- **Scenario:**
  - `lanterns[]` có `lit`, `fuel`, `ever_lit`. Đèn đặt `lit: true` mà không có fuel thì fuel = 100.
  - `player.successful_lights`.
  - `shades[].target_lantern_id`.
- **Event mới:**
  - `refuel {lantern_id, amount, fuel}`
  - `lantern_out {lantern_id}`
  - `fuel_drain {lantern_id, shade_id, fuel}`: mỗi 60 tick khi đang hút
  - `lantern_lit` thêm `relight`
  - `game_over.reason` thêm `dawn_survived`; `all_lit` không còn dùng
- **Thứ tự trong tick:** bước 2 trừ dầu (hao + bị hút); ngay sau bước 2, đèn có fuel ≤ 0 thì tắt. Xét thắng/thua sau mọi cập nhật; `no_flames` xét trước.
