# Dọn code và dựng lại tài liệu Shrimple

Ngày: 2026-10-08 (Asia/Saigon). Trạng thái: hoàn thành.

## Phạm vi đã rà soát

- React 19/Vite 7/ESM, Sass Modules, Zustand; backend Express 5/Mongoose/Socket.IO.
- Giữ toàn bộ thay đổi có sẵn của người dùng, đặc biệt nhóm/vai trò/lời mời.
- Xóa file không reachable từ entrypoint và không có tham chiếu ngoài đồ thị import.
- Xóa dependency backend không dùng, import/state/ref/callback bỏ trống; bỏ memoization dư thừa gây hook có điều kiện.
- Dựng PRD, kanban, design, plan và AGENTS theo code hiện tại; KaZhen chỉ là mẫu cấu trúc.

## Thứ tự thực hiện

1. [x] Chụp trạng thái working tree, đọc cấu hình, entrypoint và tài liệu hiện hữu.
2. [x] Chạy lint baseline; dựng đồ thị import và rà tham chiếu toàn repo.
3. [x] Dọn code/asset/dependency đã xác nhận không dùng.
4. [x] Dựng tài liệu với evidence, FR/BR/AC và ticket Done/Backlog.
5. [x] Kiểm tra lint, build, tests client/server, syntax server, lockfile và liên kết tài liệu.
6. [x] Ghi kết quả xác minh và rà diff, xóa báo cáo tạm.

## Tiêu chí hoàn thành

- Không đổi API công khai, schema DB, nghiệp vụ hoặc cấu hình env trong đợt dọn này.
- Không xóa Human model, dữ liệu/model Python tùy chọn, lịch sử docs/plans hoặc file có tham chiếu.
- Build và tests hiện có đạt; không còn lint errors; warnings hiện hữu được ghi rõ.
- Tài liệu phân biệt triển khai trong code với nghiệm thu E2E/browser/production.
- Không commit/push/deploy; không truy cập DB thật hoặc tiết lộ env.

## Bằng chứng baseline

Client lint: 35 errors, 7 warnings. Đồ thị import: 6 file không reachable.
Backend: `emoji-picker-react` không được import; chỉ client dùng picker.
Face API manifest cũ không có loader runtime; Anti-Peep dùng `/models/human/`.

## Kết quả cleanup và review

Đã xóa 9 file không dùng và 113 import binding; dependency backend picker đã
được gỡ cùng lockfile. Client lint còn 0 lỗi/7 cảnh báo có sẵn, 8/8 unit tests
và production build đạt. Server 10/10 integration tests với MongoDB tạm từ
cache dự án, syntax toàn bộ JS đạt. Review độc lập không tìm thấy regression
do cleanup. Kết quả chi tiết: [validation](../../docs/validation/codebase-cleanup.md).

Chưa nghiệm thu browser, camera, WebRTC hoặc production; các mục này tiếp tục
ở backlog, không chặn việc hoàn thành tài liệu baseline.

Bộ tài liệu hoàn thành: docs/prd.md, docs/kanban.md, docs/design.md,
docs/plan.md, docs/codebase-summary.md và AGENTS.md. Kanban có 40 ticket:
23 Done triển khai, 17 Backlog. PRD có 21 FR, 16 BR, 18 AC và 10 NFR.
Kiểm tra liên kết file và ticket trùng đạt; tất cả tài liệu dưới 800 dòng.
