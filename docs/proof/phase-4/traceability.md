# Phase 4: truy vết yêu cầu → bằng chứng

Chạy lại ở tag `phase-4`:
- `npm test` (87 test)
- `npm run verify -- phase-4` ([verify-report.md](verify-report.md))
- `node tools/bench.js --seed 42 --duration 30 --out bench.json`
- `npm run soak`
- `node tools/e2e-ui.js docs/proof/phase-4/e2e-ui.md`

| Yêu cầu Ticket-04 | Kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| §1 Cảnh bench chuẩn | 200 Bóng Mực ở wander (S1–S200), nằm trong đảo, ngoài vùng đèn; 100 đom đóm; L1–L3 sáng 100 dầu; Mây ở (0,0,0). Sau 1800 tick: không sinh thêm, không sát thương, không nhặt, không hao dầu, không kết thúc; Bóng Mực vẫn đi ≤ 1.5 m/s; cùng seed cho cùng kết quả | 2 test trong `tests/release.test.js`, ảnh [bench-scene.png](bench-scene.png) | ĐẠT |
| §1 Cửa sổ 1280×720, tắt vsync, camera bay vòng, khởi động 3 s, đo 30 s, thoát mã 0 | `tools/bench.js` + `web/?scene=bench`; vùng vẽ cố định 1280×720 @1x; `--disable-gpu-vsync --disable-frame-rate-limit` | [../../../bench.json](../../../bench.json) (`frames` 3822 trong 30 s, `vsync_off` true) | ĐẠT |
| §1 Công thức avg / 1% low / p95 | Tính tay 2 bộ số (91.7 / 10 / 10; 8 / 4 / 238) | test `bench stats` | ĐẠT |
| §1 Ngưỡng (máy tác giả) | avg 127.4 ≥ 60; 1% low 39.4 ≥ 30; load 3489 ≤ 10000 ms | bench.json | ĐẠT (máy chấm có thể khác) |
| §2 Soak | 10 Đêm 1→2→3, seed 7+i, input theo tỉ lệ ticket; 0 crash; 43.3 → 45.3 MB (1.05×) | [../../../soak.json](../../../soak.json), test `soak_cmd` (cùng seed cho cùng kết quả) | ĐẠT (cờ V8: xem notes §2) |
| §3 Nhập tên sau khi thua hoặc ở Bình Minh; kiểm tra tên | Thua Đêm 1 thì có form; tên "ab" bị từ chối; "Tuyên_01" được lưu | e2e-ui 3 mục, test tên (cả tiếng Việt) | ĐẠT |
| §3 5 trường, top 10, thứ tự, bằng điểm thì ai trước đứng trên (so theo múi giờ) | Test `rank` dùng 2 múi giờ khác nhau | test `leaderboard ranking` | ĐẠT |
| §3 Lưu trên đĩa, còn sau khi khởi động lại; màn hình từ menu; lệnh xuất | Server tắt rồi mở lại, dữ liệu vẫn còn; `run_cmd --export-leaderboard` ra đúng thứ tự | test `leaderboard on disk…`, ảnh [leaderboard.png](leaderboard.png), e2e export | ĐẠT |
| §4 Đổi phím (9 hành động), báo trùng, khôi phục, lưu | Đổi Nhảy = K; gán W cho Lướt thì bị báo trùng và không nhận; Esc hủy; tải lại trang vẫn còn; K làm Mây nhảy thật; khôi phục mặc định | [e2e-ui.md](e2e-ui.md) (6 mục), ảnh [settings.png](settings.png) | ĐẠT |
| §4 Phụ đề / chỉ báo | Bóng Mực xuất hiện kèm mũi tên mép màn hình; đèn < 30 dầu (kiểm e2e); gió sắp thổi, 10 s cuối (code + chạy tay) | e2e-ui, ảnh [captions-spawn.png](captions-spawn.png), [captions-fuel.png](captions-fuel.png) | ĐẠT (gió và 10 s chưa có test tự động) |
| §4 Giảm chuyển động | Bị chạm: chế độ thường chớp 0.95, giảm chuyển động 0; rung camera = 0; tắt chữ nhấp nháy | e2e-ui | ĐẠT |
| §4 Cỡ chữ ≥ 18 px, ×1.25 | Duyệt mọi node chữ đang hiện ở menu, cài đặt, bảng xếp hạng, HUD, tạm dừng: không có chữ < 18 px; chữ lớn = 22.5 px | e2e-ui, ảnh [settings-big.png](settings-big.png) | ĐẠT |
| §5 Clone sạch + 3 lệnh | `git clone`, `cd`, `npm run play` (không dependency) | README | ĐẠT (giảng viên thử trên máy sạch) |
| §5 README, CHANGELOG 4 phase, CREDITS, LICENSE | — | README.md, CHANGELOG.md, CREDITS.md, LICENSE | ĐẠT |
| §5 GitHub Release v1.0.0 có bản chạy được | Zip của `git archive` tại tag (web tĩnh + server Node) | Release v1.0.0 | Người làm tải lên (máy không có `gh`) |
| §6 Contract v1.3 | `contract_version` 1.3, `bench_cmd`, `soak_cmd`; hash headless 5/5 trùng `phase-3` | `contract.test.js`, [notes §3](../../notes/phase-4.md) | ĐẠT |
| §7 Retro | — | [docs/retro.md](../../retro.md) | ĐẠT |
| §7 Video demo < 5 phút | — | docs/demo/demo.mp4 hoặc đính kèm Release | Người làm quay |
