# Test Contract v1.1: tóm tắt để code (nguồn: lab board, Ticket-02 Phần 4; nền là v1.0)

v1.0 vẫn áp dụng (xem [test-contract-v1.0.md](test-contract-v1.0.md)), cộng thêm các thay đổi sau:

- `contract_version: "1.1"`. `tuning` = số chuẩn Ticket-02 Phần 1, thêm `dash_speed` 14, `dash_duration_s` 0.2, `dash_cooldown_s` 1.5, `night2_duration_s` 330, `night3_duration_s` 360.
- `--night` nhận 1, 2, 3. Chạy một Đêm đầy đủ (tối đa 21.600 tick) phải xong trong ≤ 30 s.
- **Snapshot:**
  - Thêm ở gốc: `night`, `wind {active, dir_deg}`.
  - `player` thêm: `vel`, `grounded`, `invuln`, `dash_cd_s`, `pulse_cd_s`, `charm_s`.
  - Mảng bắt buộc:
    - `motes[{id, pos, kind: random|dropped, ttl_s}]`
    - `drifters[{id, pos, state, stolen}]`
    - `charms[{id, available, respawn_s}]`
  - Khi tạm dừng: `tick` vẫn tăng, `sim_tick` đứng yên, `state` ghi `"paused"`.
- **Scenario thêm:**
  - `player.{invuln_ticks, dash_cd_ticks, pulse_cd_ticks, charm_ticks}`
  - `shades[].{state, state_ticks_left}`
  - `drifters`, `charms`: thay thế danh sách mặc định
  - Cờ `random_drifters`, `wind_enabled`
- **Input thêm:** `dash`, `pause`, đều kích hoạt khi chuyển false → true.
- **Event mới:**
  - `dash {}`
  - `charm_picked {charm_id, charm_ticks}`
  - `drifter_steal {drifter_id, amount, carried}`
  - `drifter_drop {drifter_id, amount}`
  - `night_start {night}`
  - `paused {}`, `resumed {}`
  - `player_hit` do rơi có thêm trường `lost`.
- **Trạng thái Bóng Mực** phải dùng đúng tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- **Thứ tự 12 bước trong một tick:** xem comment đánh số trong `src/sim/game.js` `step()`, chép đúng theo ticket.
