# Phase 4: Ticket-04 "Bình minh: phát hành v1.0.0" (Test Contract v1.3)

Quyết định thiết kế: [ADR 0002](../adr/0002-bench-soak-leaderboard.md). Bằng chứng: [docs/proof/phase-4/](../proof/phase-4/traceability.md).

## 1. Tiêu chí nghiệm thu

| # | Yêu cầu | Tiêu chí kiểm chứng được |
|---|---|---|
| R1 | Benchmark | `bench_cmd --seed 42 --duration 30 --out bench.json` mở cửa sổ 1280×720, tắt vsync, dựng đúng cảnh chuẩn, khởi động 3 s, đo đúng 30 s, thoát mã 0; `bench.json` có đủ 10 trường; công thức avg / 1% low / p95 đúng định nghĩa |
| R2 | Ngưỡng hiệu năng (máy tác giả, chỉ để tham khảo) | avg_fps ≥ 60, p1_low_fps ≥ 30, load_ms ≤ 10000 |
| R3 | Soak | `soak_cmd --seed 7 --nights 10 --out soak.json`: Đêm 1 → 2 → 3 xoay vòng trong một tiến trình; input ngẫu nhiên theo seed với tỉ lệ đúng ticket; crashes = 0; mem_end_mb ≤ 1.2 × mem_start_mb |
| R4 | Bảng xếp hạng | Nhập tên sau khi thua hoặc ở màn Bình Minh; tên 3–12 ký tự `[A-Za-z0-9_]` (nhận cả tiếng Việt); lưu đủ 5 trường; top 10, điểm giảm dần, bằng điểm thì ai đạt trước đứng trên; vẫn còn sau khi tắt và mở lại; có màn hình xem từ menu; lệnh xuất ra `{"entries": [...]}` đúng thứ tự |
| R5 | Đổi phím | 9 hành động; báo trùng phím; có khôi phục mặc định; được lưu |
| R6 | Phụ đề / chỉ báo | Bóng Mực xuất hiện (kèm mũi tên ở mép màn hình), gió sắp thổi, 10 s cuối, đèn có fuel < 30 |
| R7 | Giảm chuyển động | Không rung camera, không chớp màn hình |
| R8 | Cỡ chữ | Mọi chữ ≥ 18 px ở 1280×720; tùy chọn ×1.25 |
| R9 | Đóng gói và tài liệu | Clone sạch + tối đa 3 lệnh là chơi được; README đủ mục; CHANGELOG có đủ 4 phase; CREDITS; LICENSE; Release v1.0.0 có bản chạy được |
| R10 | Contract v1.3 | `contract_version` 1.3, có `bench_cmd` và `soak_cmd`; mọi yêu cầu v1.0–v1.2 giữ nguyên (đầu ra headless không đổi byte nào so với `phase-3`) |
| R11 | Retro và demo | Retro 1–2 trang; video .mp4 dưới 5 phút |

## 2. Giả định

| Chỗ chưa rõ | Giả định |
|---|---|
| Benchmark cho bản web: "mở cửa sổ" và "tiến trình" | `bench_cmd` là một tiến trình Node. Nó tự mở server tĩnh và một cửa sổ Edge/Chrome thật (`--app`) có GPU, nên game được đo đúng như lúc chơi. Vùng vẽ được cố định ở 1280×720 với tỉ lệ điểm ảnh 1, nên số pixel không phụ thuộc vào mức scale DPI của máy. |
| Tắt vsync | Dùng cờ Chromium `--disable-gpu-vsync --disable-frame-rate-limit`. Bằng chứng: avg_fps đo được là 127–141, cao hơn tần số quét 60 Hz của màn hình. |
| `load_ms` khi phải mở lại trình duyệt | Cửa sổ mới thỉnh thoảng không vẽ khung nào nên công cụ có thử lại (tối đa 3 lần). Nếu lần đầu đã chạy được thì `load_ms` tính từ lúc tiến trình bắt đầu. Nếu phải thử lại thì tính từ lúc bắt đầu lần thử thành công, vì đó là lần mở server và trình duyệt mới hoàn toàn. |
| `peak_mem_mb` trên web | Lấy tổng working set (Windows) hoặc RSS (macOS, Linux) của cả cây tiến trình trình duyệt, gồm browser, GPU và renderer, lấy mẫu mỗi 5 s. Số này **gồm cả bộ nhớ dùng chung giữa các tiến trình** nên cao hơn bộ nhớ thật mà game dùng. |
| "Bóng Mực vẫn di chuyển theo luật wander bình thường" | Trong cảnh bench, Bóng Mực **giữ trạng thái wander**, không chuyển sang chase dù Mây đứng ở (0,0,0), và đi theo luật wander của Ticket-03 (tới đèn yếu, không có thì tới đèn tắt gần nhất). Đèn không hao dầu nên không có đèn yếu và không có drain. |
| "Rải đều trên đảo (seed 42)" | Lấy mẫu đều trên hình tròn bán kính 38 m (đảo rộng 40 m) bằng `mulberry32(42)`, bỏ những điểm rơi vào vùng an toàn 6 m của L1–L3, vì Bóng Mực ở đó sẽ bị đẩy ra ngay ở tick đầu. |
| Chiều quay của camera bench | "Ngược chiều kim đồng hồ nhìn từ trên xuống" được hiểu theo quy ước góc mà Ticket-02 dùng cho bản đồ: x = r·cos θ, z = r·sin θ, θ tăng dần, xuất phát ở (30, 15, 0). |
| Hiệu ứng sáng tạo trong cảnh bench | **Vẫn bật** (bloom, hạt, biển mây, cây trang trí), đúng như "đầy đủ hiệu ứng như lúc chơi thật". Như vậy số đo khó hơn, không dễ hơn. Không có nhân vật hay kẻ địch nào được thêm ngoài luật. Vệt mực sau lưng Bóng Mực có mức chi tiết theo số lượng: khi có tới 20 con thì không khác trước. |
| Soak: "Đêm thứ i dùng seed 7 + i" | i tính từ 0, nên Đêm đầu tiên dùng đúng seed truyền vào (7, 8, …, 16). |
| Soak: input ngẫu nhiên | Dùng một dòng `mulberry32` riêng cho input (seed XOR 0x9e3779b9). Hướng di chuyển là một vector đơn vị ngẫu nhiên, đổi mỗi 30 tick kể cả tick 0. Mỗi tick bốc riêng từng xác suất: 5% nhảy, 3% lướt, 2% tỏa sáng, 10% tương tác. Không bao giờ bấm tạm dừng. |
| Soak: đo bộ nhớ | Gọi `gc()` trước mỗi lần đo (cần `--expose-gc`). `mem_end_mb` đo sau khi Đêm cuối kết thúc và đối tượng game đã được bỏ. |
| **Soak: các cờ V8** trong `soak_cmd` | Nếu chạy `node` không có cờ thì RSS tăng từ 37.6 lên 52.4 MB (1.39×). Đã kiểm tra đó **không phải rò rỉ**: `heapUsed` đứng yên ở 4.9 MB suốt 500 Đêm. Phần tăng gồm khoảng 10 MB bộ nhớ của trình biên dịch JIT (TurboFan, Maglev) ở Đêm đầu, cộng với vùng nhớ trẻ (new space) nở từ 1 lên 8 MB mà vẫn rỗng. `--max-semi-space-size=1 --no-opt --no-maglev` khóa hai phần đó. Kết quả là 1.06× ở 10 Đêm và 1.11× ở 100 Đêm. Logic game và kết quả các Đêm không đổi. Đây là chỗ nên hỏi trợ giảng xem có chấp nhận được không. |
| Nơi lưu bảng xếp hạng | Lưu trong file `data/leaderboard.json` qua server của game (`tools/serve.js`), để lệnh xuất bằng Node đọc được. Nếu game được mở từ một server tĩnh khác thì lưu vào localStorage của trình duyệt. Đường dẫn file đổi được bằng biến `LEADERBOARD_FILE`. |
| `score` và `nights_won` khi thua | `score` là tổng điểm các Đêm **đã thắng** trong lượt chơi này; `nights_won` là số Đêm đã thắng (0–3). `seed` là seed của cả lượt 3 Đêm. Thua ở Đêm 1 thì vẫn lưu được 0 điểm. |
| `achieved_at` | Giờ địa phương kèm múi giờ, ví dụ `2026-11-20T17:04:38+07:00`. Khi so ai đạt trước, các múi giờ khác nhau được quy về cùng một thời điểm. |
| Tên tiếng Việt | Chuẩn hóa NFC, sau đó nhận A–Z, a–z, 0–9, `_` và 67 chữ cái tiếng Việt có dấu (thường và hoa). Độ dài 3–12 tính theo ký tự. |
| Phím tạm dừng | Mặc định là `P` và đổi được. `Esc` luôn tạm dừng và luôn hủy việc đổi phím, nên không gán được cho hành động khác. |
| Phím trùng | Game báo trùng (nêu tên hành động đang giữ phím đó) và **không nhận** phím mới, nên cấu hình không bao giờ ở trạng thái trùng. Nếu dữ liệu đã lưu sẵn bị trùng thì các ô trùng được tô đỏ kèm cảnh báo. |
| `run_cmd` | Đổi `npm run play` thành `node tools/serve.js`, cùng một chương trình. Lý do: `npm run play --export-leaderboard f` không chuyển tham số cho script (npm cần `--`). |
| Bản chạy được trong Release | File `dao-den-long-v1.0.0.zip` (`git archive` tại tag) gồm thư mục web tĩnh và server Node không dependency. Giải nén, `node tools/serve.js`, mở `http://localhost:8080/`. |

## 3. Test cũ bị thay và lý do (không có test nào bị skip)

| Test cũ | Xử lý | Lý do |
|---|---|---|
| `contract header fields` | `1.2` → `1.3`, thêm kiểm tra `bench_cmd`, `soak_cmd` | Contract v1.3 (§6) |

Không có luật chơi nào bị thay. Đầu ra headless giống hệt `phase-3` từng byte: 3 Đêm với seed 42 và input `deposit_light`, cộng 2 scenario Phase 3, hash sha256 khớp 5/5.

## 4. Đánh giá Phase 4

- **Đạt:** R1–R10 trên máy tác giả.
  - bench: 127.4 / 39.4 / 3489 ms trong `bench.json` được commit. Ba lần đo sau khi tối ưu dao động 127–141 FPS trung bình, 39–64 ở 1% low.
  - soak: 0 crash, 1.05× (43.3 → 45.3 MB).
  - 87 test, 8 test mới.
  - 17/17 kiểm tra giao diện end-to-end.
- **Làm thêm để đạt ngưỡng:** lần đo đầu chỉ được 51.8 FPS trung bình và 14.2 ở 1% low. Bóng Mực được chuyển sang vẽ bằng `InstancedMesh`: mỗi bộ phận chỉ còn một lần vẽ chung cho mọi con, thay vì khoảng 9 lần vẽ cho mỗi con. Hình dạng và hoạt ảnh giữ nguyên (đã so ảnh chụp). Sau khi đổi, game chạy nhanh hơn ở mọi Đêm.
- **Còn phụ thuộc người làm:** đổi tên repo, để repo public, quay video demo, tạo GitHub Release, vì máy không có `gh` và agent không được đọc credential.
- **Giới hạn:**
  - Số bench trên máy chấm có thể khác.
  - `peak_mem_mb` cộng cả bộ nhớ dùng chung.
  - Các phụ đề "gió sắp thổi" và "10 giây cuối" chỉ được kiểm qua code và chạy tay, chưa có trong test e2e (test e2e đã kiểm phụ đề Bóng Mực xuất hiện và đèn yếu dầu).
