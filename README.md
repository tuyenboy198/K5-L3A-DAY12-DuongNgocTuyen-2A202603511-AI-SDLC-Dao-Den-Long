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

Mọi phần dưới đây **chỉ nằm ở phần hiển thị** (`web/`). Chúng không đụng tới `src/sim`, nên đầu ra headless không đổi. Bằng chứng: `npm test` vẫn xanh, và sau khi nâng cấp đồ họa, hash tất định của CLI vẫn giống từng byte với bản `phase-1` (`5d0efb60…`, xem [verify-report](docs/proof/phase-1/verify-report.md)). Ảnh chụp ở [docs/proof/visual-upgrade/](docs/proof/visual-upgrade/).

1. **Đèn trên nón của Mây** treo như con lắc, đung đưa theo bước đi, và sáng dần theo số đom đóm đang mang. Mỗi đom đóm nhặt được sẽ bay vào chiếc đèn này.
2. **Tương tác giữa Mây, đèn lồng và Bóng Mực** (chỉ là hiệu ứng):
   - Khi nạp đèn, từng đom đóm bay theo đường cong từ đèn của Mây sang Đèn Lồng; vòng tiến độ dưới chân đèn đầy dần.
   - Khi thắp xong, đèn bừng sáng, bắn ra pháo hoa ánh sáng, rồi có đom đóm bay vòng quanh.
   - Bóng Mực chạm vào vùng an toàn của đèn đã thắp thì co rúm lại, nheo mắt, và vòng rào lóe sáng kèm tia lửa.
   - Bóng Mực chuyển mắt sang màu hồng đỏ khi tới gần Mây, để lại vệt mực khi di chuyển, và trồi lên từ một vũng mực khi xuất hiện.
   - Bị chạm thì màn hình rung, viền tím nháy, Mây ngả người ra sau và đom đóm bị rơi bắn tung ra.
   - Tỏa sáng tạo sóng ánh sáng hai vòng. Bóng Mực bị choáng thì xoay tròn, có sao quay trên đầu.
3. **Hoạt ảnh nhân vật**: Mây có chu kỳ bước chân (chân, tay, nhún người), thở khi đứng yên, xoay người mượt, giãn ra khi nhảy và nén lại khi tiếp đất (có bụi). Bóng Mực có thân "thở" và các xúc tu đung đưa.
4. **Cảnh nền**:
   - Bầu trời gradient có 3 lớp sao lấp lánh, trăng có quầng sáng và dải sáng chạy ở chân trời.
   - Biển mây gợn sóng cùng các cụm mây trôi.
   - Đảo nổi có vách đá, đáy hình nón, pha lê phát sáng treo dưới đáy. Xa xa có các đảo nhỏ lơ lửng.
   - Trên đảo có cây thông nhiều tầng đung đưa, nấm phát sáng, đường đá dẫn tới từng đèn, đom đóm trang trí bay lượn.
   - **Đảo sáng dần lên**: mỗi đèn thắp xong, bầu trời và sương ấm lên.
5. **Chất lượng hình**:
   - Render siêu lấy mẫu 1.5× trên màn hình thường; tone mapping ACES; bóng đổ mềm (shadow map 2048, đi theo nhân vật); bloom.
   - Cây và đá chắn giữa camera và Mây sẽ tự mờ đi.
   - Camera bám mượt, quay vòng quanh đảo ở màn tiêu đề và màn kết thúc.
6. **Âm thanh tự tổng hợp bằng WebAudio** (không dùng file asset) và **HUD mới**: ngọn lửa, thanh đom đóm, 5 chấm đèn, thanh thời gian tới bình minh, gợi ý theo ngữ cảnh, bảng thống kê cuối ván.

**Chế độ replay để demo và chụp ảnh tái lập được:**

`http://localhost:8080/web/?scenario=../scenarios/deposit_win.scenario.json&inputs=../scenarios/deposit_win.inputs.json`

Bản web sẽ phát lại đúng file inputs mà test headless dùng. Thêm `&ff=N` để tua nhanh N tick. Có thể chụp ảnh bằng `node tools/screenshot.js <out.png> "<query>" [ms]`.

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
