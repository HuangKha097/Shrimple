# Kiểm tra conflict sau pull và khôi phục thay đổi UI local

Ngày kiểm tra: 2026-10-15, Asia/Saigon. Upstream HEAD: `91abcf7`.

## Phạm vi

Pull fast-forward từ `db4187c` tới `91abcf7` đã hoàn tất. Khi áp lại thay đổi
local, Git còn 5 file unmerged với marker `Updated upstream` / `Stashed changes`:

- `client/src/components/common/XNavRail.jsx`: dùng các icon cần thiết cho danh sách điều hướng chung.
- `client/src/components/posts/PostsSidebar.jsx`: giữ translation và signOut cho menu mobile.
- `client/src/components/setting/SettingContainer.jsx`: chỉ giữ các hook còn được dùng.
- `client/src/components/slidebar/SlideBar.jsx`: giữ prop onOpenNavigation để mở menu chat mobile.
- `client/src/pages/ChatPage.jsx`: giải conflict khoảng trắng ở nhóm import.

Giữ cleanup/import của upstream và các thay đổi local: tải QR qua snapshot,
dark-only, không mount Anti-Peep, điều hướng desktop/mobile dùng chung,
settings mobile và offset nút bài viết mới 112px. Luồng invite preview xác nhận
và pending invite qua onboarding từ upstream vẫn được giữ.

Chỉ đánh dấu resolved 5 file trên trong Git index; giữ các thay đổi staged
trước đó. Agent không thực hiện commit, push hoặc deploy. Trong lúc xác minh,
HEAD đã chuyển tới `f67428c` (feat(frontend): fix buttons); kiểm tra cuối không
còn file unmerged. File evidence này đang untracked.

## Kết quả kiểm tra

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| `git ls-files -u`, `git diff --name-only --diff-filter=U` | Rỗng | Git index không còn file unmerged |
| Tìm marker conflict trong source/docs | Không có | Kiểm tra tĩnh |
| `git diff --cached --check` | PASS | Whitespace staged changes |
| Client lint | PASS, 0 errors / 8 warnings | Cảnh báo hook dependency có sẵn |
| Client tests | PASS, 8/8 | Tracker tests, không xác nhận camera/UI hoặc deployment |
| Client build | PASS, 3502 modules / 18.09s | Còn mixed import và large bundle warnings |
| Client/server `npm ci --ignore-scripts --no-audit --no-fund` | PASS | Đồng bộ dependency theo lockfile; không chạy lifecycle scripts |
| Client/server `npm ls --depth=0` | PASS | Không có missing/invalid/extraneous dependency ở root |
| `node --check` server/server.js và server/src JS | PASS, 37 file | Syntax, không thay integration tests |

Build lần đầu thất bại vì thiếu `qrcode.react` trong node_modules. Server cũng
thiếu `mongodb-memory-server` và có socket.io-client không khớp manifest.
Sau khi đồng bộ node_modules, dependency checks và frontend build đã qua;
package.json/lockfile không bị thay đổi.

Server integration tests, live AI, camera, browser/device, WebRTC và production
không được chạy lại trong lượt này. Không tìm thấy MongoDB binary trong các
cache được kiểm tra; integration tests cần MongoDB tạm, không dùng DB ứng dụng.

## Vercel 404 sau khi tạo deployment mới

Deployment `4eHqmnL8PBKqWR57663zQNF9Mas8` là Production/Ready và có Source
`f67428c`, nhưng domain gốc trả 404. Dashboard Build and Deployment vẫn có
Framework Preset `Other`, Root Directory trống, không có build/output override.
Frontend thực tế nằm trong `client/` và build ra `client/dist/index.html`.

Cấu hình cần áp dụng trên Vercel: Root Directory `client`, Framework `Vite`,
Build Command `npm run build`, Output Directory `dist`, Install Command `npm ci`.
Thêm `client/vercel.json` để lưu cấu hình Vite/build và SPA fallback cho URL
trực tiếp; `/api/*` được proxy tới backend Render hiện có để giữ fallback API
same-origin của client. `VITE_API_URL` nếu có vẫn giữ hành vi hiện tại.

JSON local parse thành công và artifact `client/dist/index.html` tồn tại.
Chưa sửa/lưu Project Settings hoặc redeploy trong lượt kiểm tra này; cần push
config mới sau khi sửa Root Directory và xác minh domain/routes trên deployment mới.
