# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4, đính kèm Release `v1.0.0`)_
> Day 12 · AI SDLC Lab · Dương Ngọc Tuyến · 2A202603511

Game 3D góc nhìn thứ ba chạy trên trình duyệt. Bạn điều khiển **Mây**, người giữ đèn nhỏ tuổi, đi gom đom đóm và thắp lại 5 Đèn Lồng Lớn của **Đêm 1 – Đảo Bến** trước bình minh, đồng thời né **Bóng Mực**.

Toàn bộ luật chơi nằm trong `src/sim/`, là JavaScript thuần, chạy tất định. Bản web và chế độ headless (Test Contract v1.0) cùng chạy **một** mã logic này.

## Cài đặt và chạy (3 lệnh, macOS / Linux / Windows, cần Node ≥ 18)

```bash
git clone https://github.com/tuyenboy198/K5-L3A-DAY12-DuongNgocTuyen-2A202603511-AI-SDLC-Dao-Den-Long.git
cd K5-L3A-DAY12-DuongNgocTuyen-2A202603511-AI-SDLC-Dao-Den-Long
npm run play
```

Sau đó mở **http://localhost:8080/**. Game không có dependency npm (Three.js đã kèm sẵn trong `web/vendor/`), nên `npm install` (build_cmd) không tải gì cả.

## Điều khiển

| Phím | Hành động |
|---|---|
| `W A S D` | Di chuyển (theo hướng camera) |
| `Space` | Nhảy |
| `E` | Nạp đom đóm vào Đèn Lồng (đứng trong vòng sáng cam) |
| `F` | Tỏa sáng: xua Bóng Mực xung quanh (tốn 2 đom đóm) |
| `←` `→` / kéo chuột | Xoay camera |
| `Enter` / `R` | Bắt đầu / chơi lại |
| `M` | Bật/tắt âm thanh |

## Luật và cách tính điểm

- Mây có **3 ngọn lửa** (máu) và mang tối đa **10 đom đóm**. Đi lại gần (≤ 1 m) là nhặt được đom đóm.
- Mỗi đèn cần **5 đom đóm**: đứng cách chân đèn ≤ 2.5 m rồi nhấn `E` để nạp. Nạp được một phần, lần sau nạp tiếp.
- Bóng Mực xuất hiện ở mép đảo (con đầu tiên lúc 5 giây, sau đó cứ 20 giây thêm một con, tối đa 6 con) và đuổi theo Mây với tốc độ 3.5 m/s (Mây chạy 6 m/s). Bị chạm thì **mất 1 ngọn lửa**, **rơi một nửa số đom đóm đang mang** (làm tròn xuống), rồi được bất tử 2 giây.
- **Tỏa sáng** (`F`): tốn 2 đom đóm. Mọi Bóng Mực trong 6 m bị đẩy lùi 4 m và choáng 3 giây. Hồi chiêu 1.5 giây.
- Đèn **đã thắp** tạo vùng an toàn bán kính 5 m mà Bóng Mực không vào được.
- **Thắng:** thắp cả 5 đèn. **Thua:** hết ngọn lửa, hoặc hết 300 giây (bình minh).

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực bị choáng bởi Tỏa sáng | +25 |
| Khi thắng: mỗi giây còn lại (làm tròn xuống) | +2 |
| Khi thắng: mỗi ngọn lửa còn lại | +50 |

## Headless (Test Contract v1.0) và kiểm thử

```bash
node src/headless.js --seed 42 --night 1 --ticks 18000 --out out.jsonl [--scenario f.json] [--inputs f.json] [--snapshot-every 10]
npm test                    # 44 test: luật chơi, CLI, contract, scenario tính tay
npm run verify -- phase-1   # chạy test + kiểm tra tất định, ghi docs/proof/phase-1/verify-report.md
```

- Khai báo contract nằm ở [`game.contract.json`](game.contract.json). Mọi trường đều có giá trị thật, không có `null`. `fall_enabled: false` vì đảo có rào vô hình bán kính 48 m, người chơi không rơi được, nên không bao giờ có `player_hit` với `by: "fall"`.
- Một vài số nội bộ contract không yêu cầu khai báo (vị trí đèn, nhịp sinh Bóng Mực và đom đóm, sức nhảy): xem [`src/sim/config.js`](src/sim/config.js) và [giả định Phase 1](docs/notes/phase-1.md).
- Trạng thái Bóng Mực trong snapshot: `chase` (đang đuổi) hoặc `stunned` (đang choáng).
- Scenario mẫu (kèm kết quả mong đợi tính tay) ở [`scenarios/`](scenarios/). Bản web nạp được scenario: `http://localhost:8080/web/?scenario=../scenarios/pulse_stun.scenario.json`.

## Sáng tạo của tôi

Mọi phần dưới đây **chỉ nằm ở phần hiển thị** (`web/main.js`). Chúng không đụng tới `src/sim`, nên đầu ra headless không đổi. Bằng chứng: `npm test` vẫn xanh, và hash tất định trong [verify-report](docs/proof/phase-1/verify-report.md) không phụ thuộc vào `web/`.

1. **Đèn trên nón của Mây sáng dần theo số đom đóm đang mang**: mang càng nhiều, quanh Mây càng sáng. Mây nhấp nháy khi đang bất tử.
2. **Âm thanh tự tổng hợp bằng WebAudio** (không dùng file asset): tiếng "ting" cao dần mỗi lần nhặt đom đóm, hợp âm khi thắp đèn, tiếng trầm khi bị chạm.
3. **Đảo sáng dần lên**: mỗi đèn thắp xong thì ánh sáng môi trường tăng, sương tím tan bớt và bầu trời ấm lên. Vòng nạp quanh đèn sáng dần theo lượng đã nạp.
4. **Gợi ý theo ngữ cảnh**: "Nhấn E để nạp đèn L2 (3/5)", "Bóng Mực tới gần! Nhấn F để tỏa sáng".

## Tài liệu

| | |
|---|---|
| [docs/notes/phase-1.md](docs/notes/phase-1.md) | Giả định, tiêu chí nghiệm thu, đánh giá Phase 1 |
| [docs/proof/phase-1/](docs/proof/phase-1/) | Bằng chứng: bảng truy vết, verify-report, ảnh chụp |
| [docs/notes/ai-log.md](docs/notes/ai-log.md) | Nhật ký dùng AI, token, lỗi của AI |
| [docs/notes/test-contract-v1.0.md](docs/notes/test-contract-v1.0.md) | Tóm tắt Test Contract dùng khi code |
| [CLAUDE.md](CLAUDE.md), [.claude/](.claude/) | Harness AI: hướng dẫn agent, skill `verify-phase`, Stop hook chặn kết thúc khi test đỏ |
| [docs/lab/](docs/lab/) | Tài liệu gốc của lab |
| [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE) | Nguồn và giấy phép |
