# Local HTTP và CORS — 2026-10-17

Phạm vi QS-I02 / FR-02 và cấu hình chạy local. Không nghiệm thu đăng nhập
Google, tài khoản thật, WebRTC hoặc dịch audio.

## Nguyên nhân

Ảnh lỗi đầu cho thấy browser localhost gọi Socket.IO tới Render. Ảnh sau có
`ERR_SSL_PROTOCOL_ERROR` tại cổng5001 và lỗi Google không chấp nhận origin.
Kiểm tra loại địa chỉ trong container frontend, không in giá trị env thật,
xác nhận ba URL API/socket/assets đang dùng HTTPS localhost. Express hiện
chạy HTTP, không có TLS. Đây là hai lỗi cấu hình riêng: URL backend và
origin được đăng ký cho Google OAuth Web Client.

## Thay đổi và áp dụng

- `compose.yaml`: override VITE_API_URL, VITE_SOCKET_URL, VITE_ASSET_BASE_URL
  thành `http://localhost:5001`; backend development, PORT5001 và CORS cho
  `http://localhost:5173`. Giữ JWT, membership và auth middleware.
- Không sửa giá trị env thật hoặc OAuth client ID, không đổi model/volume.
- Đã chạy `docker compose up -d --no-deps frontend backend`; chỉ hai container
  này được recreate. Không rebuild hoặc restart model services.
- README/Design/Plan và ticket cập nhật cấu hình local cùng giới hạn Google.

## Kiểm tra thực chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `docker compose config --quiet` | PASS |
| `docker compose -f compose.yaml -f compose.gpu.yaml config --quiet` | PASS; chỉ parse cấu hình, không chạy GPU |
| Module `/src/config/env.js` do Vite đang phục vụ | HTTP200; cả ba VITE URL được inject là http://localhost:5001; chỉ xuất boolean, không in module/env |
| GET `/api/users/me` không token, Origin local | HTTP401; Access-Control-Allow-Origin đúng http://localhost:5173, credentials=true |
| OPTIONS `/api/auth/google`, JSON và Authorization | HTTP204; origin local và header Authorization được cho phép |
| GET Socket.IO EIO4/transport=polling, Origin local | HTTP200, packet mở Engine.IO hợp lệ, origin local và credentials=true |
| Origin https://untrusted.example với REST và Socket.IO | Không có Access-Control-Allow-Origin; không cấp quyền CORS ngoài allowlist |
| Browser IAB tại `/signin` | Trang đăng nhập, form và nút Google hiển thị; không gửi thông tin đăng nhập |
| Console lượt browser mới | Còn lỗi Google origin và cảnh báo width100% của nút Google; không ghi nhận lỗi API/socket/SSL trong lượt này |
| `git diff --check` | PASS |

Các HTTP probes dùng Node fetch, không gửi token/cookie/credential, không tạo
user hoặc đọc/ghi dữ liệu nghiệp vụ. Engine.IO transport mở chưa chứng minh
Socket.IO namespace có JWT đã kết nối hoặc cuộc gọi đã hoạt động.

Không chạy lint/build hoặc suite ứng dụng: không sửa JS/JSX, dependencies hay
logic nghiệp vụ; thay đổi source chỉ là Compose và docs, đã kiểm tra cấu hình
và runtime trực tiếp. Lần mở tab IAB đầu timeout; tab sau đó tải xong và được
kiểm tra lại qua accessibility tree và console, không coi timeout là PASS.

## Phần còn cần cấu hình tại Google

Lỗi `The given origin is not allowed for the given client ID` vẫn tái hiện.
Theo [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid),
OAuth Web Client dùng cho app cần Authorized JavaScript origins gồm
`http://localhost` và `http://localhost:5173`. Frontend/backend phải dùng đúng
cùng Google client ID. Chưa thay đổi Google Cloud Console hoặc xác nhận đăng
nhập Google thành công; không thể sửa allowlist của Google qua CORS Express.

Khi trở lại tab trình duyệt đang mở từ trước, reload để nhận cấu hình Vite mới.
Thay đổi chưa commit/push/deploy. Qwen download/readiness và CPU inference là
phạm vi khác; xem [Whisper CPU](./2026-10-17-whisper-cpu-build.md).
