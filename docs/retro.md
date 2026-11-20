# Retro: Đảo Đèn Lồng (Day 12 · AI SDLC Lab)

Dương Ngọc Tuyên · 2A202603511 · công cụ: Claude Code (Claude Opus 5.5) trong VS Code.

## 1. Tổng hợp Evaluation của 4 phase

| Phase | Nội dung | Kết quả chính | Bằng chứng |
|---|---|---|---|
| 1 | PRD-0: Đêm 1 chơi được, headless v1.0 | 44 test, 5 scenario tính tay khớp ngay lần đầu, CLI tất định | [proof/phase-1](proof/phase-1/) |
| 2 | Ticket-02: 3 đảo, số chuẩn, contract v1.1 | 66 test, 13 scenario; viết lại `step()` theo 12 bước; FPS 84 / 69 / 64 trên GPU thật | [proof/phase-2](proof/phase-2/) |
| 3 | Ticket-03: đèn cạn dầu, contract v1.2 (change request) | 79 test, 17 scenario; ADR + breaking changes + bảng test cũ bị thay; 5 lỗi cài cố ý (mutation) đều bị bắt | [proof/phase-3](proof/phase-3/) |
| 4 | Ticket-04: bench, soak, bảng xếp hạng, a11y, v1.0.0 | 87 test; bench 127.4 FPS trung bình / 39.4 ở 1% low / tải 3.5 s; soak 0 crash, RSS cuối/đầu 1.05×; 17/17 kiểm tra UI e2e | [proof/phase-4](proof/phase-4/) |

Qua cả 4 phase, đầu ra headless chỉ thay đổi ở những chỗ ticket bắt buộc. Các phần sáng tạo, gồm nâng cấp đồ họa và bench, được chứng minh là không đổi hash so với tag trước đó.

## 2. Điều gì hiệu quả, điều gì không

**Hiệu quả**
- **Tách sim khỏi render ngay từ đầu.** Mỗi ticket mới chỉ đụng `src/sim` cùng test; giao diện được sửa riêng. Nhờ vậy Phase 3 (change request) đổi luật mà không vỡ phần hiển thị.
- **Kết quả mong đợi tính tay trước khi chạy** (ghi trong `_why`), tránh mẫu số thập phân sát biên. Cả 17 scenario khớp đúng từng tick ngay lần chạy đầu, nên test thật sự kiểm luật chứ không chép lại output.
- **Mutation thủ công kèm `cmp`** để chắc test bắt được lỗi.
- **Đo trên máy thật**, gồm FPS bằng GPU thật và bench bằng cửa sổ thật, thay vì tin vào headless chạy swiftshader.

**Không hiệu quả**
- Heredoc dài trong Git Bash trên Windows nhiều lần hỏng vì trích dẫn. Cách dùng được: ghi script ra file rồi `node file.cjs`.
- Chụp màn hình bằng virtual time không đủ để tới các màn cần nhiều khung hình (màn thua). Phải viết test e2e qua DevTools Protocol thì mới kiểm được.
- Một số yêu cầu chỉ phát hiện ra là khó khi đo, ví dụ 200 Bóng Mực ở Phase 4. Nếu từ Phase 2 đã vẽ instanced thì không phải làm lại.

## 3. Những lần AI sai và cách phát hiện

| Lỗi của AI | Phát hiện bằng | Sửa |
|---|---|---|
| Đặt điểm xuất phát Đêm 3 ở (0,0,0), nằm trong tháp chuông | Mở ảnh chụp | (0,0,−30), thêm test, ghi giả định |
| Scenario dùng `move [-1,0]` để đi +X | Tự soát trước khi chạy | Sửa, ghi vào CLAUDE.md |
| Đổi tên scenario nhưng `verify.js` vẫn trỏ tên cũ; `\| tail` che lỗi nên tag `phase-3` được tạo khi chưa có verify report | Kiểm tra lại thư mục proof | Sửa đường dẫn, từ đó chạy với `set -o pipefail` |
| Định lấy credential GitHub để tự đổi tên repo | Hệ thống từ chối quyền | Người làm tự đổi trên GitHub |
| Phase 4: tưởng soak bị rò rỉ bộ nhớ (RSS 1.39×) | Đo `heapUsed` qua 500 Đêm: không đổi | Xác định do JIT và new space; dùng cờ V8, ghi minh bạch |
| Phase 4: regex `\/[\d.]+` trong template string bị mất dấu `\`, gây SyntaxError | `tools/screenshot.js` in lỗi console của trang | Sửa chuỗi |
| Phase 4: trang POST "first frame" vào cùng endpoint, lẽ ra sẽ kết thúc bench ngay lập tức | Tự review trước khi chạy | Bỏ lệnh POST đó, gửi thời điểm trong kết quả cuối |
| Phase 4: `cat > file` không có heredoc treo vì chờ stdin | Lệnh chạy nền không có output | Dừng, ghi file bằng tool Write |

## 4. Harness nào giúp nhiều nhất

1. **`tools/screenshot.js` in lỗi console và shader của trang.** Đây là thứ bắt được nhiều lỗi giao diện nhất. Một ảnh "đẹp" không che được trang đang lỗi.
2. **CLAUDE.md** với các quy tắc rút ra từ lỗi thật: fuel lưu theo đơn vị 1/60, không viết lại `hasZone()`, hướng `move`, bắt buộc ADR + CHANGELOG khi đổi luật. Agent đọc lại mỗi phiên nên không lặp lại lỗi cũ.
3. **Stop hook** (`tools/stop-gate.js`) không cho kết thúc khi test đỏ.
4. **Skill `verify-phase`**: checklist bằng chứng trước mỗi tag.
5. Phase 4 thêm `tools/e2e-ui.js` (DevTools Protocol, không dependency) để kiểm đổi phím, phụ đề, cỡ chữ và bảng xếp hạng như người dùng thật.

## 5. Token và chi phí AI

Số liệu lấy từ transcript của Claude Code (một phiên dài, có một lần compact), tính tới lúc viết retro:

| | Token |
|---|---|
| Lượt gọi model | 221 (332 lần gọi tool) |
| Output | 0.52 M |
| Ghi cache | 0.83 M |
| Đọc cache | 66.9 M |
| Input không cache | < 0.001 M |

Ước tính theo giá API của Claude Opus 5.5 ($4 input, $20 output, $0.20 đọc cache, khoảng $8 ghi cache TTL 1 giờ, tính trên 1 M token):

- output 10.5 $
- đọc cache 13.4 $
- ghi cache 6.6 $
- **Tổng khoảng 30 $.** Gói Claude tính phí khác API; đây là con số quy đổi.

**Cách đã tiết kiệm token:**
- Gần như toàn bộ input đọc từ cache (giữ phiên liền mạch, không đổi system prompt).
- Chỉ đọc phần file cần, tìm bằng `grep`.
- Sửa nhiều chỗ bằng một script thay vì nhiều lần Edit kèm đọc lại.
- Không chạy subagent.
- Báo cáo bằng file trong repo (verify-report, e2e-ui.md) thay vì dán log dài vào hội thoại.

## 6. Nếu làm lại thì đổi gì

- Đặt ngân sách hiệu năng (200 thực thể, 60 FPS) và vẽ instanced ngay từ Phase 2.
- Viết test e2e cho giao diện từ Phase 1, không chỉ dựa vào ảnh chụp.
- Ghi script ra file ngay từ đầu, không dùng heredoc trên Windows.
- Gom các giả định cần hỏi trợ giảng (điểm xuất phát Đêm 3, "đi về đèn tắt gần nhất", cờ V8 của soak) và hỏi sớm, trước khi tag.
- Không bao giờ dùng pipe che mã thoát của bước verify trước khi tag.
