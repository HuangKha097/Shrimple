# Bằng chứng dọn code và tái dựng tài liệu

Ngày xác minh: **2026-10-08**, múi giờ Asia/Saigon. Repo: QtmShrimple/Shrimple.

## 1. Phạm vi và trạng thái đầu vào

Working tree đã có thay đổi chưa commit cho nhóm/vai trò/lời mời, refresh auth,
Socket.IO và integration tests. Đợt dọn giữ các thay đổi đó, không dùng HEAD để
ghi đè file. Tài liệu KaZhen chỉ dùng làm mẫu cấu trúc; không đưa nghiệp vụ
hoặc quy định của KaZhen vào phạm vi Shrimple.

Client baseline: **35 lỗi và 7 cảnh báo ESLint**. Đồ thị import từ
`client/src/main.jsx`, `server/server.js` và test entrypoints tìm thấy 6 file
không reachable. Các tên file/asset được tìm lại toàn repo để kiểm tra tham
chiếu ngoài import trước khi xóa.

## 2. Những phần đã loại bỏ

| Phần | Bằng chứng và lý do |
| --- | --- |
| `client/src/components/common/loading/Loading.jsx` và `client/src/assets/css/Loading.module.scss` | Không được import; ứng dụng dùng LoadingSpin và GlobalLoadingOverlay |
| `client/src/assets/css/ProfileContainer.module.scss` | Không được import; ProfileContainer dùng stylesheet hiện hữu khác |
| `client/src/components/lightswind-pro/index.js` | Barrel không có consumer; OTP được import trực tiếp từ otp-input |
| `client/src/components/setting/ChatSettings.jsx` | Alias LanguageSettings không được import; menu dùng LanguageSettings trực tiếp |
| `client/src/services/userService.js` | Service bạn bè cũ không có consumer; code đang dùng friendService/userSettingsService |
| Ba `*-weights_manifest.json` Face API dưới `client/public/models/` | Không còn loader Face API; Anti-Peep chỉ tải `/models/human/`; các manifest còn trỏ tới BIN không có trong thư mục |
| `emoji-picker-react` trong server | Server không import; picker được dùng ở client. npm loại cả dependency và hai dependency/peer chỉ phục vụ nó; lockfile đã đồng bộ |
| 113 import binding client | Kiểm tra binding reference bằng Babel AST gồm cả JSX; loại React import không cần trong automatic JSX runtime, icon/hook/store/module không dùng |
| State/ref/subscription dư thừa | Audio volume/progress ref; groupDesc và file state không đọc; hai sidebar store subscription; helper logout ChatPage không gọi; cx provider không dùng |
| Callback/prop dư thừa | OTP onComplete rỗng; prop không dùng ở nav/sidebar/participant/video; catch binding không đọc; setCallAccepted không cần signal do CallModal xử lý signaling |
| Memoization ChatHeader | Biểu thức quyền gọi giữ nguyên; bỏ useMemo sau early return, loại lỗi thứ tự hook khi chuyển từ chưa chọn chat sang có chat |
| Log và chú thích cũ | Log debug danh sách nhóm, import comment cũ và ghi chú service không còn đúng |
| README client mẫu Vite | Thay bằng hướng dẫn frontend thực tế và liên kết bộ tài liệu dự án |

Tổng cộng **9 file code/style/manifest cũ** đã xóa. Giữ Human JSON/BIN,
favicon/brand assets, Python model/dataset/training script, các routes/schema,
tài liệu và kế hoạch cũ. Avatar nhóm vẫn chỉ preview ở màn tạo nhóm; đợt dọn
không bổ sung upload chưa có, việc này được ghi backlog.

Đồ thị sau cleanup: **0 file source/style không reachable** trong phạm vi
entrypoints đã kiểm tra; **0 backend dependency không có import**. Đây là kiểm
tra tĩnh, không phải chứng minh mọi export/CSS selector hoặc asset đều được dùng.
Sass là dependency build nên không xóa dù không import trực tiếp từ JS.

## 3. Kết quả kiểm tra

| Kiểm tra | Kết quả thực tế | Giới hạn |
| --- | --- | --- |
| `npm --prefix client run lint` | PASS, exit 0; **0 errors, 7 warnings** | Cảnh báo exhaustive-deps có sẵn còn ở FaceIDCalibrationModal, CallModal, ChatBody, ChatHeader, ProfileContainer, VideoFeed |
| `npm --prefix client test` | PASS **8/8** | Unit tests tracker/attention Anti-Peep |
| `npm --prefix client run build` | PASS, exit 0, 47,96 giây | Cảnh báo mixed static/dynamic import auth store và chunk >500 kB còn tồn tại |
| `npm --prefix server test` với cache bên dưới | PASS **10/10** | REST/Socket.IO nhóm, quyền, token, join đồng thời, thu hồi quyền và xóa nhóm; MongoDB tạm |
| `node --check` trên server.js và toàn bộ server/src JS | PASS | Syntax, không thay thế lint hoặc test backend đầy đủ |
| `npm --prefix server ls --depth=0` | PASS | Dependency hiện cài khớp manifest; không kiểm định lỗ hổng supply chain |
| `git diff --check` | PASS | Whitespace tracked diff |
| Review độc lập cleanup | Không tìm thấy regression hoặc blocker do đợt dọn gây ra | Kiểm tra import side effects/JSX, prop/state/caller, hook, dependency và file bị xóa; tách các thay đổi nhóm có sẵn khỏi cleanup |
| Kiểm tra tài liệu | PASS: đủ file, liên kết file tương đối tồn tại, ticket không trùng; 40 ticket = 23 Done + 17 Backlog | Các file chính <800 dòng; PRD có 21 FR, 16 BR, 18 AC, 10 NFR; không xác nhận anchor/render hay từng flow runtime |
| Browser, camera, Google/SMTP/Cloudinary, WebRTC/NAT, production | **Chưa chạy trong đợt này** | Không đánh đồng test/build với nghiệm thu E2E hoặc phát hành |

Chunk production được đo: main JS 1.649,45 kB (gzip 490,43 kB), Human JS
1.577,14 kB (gzip 422,90 kB). Tối ưu bundle là ticket riêng; không tăng giới hạn
cảnh báo để che kết quả.

### Test server bằng cache sẵn có (PowerShell, từ root)

Lần chạy mặc định bắt đầu tải MongoDB 8.2.6 vào cache user (~781 MB) và được
dừng khi tìm thấy binary đã có trong cache dự án. Lần xác minh PASS dùng:

```powershell
$env:MONGOMS_DOWNLOAD_DIR = Join-Path (Get-Location) 'server/node_modules/.cache/mongodb-memory-server'
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
npm --prefix server test
Remove-Item Env:MONGOMS_DOWNLOAD_DIR, Env:MONGOMS_RUNTIME_DOWNLOAD
```

Chỉ dùng cách này khi cache thực sự có binary. Máy mới cần cho phép tải binary
hoặc chỉ định `MONGOMS_SYSTEM_BINARY` tới binary cục bộ phù hợp. Tests tự tạo
MongoDB tạm, đặt test JWT secret và dọn dữ liệu; không dùng URI/DB ứng dụng thật.

## 4. Cách đọc trạng thái tài liệu

PRD/kanban/design/plan mô tả working tree ngày khảo sát, không phải bản PRD đã
được duyệt trước khi viết code. Ticket Done cho baseline có code và evidence
triển khai; ticket QA/hardening và phần chưa nối end-to-end vẫn mở. Không có
deployment, commit hoặc nghiệm thu sản phẩm thật trong đợt này.
