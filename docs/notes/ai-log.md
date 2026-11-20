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

**Token / chi phí (ước tính):** khoảng 60–80k token output, khoảng 2–3M token input (phần lớn là cache của ngữ cảnh lặp lại), một phiên làm việc. Số chính xác xem bằng `/cost` trong Claude Code.

**Cách tiết kiệm:**
- Không dùng subagent.
- Đọc lab board một lần rồi lưu tóm tắt contract vào repo (`docs/notes/test-contract-v1.0.md`) để các phase sau không phải đọc lại.
- Không dùng framework hay bundler, nên agent không phải debug cấu hình build.
- Test chạy trong 1.5 giây, nên vòng phản hồi nhanh.
