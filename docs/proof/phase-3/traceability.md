# Phase 3: truy vết yêu cầu → bằng chứng

Chạy lại ở tag `phase-3`: `npm test` (79 test) và `npm run verify -- phase-3` ([verify-report.md](verify-report.md)).

| Yêu cầu Ticket-03 | Kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| §1 Nhiên liệu 100, hao 1/s, làm tròn 1 chữ số | 100 → 99.0 (60 tick) → 98.5 (90 tick); đèn tắt báo 0 | test `fuel: 100 when lit…` | ĐẠT |
| §1 Châm dầu | Tính tay: 55.5 → dùng 5 → 100.0, +25 điểm; 40 → dùng 2 → 60.0 | scenario `refuel`, test `refuel uses at most…` | ĐẠT |
| §1 Hết dầu, thắp lại cần 5, +40, relit_count | `lantern_out` ở tick 30 (fuel 0.5); thắp lại ở tick 41, 65 điểm | scenario `lantern_out_relight`, test `lantern_out at fuel 0…` | ĐẠT |
| §2 Vùng an toàn mất khi < 30 | 30.02 vẫn chặn được Bóng; 29 thì Bóng vào trong 6 m | test `low fuel (< 30)…` | ĐẠT |
| §2 Drain: tới đèn yếu, hút 5/s cộng dồn, `fuel_drain` mỗi 60 tick | Tính tay: drain từ bước 22, event ở tick 82, fuel 13.6; 2 Bóng → 14.0 sau 61 tick | scenario `fuel_drain`, test `drain: wander shades…` | ĐẠT |
| §2 Rời drain, đẩy ra khi châm lên ≥ 30 | Đèn tắt thì Bóng rời drain; châm lên thì Bóng ở 6.0 m sau 30 tick, không có hit; Mây trong 6 m thì Bóng `chase` | 2 test | ĐẠT |
| §2 Hết choáng → wander; Tỏa Sáng trúng Bóng đang drain = 15 | Điểm 15 so với 5 | test `pulse on a draining shade…` | ĐẠT |
| §3 Thắng/thua mới, 240/270/300 s | 3/5, 4/6, 5/7 dùng đúng ceil; no_flames ở tick bình minh thắng dawn; không thắng sớm; 597 điểm tính tay | scenario `dawn_survived`, 3 test | ĐẠT |
| §4 Sức chứa 10 + 2·n, tối đa 20 | 10 / 12 / 16 / 20; đèn đặt sẵn không tính; nhặt tới 12 | test `capacity = …` | ĐẠT |
| §5 Điểm mới | +5/đom đóm, +100, +40, +15, phần thưởng bình minh | Các scenario trên (125, 65, 25, 597) | ĐẠT |
| §6 Mù màu, §1 hiển thị | Ảnh chụp; code `settings.colorblind`, thanh dầu, đèn tắt xẹp/rách | [fuel-drain.png](fuel-drain.png), [colorblind.png](colorblind.png) | ĐẠT (kiểm bằng mắt, chưa có test tự động) |
| §7 Contract v1.2 | Tuning, snapshot, scenario, event | `contract.test.js`, `cli.test.js`, mọi scenario | ĐẠT |
| DoD: ADR | — | [docs/adr/0001-lantern-fuel-and-dawn-win.md](../../adr/0001-lantern-fuel-and-dawn-win.md) | ĐẠT |
| DoD: test cũ cập nhật/xóa có lý do | — | [docs/notes/phase-3.md](../../notes/phase-3.md) §3 | ĐẠT |
| DoD: changelog breaking changes | — | [CHANGELOG.md](../../../CHANGELOG.md) | ĐẠT |
| DoD: test ẩn Phase 1–2 không bị thay vẫn đạt | Mọi test cũ không bị thay vẫn chạy nguyên và đạt | `npm test` | ĐẠT |

## Kiểm tra độ mạnh của test (mutation thủ công)

| Lỗi cài vào | Số test fail |
|---|---|
| Vùng an toàn `fuel ≥ 30` → `> 30` | 1 |
| Thắp lại vẫn cần 10 | 2 |
| Tỏa Sáng trúng Bóng đang drain chỉ được 5 | 1 |
| Ngưỡng thắng dùng floor thay vì ceil | 1 |
| Sức chứa cố định 10 | 1 |
