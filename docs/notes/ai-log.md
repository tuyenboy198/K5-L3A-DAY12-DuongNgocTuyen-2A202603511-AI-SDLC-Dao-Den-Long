# Nhật ký dùng AI

Công cụ: **Claude Code** (model Claude Opus 5.5) trong VS Code. Harness: [CLAUDE.md](../../CLAUDE.md), skill [verify-phase](../../.claude/skills/verify-phase/SKILL.md), Stop hook [tools/stop-gate.js](../../tools/stop-gate.js).

## Phase 1

**Lời nhắc chính:**
1. "Đọc toàn bộ dự án và hệ thống hóa những đầu công việc mà tao phải hoàn thành dự án". Agent đọc 6 file của lab cùng tab Phase 1 trên lab board, rồi lập checklist theo phase và theo rubric.
2. "Đổi lại tên repo cho chuẩn rồi bắt đầu chạy hoàn thành dự án". Agent dựng toàn bộ Phase 1.

**Cách làm với agent:**
- Đọc nguyên văn Test Contract trước, chọn kiến trúc tách sim khỏi render trước khi viết code.
- Viết sim và CLI xong thì chạy thử ngay (2 lần cùng seed → `cmp`) trước khi viết test.
- Kết quả mong đợi của scenario được **tính tay từ luật** (ghi trong `_why`), không chép từ output. Cả 5 scenario khớp ngay lần chạy đầu.
- Mutation thủ công để kiểm tra test có bắt lỗi thật không (xem traceability).

**AI sai ở đâu và cách phát hiện:**

| Lỗi | Phát hiện bằng cách nào | Đã chỉnh gì |
|---|---|---|
| Agent định đổi tên repo bằng cách đọc credential GitHub từ git; bị auto-mode chặn | Hệ thống từ chối quyền | Đổi tên repo do người làm tay trên GitHub (Settings → Repository name) |
| Pattern `sed` cho mutation không khớp code, nên "0 test fail" là kết quả giả | Kiểm tra lại thì thấy file không đổi | Sau đó chạy mutation kèm `cmp` để báo "NOT APPLIED" |
| Git Bash đổi đường dẫn `/scenarios/...` thành `C:/Program Files/Git/...`, ảnh chụp sai scenario | Đọc URL in ra trong log | Dùng đường dẫn tương đối `../scenarios/...` |
| Heredoc lồng `python … || node …` không chạy gì | Grep file thấy chưa thay đổi | Dùng tool Edit thay cho script inline |
| Ảnh đầu tiên quá tối | Mở PNG ra xem | Tăng hemisphere light và giảm sương |

## Nâng cấp đồ họa (theo yêu cầu, trước Ticket-02)

**Lời nhắc:** "cải thiện lại hoạt ảnh, hình nền, tăng độ phân giải cũng như các tương tác giữa nhân vật, ma, và lồng đèn".

- Agent chỉ được sửa `web/` (theo quy tắc trong CLAUDE.md: sáng tạo chỉ nằm ở phần hiển thị). Kiểm chứng bằng `git status src` (không đổi) và hash tất định của CLI giống hệt phase-1.
- Agent tự kiểm tra bằng ảnh chụp thật: `tools/screenshot.js` giờ in ra cả lỗi console và shader của trang, nên ảnh đẹp không che được trang bị lỗi.
- Thêm chế độ replay `?inputs=`/`?ff=` để chụp đúng khoảnh khắc trong scenario.

| Lỗi của AI | Phát hiện | Sửa |
|---|---|---|
| Cây và đá gần camera che kín nhân vật | Xem ảnh chụp | Làm mờ vật nằm trên đoạn camera → Mây |
| Đèn đã thắp bị bloom làm cháy trắng | Xem ảnh chụp | Giảm emissive, light và halo |
| Camera chuyển sang quay vòng ngay khi thắng nên mất hiệu ứng thắp đèn | Ảnh chụp lúc thắng chỉ thấy mặt đất | Chỉ chuyển camera khi màn kết thúc hiện ra |
| Phát tiếng khi chưa có thao tác người dùng (cảnh báo AudioContext) | Log console trong lúc chụp | Chỉ tạo AudioContext sau khi có phím hoặc click |

## Phase 2: Ticket-02 "Ba hòn đảo"

**Lời nhắc chính:**
- "Hiện tại phase 2 đã có trên artifacts, tiếp tục hoàn thiện toàn bộ theo yêu cầu phase 2".
- Sau đó dán nguyên văn Ticket-02, vì agent không đọc được database của lab board (artifact thuộc tổ chức khác, bị từ chối truy cập).

**Cách làm với agent:**
1. Đọc ticket rồi tách thành ba phần: (1) sim + contract, (2) test, (3) UI, ưu tiên theo điểm. Phần (1) liên quan 30 điểm test ẩn nên làm trước.
2. Viết lại `step()` đúng **12 bước** của ticket, mỗi bước có comment đánh số, để người review dò theo ticket.
3. Tính tay 13 scenario trước, rồi mới chạy CLI để so. Cả 13 khớp **đúng từng tick** ngay lần đầu, kể cả pause/resume, rơi khỏi đảo, Gió Lạc cướp rồi đánh rơi.
4. Mutation thủ công trên các luật mới. Một mutation lọt (bỏ đẩy Bóng ra khỏi vùng đèn vừa thắp), nên đã thêm kiểm tra vị trí ở tick 15. Mutation "nhặt từ tick sau" cho thấy điều kiện đó thừa, nên đã xóa code chết.
5. Đo FPS bằng cửa sổ trình duyệt thật có GPU (`tools/fps.js`), vì headless chỉ render bằng phần mềm.

**AI sai ở đâu:**

| Lỗi | Phát hiện | Sửa |
|---|---|---|
| Đặt điểm xuất phát Đêm 3 ở (0,0,0), nằm trong tháp chuông nên Mây bị đẩy lên nóc tháp | Mở ảnh chụp Đêm 3 thì chỉ thấy mặt tháp | Đổi sang (0,0,−30), thêm test "điểm xuất phát nằm trên mặt đất", ghi giả định cần hỏi trợ giảng |
| Scenario rơi khỏi đảo dùng `move [-1,0]` để đi +X (sai hướng) | Tự soát lại trước khi chạy | Sửa thành `[1,0]`; thêm dòng nhắc vào CLAUDE.md |
| 7 test đầu tiên viết sai: giả định sai về trạng thái lúc tick 0, Bóng "lơ lửng" bị hạ độ cao, đứng yên nên nhặt lại bùa… | Đọc từng thông báo lỗi, đối chiếu với ticket | Sửa **test**, không sửa sim (trừ việc cho `createGame` nhận mote dạng mảng) |
| Heredoc Bash bị lỗi trích dẫn khi ghi nhiều file JSON | Lỗi "unexpected EOF" | Gom scenario vào một file JSON rồi tách bằng Node |
| Lần sửa `verify.js` bằng script lồng template string bị lỗi cú pháp nên không áp dụng gì | Báo cáo verify vẫn là bản cũ | Dùng tool Edit |
| Đo FPS bị timeout ngẫu nhiên (cửa sổ bị che hoặc khởi động chậm) | Có Đêm báo "no result" | Thêm cờ không giảm tốc cửa sổ bị che, tự thử lại tối đa 3 lần |

**Harness đã chỉnh trong Phase 2:**
- CLAUDE.md: contract v1.1, bản đồ, quy ước góc, tránh biên số thực khi tính tay, nhắc hướng `move`.
- Skill `verify-phase`: thêm bước mutation có `cmp`, đo FPS, đặt `night` cho scenario.
- `tools/screenshot.js` in ra lỗi của trang; `tools/fps.js` mới.

## Phase 3: Ticket-03 "Đèn cạn dầu" (change request, 30 phút)

**Lời nhắc:** dán nguyên văn Ticket-03, kèm "Hoàn thiện tiếp công việc phase 3".

**Cách làm:**
1. Viết ADR trước khi sửa code, chốt hai quyết định: lưu dầu bằng số nguyên 1/60, và vùng an toàn là hàm suy ra `hasZone()`.
2. Sửa sim bằng các Edit nhỏ, đúng vị trí bước 2b, 5, 6, 7, 8, 11.
3. Chạy test cũ để thấy chính xác **8 test** bị luật mới thay. Sửa hoặc xóa từng test, ghi lý do trong phase-3.md.
4. Thêm 4 scenario tính tay. Chủ động chọn số không rơi vào biên làm tròn (fuel 13.633 thay vì 13.65), và cả 4 khớp ngay lần chạy đầu.
5. Mutation 5 luật mới: cả 5 đều bị bắt.

**AI sai ở đâu:**

| Lỗi | Phát hiện | Sửa |
|---|---|---|
| Test "dầu < 30 mất vùng" đặt Bóng quá xa (6.5 m), 1 tick không thể vào trong 6 m dù không có vùng | Test fail | Đặt Bóng ở 6.05 m |
| So khoảng cách với 1e-6 trên tọa độ snapshot đã làm tròn 3 chữ số | Debug in khoảng cách thật = 6.000000 | Dung sai 2e-3 |
| HUD: nhãn `carry-num` không được tạo vì so số phần tử con có cả nhãn | `tools/screenshot.js` in "Uncaught TypeError" của trang | So theo số `.cell` |
| Ký tự ⚠ trong CSS bị hỏng do escape lồng nhau | grep không thấy ký tự | Thay bằng regex trong Node |
| Heredoc Bash bị lỗi trích dẫn lần nữa | "unexpected EOF" | Viết file tạm bằng Write rồi nối bằng Node |
| Đổi tên `deposit_win` → `deposit_light` nhưng quên `tools/verify.js` vẫn dùng file inputs cũ; verify crash, mà chuỗi lệnh `| tail` nuốt mã lỗi nên tag phase-3 được push khi chưa có verify-report | Đọc output thấy ENOENT sau khi đã push | Sửa đường dẫn, chạy lại với `set -o pipefail`, commit báo cáo ngay sau tag |

**Token / chi phí (ước tính):** khoảng 60–80k token output, khoảng 2–3M token input (phần lớn là cache của ngữ cảnh lặp lại), một phiên làm việc. Số chính xác xem bằng `/cost` trong Claude Code.

**Cách tiết kiệm:**
- Không dùng subagent.
- Đọc lab board một lần rồi lưu tóm tắt contract vào repo (`docs/notes/test-contract-v1.0.md`) để các phase sau không phải đọc lại.
- Không dùng framework hay bundler, nên agent không phải debug cấu hình build.
- Test chạy trong 1.5 giây, nên vòng phản hồi nhanh.
