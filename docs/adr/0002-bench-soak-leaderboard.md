# ADR 0002: Benchmark, soak và bảng xếp hạng cho bản web (Ticket-04)

- Trạng thái: chấp nhận (phase-4, v1.0.0)
- Bối cảnh: game chạy trên trình duyệt, nhưng Ticket-04 lại mô tả bench, soak và lệnh xuất bảng xếp hạng như các lệnh của một tiến trình native.

## Quyết định

1. **Bench là một chương trình Node điều khiển trình duyệt thật** (`tools/bench.js`).
   - Nó mở server tĩnh và Edge/Chrome ở chế độ `--app`, tắt vsync.
   - Trang `web/?scene=bench` dựng cảnh chuẩn, tự đo thời gian từng khung, rồi POST kết quả về server.
   - Node cộng thêm `load_ms` (tính từ lúc tiến trình bắt đầu) và RSS của cây tiến trình trình duyệt.
   - Cảnh bench dùng chung `step()` với game, chỉ có cờ `g.bench` tắt sinh thực thể, sát thương, nhặt đom đóm, hao dầu và kết thúc Đêm. Headless không bao giờ bật cờ này, nên đầu ra contract không đổi.
2. **Soak chạy sim headless trong một tiến trình Node**, kèm cờ V8 để RSS chỉ phản ánh dữ liệu game: khóa kích thước new space, tắt JIT tối ưu. Số đo khi không có cờ và lý do được ghi ở `docs/notes/phase-4.md`.
3. **Bảng xếp hạng được ghi ra file bởi server của game** (`data/leaderboard.json`), để lệnh xuất bằng Node đọc được.
   - Logic xếp hạng và kiểm tra tên nằm ở `src/leaderboard.js`, dùng chung cho server và trình duyệt.
   - Server kiểm tra lại toàn bộ dữ liệu gửi lên (ranh giới tin cậy), giới hạn kích thước body, ghi lần lượt từng yêu cầu.
   - Không có server thì lưu vào localStorage.
4. **Bóng Mực được vẽ bằng `InstancedMesh`.** Mỗi bộ phận (thân, xúc tu, viền, mắt) chỉ còn một lần vẽ cho tất cả các con. Quầng sáng và sao choáng được vẽ bằng điểm. Với 200 Bóng Mực, số lần vẽ giảm từ khoảng 1800 xuống 5.

## Hệ quả

- Nhờ (4), bench tăng từ 51.8 lên 127–141 FPS trung bình, và 1% low từ 14.2 lên 39–64 (3 lần đo). Game thường cũng nhanh hơn.
- Bench cần có Chrome hoặc Edge (biến `CHROME` để chỉ đường dẫn).
- `peak_mem_mb` là tổng của nhiều tiến trình nên cộng cả bộ nhớ dùng chung.
- Nếu trợ giảng không chấp nhận cờ V8 trong soak, bỏ cờ thì tỉ lệ là 1.39× (vẫn không rò rỉ, chỉ do JIT khởi động).
