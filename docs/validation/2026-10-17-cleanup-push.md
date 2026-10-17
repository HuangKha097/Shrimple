# Cleanup source và chuẩn bị push qua GitHub Desktop

Ngày: 2026-10-17, Asia/Saigon. Người dùng xác nhận push toàn bộ source hiện tại,
gồm các thay đổi có sẵn; yêu cầu commit/push bằng GitHub Desktop. Nhánh `main`,
remote `origin` là repository Shrimple của người dùng. Không dùng force push.

Source được commit qua GitHub Desktop: `27da784`
(`refactor: clean application source and preserve chat regressions`). Evidence
này được commit riêng để giữ kết quả kiểm tra và giới hạn nghiệm thu cùng source.

## Phần dọn trong đợt này

- Bỏ dependency `qr-code-styling` và dependency con không còn consumer; cập nhật
  package.json/lockfile bằng npm uninstall offline. Giữ `qrcode` và `qrcode.react`.
- Xóa `TreeQRCodeModal.module.scss` cũ: component thực sự dùng
  `components/magic-tree/styles.css`. Xóa prototype `magic-tree/audio/ambience.ts`
  không có import, runtime entry, UI consumer hoặc side effect khi import.
- Bỏ React default imports/icon bindings/AnimatePresence không dùng. Giữ TS
  type imports, Human models, Python inference/training/model/data và scene QR.
- Dùng fallback messages ổn định trong ChatBody; scalar chatId/joinedAt/video
  count cho dependencies. Tách fetch feed khỏi fetch friends để cập nhật bạn bè
  không làm tải lại feed; danh sách [] không tự lặp effect.
- PIN keypad dùng callbacks ổn định và functional React setter; giữ giới hạn
  bốn ký tự và xử lý bàn phím hiện có.
- Backend bỏ namespace `ongoose`, assignment không dùng của `Friend.create`
  (vẫn await ghi DB), alias formatter không có consumer ngoài module. Import
  `Post.js` được giữ dưới dạng side-effect import để đăng ký Mongoose model.
- Dọn trailing whitespace; phần JS thông thường được so sánh kết quả biên dịch
  trước/sau. Các dòng trống trong template HTML email chỉ bỏ khoảng trắng đầu
  dòng; bỏ comment cũ nói log OTP không đúng với implementation hiện tại.
- Ignore `.vercel/` và `output/` để không push cấu hình máy và báo cáo xuất ra.
  Ảnh/manifest của walkthrough dữ liệu giả trước đó được lưu vào
  `docs/validation/assets/2026-10-17-smoke/`, cập nhật links evidence.

Không thấy test hồi quy nào trùng/thừa để xóa: giữ 21 ca server cho friend DTO,
quyền nhóm/invite/poll/socket/races/direct session và 8 ca tracker attention.
`test:ai` vẫn là smoke riêng cần service thật. Việc xóa
`friendRecommendations.test.js` đã có trong working tree trước đợt này, đi kèm
module recommendation đã bị loại; không dùng nó để giảm số test còn hoạt động.

Anti-Peep hiện không mount vào main/settings flow của working tree hiện tại;
giữ subsystem/model theo hướng dẫn repo. Không coi việc graph hiện không chạm
tới subsystem là bằng chứng được phép xóa hoặc đã nghiệm thu camera.

## Kết quả kiểm tra

| Check | Kết quả | Giới hạn |
| --- | --- | --- |
| Client lint | PASS, 0 errors / 3 warnings | Giảm từ 9; còn 2 warnings CallModal và 1 TreeQRCodeModal cần review lifecycle media/scene riêng |
| Client tests | PASS, 8/8 | Tracker, không camera |
| Client build | PASS, 3507 modules, 29.54s | Mixed import useAuthStore và large chunk warnings còn lại |
| Server tests với MongoDB cache workspace | PASS, 21/21 | MongoDB tạm, không DB thật/live AI |
| Backend syntax | PASS, 37 JS files | server.js và server/src |
| Client/server npm ls --depth=0 | PASS | Không missing/invalid root dependency |
| git diff --check | PASS | Sau dọn whitespace; không thay kiểm tra nghiệp vụ |
| Review độc lập, phạm vi cleanup | Không có phát hiện cần sửa | Review tĩnh, không thay full app/security acceptance |
| Kiểm tra secrets trước commit | Không phát hiện private key/provider token/JWT thật trong candidate files | Env thật bị loại; test secrets và env example dùng placeholder |

Server test dùng `MONGOMS_DOWNLOAD_DIR=server/node_modules/.cache/mongodb-memory-server`
(absolute path trong lượt chạy) và `MONGOMS_RUNTIME_DOWNLOAD=false`, như
[evidence chạy thử](./2026-10-17-project-smoke.md).

Browser sau cleanup được chuẩn bị với server/DB giả cục bộ, nhưng bước đăng
nhập bị bộ duyệt tự động chặn vì chưa thấy ủy quyền cho tài khoản thử cụ thể.
Đã dừng thao tác, hỏi người dùng; không dùng cách khác để vượt chặn. Evidence
browser trước cleanup vẫn có phạm vi/ngày riêng trong báo cáo chạy thử.

Chưa nghiệm thu camera/WebRTC, QR scan thật, live AI/email/Google/Cloudinary,
privacy/delete lifecycle hoặc production. Push source không xác nhận deployment.
