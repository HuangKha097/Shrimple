# Chạy thử project và sửa lỗi ngày 2026-10-17

Ngày: 2026-10-17, Asia/Saigon. Phạm vi: working tree hiện có, gồm nhiều thay đổi
chưa commit của người dùng. Không commit/push/deploy; không dùng DB ứng dụng.

## Lỗi đã xác nhận và sửa

| Lỗi | Nguyên nhân / thay đổi | Evidence |
| --- | --- | --- |
| Khung soạn chat vi phạm thứ tự Hooks khi chuyển trạng thái được/không được gửi | Hai `useMemo` trong `ChatInput.jsx` nằm sau early return `!chatStatus.allowed`; chuyển lên trước return, giữ điều kiện friendship/block/group | Lint trước sửa có 2 rules-of-hooks errors; browser sau sửa chuyển friend → nonfriend → friend và gửi tin thành công |
| Hai module không hợp lệ với Fast Refresh | `MentionAutocomplete.jsx` export helper bên cạnh component; `ChatDrawOverlay.jsx` export store nội bộ. Chuyển helper nguyên semantics sang `utils/mention.js`, sửa 3 consumers; bỏ export store không có consumer ngoài file | Trước sửa 2 only-export-components errors; sau sửa 0 errors |
| Nhắc bạn bè trong bài viết dùng username tự suy từ tên hiển thị | GET `/api/friends` không chọn `username`, khiến gợi ý `@test_bob` cho tài khoản thật `@bob`; thêm username vào projection hai chiều | Regression thất bại trước sửa vì thiếu field; sau sửa pass cả hai chiều, 401 khi chưa đăng nhập và danh sách trống khi không có bạn |
| Cài đặt hứa xóa toàn bộ dữ liệu tài khoản | Controller hiện chỉ xóa User. Sửa `settings.deleteAccountDesc` vi/en/zh nói rõ bài viết/tin nhắn/dữ liệu liên quan chưa tự động bị xóa | Đọc controller + DOM sau sửa; không xóa tài khoản. QS-B05 vẫn Backlog |

Source thay đổi trong đợt này: `ChatInput.jsx`, `ChatDrawOverlay.jsx`,
`MentionAutocomplete.jsx`, `PostsContainer.jsx`, `PostItem.jsx`,
`client/src/utils/mention.js`, `client/src/i18n.js`,
`server/src/controllers/friendController.js`, `server/test/groups.test.js`.

API chỉ thêm field công khai `username` vào friend DTO (xem Design). Regression
so sánh toàn bộ DTO để phát hiện trả thêm password/email/field riêng tư.
Không đổi quyền nhắn tin, chính sách xóa dữ liệu hoặc dependency.

## Kết quả kiểm tra thực chạy

| Check | Kết quả cuối | Giới hạn |
| --- | --- | --- |
| `npm --prefix client run lint` | PASS, 0 errors / 9 warnings | Hook dependency warnings có sẵn còn lại |
| `npm --prefix client test` | PASS, 8/8 | Anti-Peep tracker; không perception/camera |
| `npm --prefix client run build` | PASS, 3507 modules, 18.28s | Còn mixed static/dynamic auth store import và chunk >500 kB; JS chính khoảng 2.62 MB |
| `npm --prefix server test` với cache dưới đây | PASS, 21/21 | Nhóm/poll/socket/direct translation session và friend DTO; không live AI |
| `node --check` server.js + server/src JS | PASS, 37 files | Syntax |
| `npm --prefix client ls --depth=0`, tương tự server | PASS cả hai | Dependency root khớp; không thay security audit |
| `git diff --check` toàn working tree | FAIL do trailing whitespace trong thay đổi có sẵn | Không dọn/revert thay đổi ngoài phạm vi |

Lượt server test đầu không tải được MongoDB (EACCES). Cache thực tế có binary
8.2.6; dùng cấu hình kiểm tra từ evidence cleanup:

```powershell
$env:MONGOMS_DOWNLOAD_DIR = Join-Path (Get-Location) 'server/node_modules/.cache/mongodb-memory-server'
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
npm --prefix server test
Remove-Item Env:MONGOMS_DOWNLOAD_DIR, Env:MONGOMS_RUNTIME_DOWNLOAD
```

Lượt giữa chạy đồng thời build/lint/test có 19/20 pass do MongoDB instance của
translation suite không khởi động trong 10 giây. Chạy tuần tự đạt 20/20; sau khi
thêm regression, chạy tuần tự lẫn npm test mặc định đều đạt 21/21. Không đổi
timeout/script sản phẩm để che lỗi môi trường.

## Browser walkthrough cục bộ

Frontend Vite `http://localhost:5173`, backend `http://localhost:5002`, chạy
bootstrap/routes thật với MongoMemoryServer. Seed ba người dùng giả, quan hệ
bạn bè, direct/group conversations và bài viết. Harness nằm trong
`server/.tmp/` (ignored), cwd riêng để không nạp `.env` thật.

Seed lịch sử cuối dùng `upDateConversationAfterCreateMessage` đúng schema;
seed thử ban đầu thiếu `lastMessage.senderId` đã được sửa trong harness,
không coi là lỗi sản phẩm. Môi trường thử được dừng sau kiểm tra.

Đã thao tác qua UI:

- Đăng nhập email bằng tài khoản giả; tải conversation/friend/history qua API.
- Đổi friend → nonfriend → friend: có banner chặn đúng, không crash; unread
  được cập nhật và gửi tin thành công khi quay lại friend.
- Gõ `@bo`, chọn bằng Enter: chèn `@bob`, không gửi ngay khi chọn; gửi bằng nút
  Gửi thành công. Nhóm: chọn/gửi `@everyone`, mở/đóng toolbar vẽ.
- Bảng tin gợi ý đúng `@bob` sau sửa API; tạo bài và bình luận nhắc tên thành công.
- Mobile 390×844: feed và menu cài đặt mở được, document width 390, không tràn
  ngang trong hai màn đã xem; trả lại viewport desktop mặc định sau kiểm tra.
- Đọc cảnh báo xóa tài khoản sau sửa; không gửi thao tác xóa/đổi mật khẩu.
- Console trong cửa sổ kiểm tra cuối sau reload: 0 errors. Trước đó có Google
  client ID thiếu trong môi trường thử và HMR lúc tách helper; không dùng kết
  quả này để xác nhận Google OAuth.

Ảnh và manifest:

- [Chat sau sửa](./assets/2026-10-17-smoke/chat-fixed.jpg)
- [Bài viết và bình luận nhắc tên](./assets/2026-10-17-smoke/feed-mentions.jpg)
- [Feed mobile](./assets/2026-10-17-smoke/feed-mobile.jpg)
- [Cài đặt mobile](./assets/2026-10-17-smoke/settings-mobile.jpg)
- [Browser checks](./assets/2026-10-17-smoke/browser-checks.json)

Chưa thử vẽ/xuất ảnh/đồng bộ nét vẽ giữa hai browser, notification tới browser
thứ hai, email/OTP/Google OAuth thật, Cloudinary uploads, microphone, camera,
Anti-Peep enrollment, WebRTC, live AI/test:ai hoặc production. Các AC còn lại
của QS-B01/B02/B03/B05, QS-Q01/Q02/Q03 vẫn mở; không coi walkthrough này là
nghiệm thu toàn ứng dụng. Warnings lint/build cần review theo lifecycle thực tế.
