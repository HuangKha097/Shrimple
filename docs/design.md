# Design — Shrimple: giao diện, luồng và kiến trúc

Cập nhật: **2026-10-08**. Trạng thái: mô tả thiết kế thực thi hiện tại + khoảng trống cần hoàn thiện. Đọc cùng [PRD](./prd.md), [Kanban](./kanban.md) và [Plan](./plan.md). Không có file Figma hoặc kết quả kiểm thử hình ảnh được xác nhận trong đợt khảo sát này.

## Mục lục

1. [Nguyên tắc và điều hướng](#1-nguyên-tắc-và-điều-hướng)
2. [Layout và hệ thống hiển thị](#2-layout-và-hệ-thống-hiển-thị)
3. [Màn hình và trạng thái](#3-màn-hình-và-trạng-thái)
4. [Tương tác và accessibility](#4-tương-tác-và-accessibility)
5. [Ranh giới kỹ thuật](#5-ranh-giới-kỹ-thuật)
6. [Dữ liệu](#6-dữ-liệu)
7. [Hợp đồng REST](#7-hợp-đồng-rest)
8. [Realtime, cuộc gọi và Anti-Peep](#8-realtime-cuộc-gọi-và-anti-peep)
9. [Thiết kế còn thiếu](#9-thiết-kế-còn-thiếu)

## 1. Nguyên tắc và điều hướng

Giao diện thiên về nội dung: rail điều hướng, danh sách hội thoại/menu feed và vùng nội dung. Chat, feed, video và settings dùng shell `client/src/pages/ChatPage.jsx`. Component dùng React, SCSS Modules, Lucide, Sonner và motion/GSAP; không có Tailwind hoặc design-system package thống nhất toàn bộ app.

| URL thực tế | Màn hình | Quyền / chuyển hướng |
| --- | --- | --- |
| `/signin`, `/signup`, `/forgot-password` | Xác thực | Public |
| `/complete-profile` | Hoàn tất hồ sơ | ProtectedRoute, xử lý onboarding |
| `/` | Chuyển `/chat` | ProtectedRoute |
| `/chat` | Danh sách và hội thoại | ProtectedRoute; có khôi phục invite đang chờ |
| `/groups/join/:token` | Preview/tham gia nhóm | ProtectedRoute; đứng ngoài shell ChatPage |
| `/feed` | Bảng tin | ProtectedRoute |
| `/post/:postId`, `/feed/post/:postId` | Chi tiết bài | ProtectedRoute; hai alias |
| `/feed/search`, `/feed/saved`, `/feed/friends` | Search, đã lưu, bạn bè | ProtectedRoute |
| `/profile/:userId`, `/feed/profile/:userId` | Hồ sơ | ProtectedRoute; hai alias |
| `/video` | Video feed | ProtectedRoute |
| `/setting`, `/settings` | Thiết lập | ProtectedRoute; hai alias |

Router nguồn: `client/src/App.jsx`. Hiện chưa có wildcard route/404 riêng. `SettingContainer.jsx` dùng query `tab=account|language|notifications|anti-peep|blocked|application`; không coi `tab` là endpoint backend.

## 2. Layout và hệ thống hiển thị

### 2.1. Bố cục responsive đang có

| Viewport | Hành vi từ stylesheet | Điều cần nghiệm thu |
| --- | --- | --- |
| <=768 px | Rail desktop ẩn; chat chuyển giữa list và nội dung khi chọn hội thoại; feed có drawer 280 px | Back về list, keyboard không che input, drawer/focus và backdrop |
| 769–1023 px | Rail 72 px; chat list khoảng `clamp(350px, 28vw, 420px)`, vùng chat flex | Khoảng hẹp có thể gây thiếu không gian; cần browser test |
| >=1024 px | Rail 250 px có nhãn; chat list tối đa 420 px; nội dung flex | Long names, media lớn, panel thông tin và call modal |
| Feed desktop | Cột menu 280 px; vùng feed có max-width 1000 px | Widget/sidebar không làm mất vùng đọc |
| Settings mobile | Hai trạng thái menu/detail; nút trở lại danh mục | Back URL, tab param, focus và scroll giữ hợp lý |

Nguồn: `client/src/assets/css/ChatPage.module.scss`, `XNavRail.module.scss`, `SettingContainer.module.scss`. Shell dùng `100dvh` sau fallback `100vh`, overflow nội bộ. Một số nền trong stylesheet vẫn hardcode đen; theme có token không bảo đảm mọi màn sáng đã nhất quán.

### 2.2. Design tokens thực thi

Nguồn chính: `client/src/index.css` và `client/src/stores/useThemeStore.js`.

| Token / cơ chế | Dark | Light / hành vi |
| --- | --- | --- |
| `--primary-backgroundColor` | `#000000` | `#f3f5f7` |
| `--primary-blockBackgroundColor` | `#000000` | `#ffffff` |
| `--primary-textColor` | `#e7e9ea` | `#1c2530` |
| `--primary-borderColor` | `rgba(255,255,255,.08)` | `#dce1e7` |
| `--primary-hoverBackgroundColor` | `rgba(255,255,255,.04)` | `#edf0f4` |
| `--surface-subtle` | `#16181c` | `#f6f8fa` |
| `--text-muted` | `#71767b` | `#596575` |
| `--primary-color`, `--primary-rgb` | CSS fallback `#f97316` | Store mặc định `#e56d32`; nhận hex 6 ký tự |
| `--on-primary` | Theo luminance màu chọn | Tự chọn đen/trắng; không thay thế audit contrast mọi trạng thái |
| `--accent-text` | `#f97316` | color-mix màu primary với `#111827` |
| `--accent-soft` | `rgba(249,115,22,.12)` | Chưa đồng bộ hoàn toàn với primary tùy chọn |
| `--surface-shadow` | `0 16px 64px rgb(0 0 0 / 40%)` | `0 16px 64px rgb(32 43 58 / 8%)` |
| `--motion-panel` | `280ms` | Dùng chung |
| `--motion-ease` | `cubic-bezier(.22,1,.36,1)` | Dùng chung |

Typography: Inter từ Google Fonts và system fallback. Root `font-size:62.5%`, body `1.6rem`; input/textarea/select 16 px giảm auto-zoom mobile. Theme lưu key `theme-storage`, áp dụng trước React paint, toggle class `.light/.dark` và `colorScheme`. Ngôn ngữ lưu `app_language`, fallback `vi`; App đồng bộ `document.documentElement.lang`.

Button/toast thường dùng pill; avatar tròn; call/group/settings có radius riêng. Chưa có scale spacing/radius/type thống nhất được định nghĩa thành token. Không suy ra chuẩn 4/8 px đã được enforce chỉ từ vài stylesheet.

### 2.3. Component dùng lại

| Nhóm | Component / nguồn | Trách nhiệm |
| --- | --- | --- |
| Input/CTA | `components/ui/animate/XInput.jsx`, `XButton.jsx`, `XSearchSelect.jsx` | Form/CTA có visual state và motion |
| OTP | `components/lightswind-pro/otp-input.jsx` | Nhập mã, dùng trong dialog xác thực |
| Motion | `components/common/MotionPresence.jsx`, `hooks/useSceneMotion.js`, `lib/motion.js` | Presence, chuyển màn/theme; cleanup khi unmount |
| Navigation | `XNavRail.jsx`, `AppNavigation.jsx`, `posts/PostsSidebar.jsx` | Điều hướng global/menu nội dung |
| Feedback | `GlobalLoadingOverlay.jsx`, `loading/LoadingSpin.jsx`, Toaster trong App | Busy toàn cục khi request opt-in và toast |
| Media | `MediaLightboxModal.jsx`, `CustomAudioPlayer.jsx` | Preview media/play audio |
| Calls | `CallModal.jsx`, `GroupCallModal.jsx`, `GroupCallFloatingBar.jsx` | Luồng WebRTC cá nhân/nhóm |
| Privacy | `AntiPeepProvider.jsx`, `FaceIDCalibrationModal.jsx`, `AntiPeepLockOverlay.jsx` | Camera/model/enrollment/lock/PIN |

Các đường dẫn component tương đối với `client/src/`; bảng mô tả những file còn dùng trong ứng dụng, không phải danh mục mọi component.

## 3. Màn hình và trạng thái

Auth recovery UI (2026-10-15): `/forgot-password` dùng cùng `SignInPage.module.scss`, logo `/logo_remove_bg.png`, SideRays, XInput và XButton với đăng nhập. Ba bước email → OTP → mật khẩu giữ các API hiện có; có lỗi inline, nhãn vi/en/zh, focus bàn phím và logo mobile. Reduced motion tắt SideRays/logo bob trên trang này; bề mặt auth tiếp tục nền đen như trang đăng nhập. Phạm vi browser evidence và tình trạng deploy: [validation](./validation/auth-recovery-ui-and-app-screens.md).

| Màn hình | Nội dung và thao tác chính | Trạng thái cần có / kiểm tra |
| --- | --- | --- |
| Signin/signup | Email/password, Google, chuyển signup/signin, OTP | Form invalid, submit pending, credentials sai, OTP sai/hết hạn/resend, Google hủy |
| Forgot password | Email → OTP → password mới | Không tìm thấy tài khoản, mã sai, đang gửi, thất bại email/backend |
| Complete profile | Username/displayName và hồ sơ | Username trùng, thiếu trường, submit pending; invite redirect giữ nguyên |
| Chat list | Friends/groups/requests, online/unread, tạo nhóm/thêm bạn | Loading, không có hội thoại, tìm không thấy, bị xóa nhóm |
| Conversation | Header, timeline, input, ghim/media/info | Chưa chọn chat, empty history, tải thêm, upload/send lỗi, recalled, deleted-for-me, permission denied |
| Chat input | Text/emoji, attachment, audio recording, location | Permission denied, recording/cancel/send, file quá lớn, mất mạng |
| Group details | Tên/mô tả, members/roles, invite/QR, management | Leader/admin/member khác CTA; confirm xóa; token thay đổi; API 403/404 |
| Join group | Preview và confirm join hoặc mở nhóm | Loading, token sai/thu hồi, chưa đăng nhập, đã tham gia, join lỗi |
| Feed/post | Composer, post card, privacy, edit/delete, comments | Feed empty, optimistic state rollback, upload lỗi, sửa lần thứ hai bị từ chối |
| Profile/friends | Hồ sơ, posts, saved/friend interactions | Own vs other, private fields, no posts, account không tồn tại |
| Search/trends | Query, hashtag, kết quả | Query rỗng, no results, tải lỗi; xu hướng chưa cá nhân hóa |
| Video | Video feed, upload modal, playback/interaction | Empty, video fail, mute/play, swipe/scroll, duration limit |
| Notifications | Dropdown, unread và mark read/all | Empty, loading, lỗi, trùng event, giới hạn 50 |
| Settings | Account/privacy, language, notifications, Anti-Peep, blocked, application | Save pending/rollback; destructive confirm; state nhất quán sau reload |
| Calls | Incoming/outgoing/active, mute/video/end; nhóm grid/screen share | Offline recipient, deny camera/mic, connecting/failed, disconnect, minimized |
| Anti-Peep | AI/camera status, enrollment guidance, bật/tắt, lock | idle/loading/ready/error; đủ mẫu; model mismatch; PIN invalid/429 |

Bảng trên là checklist kiểm tra dựa trên nhánh/component thực tế. Không khẳng định mọi trạng thái đã được diễn đạt đồng nhất hoặc browser-test. Đặc biệt, UI xóa tài khoản có thông điệp mạnh hơn xử lý backend hiện tại; ticket QS-B05 phải làm rõ và sửa.

## 4. Tương tác và accessibility

Có focus-visible global (outline 2 px + offset 3 px), giảm motion qua media query, một số button có aria-label, dialog Anti-Peep có role và điều hướng PIN bàn phím; language options hỗ trợ Enter/Space. Đây là phần đã có, chưa phải chứng nhận accessibility toàn app.

Checklist thiết kế cần áp dụng khi sửa component:

- Dialog có accessible name, focus trap, đóng hợp lý bằng Escape và trả focus về trigger; overlay khóa không để Tab truy cập nội dung bị che.
- Icon-only button có label; toggle dùng label liên kết input; không chỉ dựa vào màu cho online/error/reaction.
- Error form gắn với trường, submit bị khóa khi pending; toast không là nơi duy nhất lưu lỗi cần sửa.
- Đọc timeline/notification không tạo live-region quá ồn; media có alt hoặc tên file, audio/video có điều khiển rõ.
- Kiểm tra light/dark + primary màu tùy chọn, text-muted, placeholder và focus với contrast thực tế.
- Các motion GSAP/WebGL nền cần kiểm tra giảm motion riêng; CSS reduced-motion không tự vô hiệu hóa mọi JavaScript animation.
- Viewport 360/390/768/1024/1440 px, zoom 200%, keyboard/mobile safe area, long content và không hover phải usable.

Khoảng trống này được theo dõi ở QS-B08/QS-B09, không gắn Done chỉ vì CSS đã có.

## 5. Ranh giới kỹ thuật

```text
Browser: React/Vite
  ├─ Router + Zustand stores + services/Axios
  ├─ Human/WebGL + camera (Anti-Peep)
  ├─ Socket.IO (presence, updates, WebRTC signaling)
  └─ simple-peer (media WebRTC giữa browser)
             │ REST / Socket.IO
             ▼
Node ESM: Express + Socket.IO trên cùng HTTP server
  ├─ Routes → middleware → controllers → Mongoose → MongoDB
  ├─ Multer disk temp → Cloudinary URL
  ├─ Mailer (HTTPS Webhook / Brevo API / Nodemailer SMTP) → email OTP
  ├─ Google Auth Library → xác minh Google ID token
  └─ Python stdin/stdout → TF-IDF/Random Forest
```

| Thành phần | Source | Quyết định thực thi |
| --- | --- | --- |
| Bootstrap server | `server/server.js`, `src/socket/socket.js` | Express/Socket cùng server; DB connect trước listen; default 5001 |
| Bootstrap client | `client/src/main.jsx`, `App.jsx` | StrictMode, i18n, Google provider, AntiPeepProvider, router/call modals |
| Compose local | `compose.yaml`, `client/src/config/env.js` | Browser ở http://localhost:5173; API/socket/assets được override thành http://localhost:5001; backend development/5001, CORS đúng origin local; không cấu hình TLS hoặc OAuth origins tại Google |
| REST client | `client/src/services/`, `lib/axios.js` | Credentials + Bearer, optional globalLoading; refresh 401 tối đa 4 retries |
| State | `client/src/stores/` | Auth, chat, post, notifications, individual/group call, theme, UI |
| Auth server | `authMiddleware.js`, `authController.js` | JWT + User lookup; Session refresh và OTP riêng collection |
| Quyền hội thoại | `conversationMiddleware.js`, `friendMiddleware.js` | Membership cho history/media/pins/interaction; friendship trước direct/create |
| Group quyền/DTO | `groupController.js`, `conversationHelper.js` | group.createdBy là authority; formatter xóa cả inviteToken/inviteCode |
| Media | `uploadMiddleware.js`, `utils/cloudinary.js` | 50 MiB, temp paths phụ thuộc cwd `server/`; upload resource_type auto |
| Optional classifier | `postController.js`, `algorithms/TF-IDF_RandomForest/` | spawn python, JSON stdin/stdout; không là remote ML API |

REST responses chưa có envelope thống nhất: có raw document, `{message}`, `{conversation}`, `{conversations}`, `{messages,nextCursor}`. Khi mở rộng, ghi rõ contract endpoint và giữ backward compatibility hoặc đổi cả service/store; không mô tả một format chung không tồn tại.

## 6. Dữ liệu

### 6.1. Collection và quan hệ

| Model | Các trường có ý nghĩa | Index/constraint quan trọng |
| --- | --- | --- |
| User | username/email/password/googleId, profile, savedPosts, blockedUsers, antiPeepData, settings, privacy | email unique; username/googleId unique sparse; password local; timestamps |
| Session | userId, refreshToken, expiresAt | refreshToken unique; userId index; TTL expiresAt |
| Otp | email, codeHash, purpose, attempts, expiresAt | purpose enum password-reset/email-signup/google-signup; TTL; email/purpose |
| Friend | userA, userB | sort cặp trước save, reject self; unique cặp; index mỗi bên |
| FriendRequest | from, to, message | unique from/to; message maxLength 300; index mỗi bên |
| Conversation | isGroup, participants[].userId/joinAt/role, group, lastMessage, unreadCounts, seenBy | participants + lastMessageAt; group.inviteToken unique sparse/select:false |
| Message | conversationId, senderId, content/type, imgUrl/fileUrl, reactions, isRecalled, deletedForUsers, pin/forward fields | conversationId index; conversationId + createdAt; timestamps |
| Post | author, content/images/video, privacy, editCount, hashtags, likes/reposts/comments | content maxlength 2000; editCount max 1; privacy enum; timestamps |
| Hashtag | name, count, postIds, lastUsedAt | name lowercase unique/index; count min 0 |
| Notification | recipient/sender, type, post/commentId/text, isRead | recipient index; type like/comment/reply/friend_request/friend_accept; text max 300 |

Tất cả model ở `server/src/models/`. User antiPeepData chứa `faceDescriptor` legacy, `faceDescriptors` gallery, modelVersion và pin hash, mặc định select:false. Endpoint chủ `/me` chọn enrollment cần thiết; PIN hash không được trả. MongoDB không tự cascade khi xóa User; hiện chưa có retention/cascade policy triển khai hoàn chỉnh.

### 6.2. Khác biệt persistence/DTO

- Conversation lưu participant `{userId,joinAt,role}`; formatter trả `{_id,displayName,avatarURL,username,joinedAt,role}`. Không nhầm `joinAt` schema với `joinedAt` response. Admin lưu nguyên; chỉ creator hiện tại được format leader.
- Creator hiện tại được tính leader từ group.createdBy; role admin lưu trong participant giữ nguyên, còn lại member; nhóm cũ không cần migration chỉ để UI có role.
- `unreadCounts` là Mongoose Map; formatter flatten thành object cho client.
- Comment là embedded subtree: comment → reply cấp hai → reply cấp ba; không có collection Comment riêng.
- `Message.messageType`: text/image/video/file/audio/location/group_call/poll. Các field edit/replyTo trong schema chưa chứng minh có endpoint chỉnh sửa/reply hoạt động.
- Session lưu refresh token hiện tại dạng chuỗi; hash/rotation nên là quyết định cải thiện có migration, không mô tả như đã có.

## 7. Hợp đồng REST

Mọi route ngoài `/api/auth` được protectedRoute gắn ở `server/server.js`; đổi mật khẩu trong auth cũng protected. Bảng giữ đúng method/case/path, không bịa DTO Swagger.

| Base | Method + suffix thực tế | Tác dụng |
| --- | --- | --- |
| `/api/auth` | POST `/signup`, `/signup/verify-otp`, `/signup/resend-otp` | Email signup/pending/OTP |
| `/api/auth` | POST `/signin`, `/signout`, `/refresh` | Session |
| `/api/auth` | POST `/google`, `/google/verify-otp`, `/google/resend-otp` | Google login/signup |
| `/api/auth` | PUT `/change-password`; POST `/forgot-password`, `/verify-otp`, `/reset-password` | Password flows |
| `/api/users` | GET `/me`, `/get-user-by-username`, `/:id`, `/saved-posts`, `/blocked` | Chủ/search/profile/saved/blocked |
| `/api/users` | PUT `/update-profile`, `/settings`, `/privacy`, `/anti-peep`; PATCH `/complete-profile` | Profile/settings/enrollment |
| `/api/users` | POST `/toggle-save`, `/block`, `/unblock`, `/anti-peep/verify-pin`; DELETE `/account` | User actions |
| `/api/friends` | GET `/`, `/requests`, `/suggestions`; POST `/request` | Friend data/request |
| `/api/friends` | POST `/request/:requestId/accept`, `/request/:requestId/decline`, `/unFriend/:friendId` | Friend lifecycle; `unFriend` case-sensitive convention retained |
| `/api/conversations` | POST `/`; GET `/` | Create/list |
| `/api/conversations` | GET `/:conversationId/messages`, `/media`, `/pins`; PATCH `/:conversationId/read` | History/media/pins/read; suffix `/media`/`/pins` cùng conversationId |
| `/api/conversations` | PATCH/DELETE `/:conversationId/group`; DELETE `/:conversationId/members/:memberId` | Creator edit/delete; remove theo ma trận leader/admin |
| `/api/conversations` | GET/POST `/:conversationId/invite`; GET `/invites/:token`; POST `/invites/:token/join` | Invite/token/preview/join |
| `/api/messages` | POST `/direct`, `/group`, `/reaction`, `/upload` | Send/reaction/upload file multipart |
| `/api/messages` | PUT `/:id/recall`, `/:id/delete-for-me`, `/:id/pin`; POST `/:id/forward` | Message actions |
| `/api/posts` | GET `/`, `/videos`, `/trends`, `/search`, `/user/:userId`, `/single/:id` | Browse/search/detail |
| `/api/posts` | POST `/create`; PUT `/like/:id`, `/comment/:id`, `/:id/edit`, `/:id/privacy`, `/:id/repost`, `/:id`; DELETE `/:id` | Posts/actions; hai route update alias |
| `/api/posts` | PUT `/:postId/comment/:commentId/like`; POST `/:postId/comment/:commentId/reply`; PUT `/:postId/comment/:commentId/reply/:replyId/like` | Comment/reply actions |
| `/api/notifications` | GET `/`; PUT `/:id/read`, `/read-all` | Notification list/read |

Các route debug/legacy còn tồn tại cần audit: GET `/api/users/test`, POST `/api/friends/block/:userId` (stub). Không đưa chúng vào hướng dẫn sử dụng sản phẩm như feature hoàn chỉnh.

Contract đã xác minh đáng chú ý:

- GET `/api/friends` trả `{ friends: [{ _id, username, displayName, avatarURL }] }`;
  `username` là handle thật cho gợi ý/điều hướng @mention. Projection không trả
  password/email/field riêng tư. Regression hai chiều friendship và browser:
  [chạy thử 2026-10-17](./validation/2026-10-17-project-smoke.md).
- Group update body `{ name, descriptionGroup }`: tên trim 1–100, mô tả trim <=1000, return `{conversation}`. DELETE group return `{conversationId,message}`.
- Invite GET return `{token,inviteCode,conversationId,name,avatarURL,participantsCount}`, POST return `{token,inviteCode}`; hai code là alias cùng64hex; preview `{group:{_id,name,descriptionGroup,avatarURL,memberCount,isMember}}`, không có participant list.
- Join return `{conversation}` 201 lần đầu/200 đã member; token invalid/thu hồi trả 404.
- Message history query `limit` mặc định 50, `cursor` là timestamp; return `{messages,nextCursor}`. Cần kiểm tra cặp thời gian trùng/cursor boundary trước khẳng định không bỏ sót.
- Media return `{images,files}`, lấy tối đa 100 record; chưa lọc đầy đủ deletedForUsers/isRecalled.
- Upload chat multipart field `file`; avatar field `avatar`; post route `upload.any()` nhận nhiều file.
- Anti-Peep update gallery phải gửi faceDescriptors + modelVersion cùng lúc; verify PIN 4 số, sai 401, quá hạn mức 429. PIN 401 là lỗi nghiệp vụ cần xử lý riêng tránh interceptor refresh thừa.

## 8. Realtime, cuộc gọi và Anti-Peep

### 8.1. Socket và session

Socket handshake dùng `auth.token` JWT; backend tra User và gắn socket.data.user. Query userId không cấp danh tính/quyền. User rooms cho cập nhật; trạng thái online/multi-socket và phòng gọi nằm trong RAM của instance.

| Nhóm sự kiện thực tế | Vai trò |
| --- | --- |
| `newMessage`, các cập nhật reaction/recall/pin/read trong stores | Đồng bộ timeline và unread |
| `conversationUpdated`, `conversationRemoved`, `groupInviteChanged` | Đổi nhóm, xóa khỏi nhóm, làm mới invite |
| `getOnlineUsers`, `setOnlineVisibility` | Presence và preference visibility |
| `newNotification` | Thông báo recipient |
| `callUser`, `answerCall`, `callAccepted`, `ice-candidate`, `endCall`, `callUserOffline` | Signaling cuộc gọi cá nhân |
| `joinGroupCall`, `groupCallSignal`, `groupCallToggleMedia`, `leaveGroupCall`, `getGroupCallStatus`, `getAllActiveGroupCalls` | Signaling/phòng gọi nhóm |
| `groupCallStatusChanged`, `groupCallUserLeft`, `groupCallParticipantMediaChanged` | Hiển thị trạng thái nhóm |

Server nhóm kiểm tra membership và làm sạch participant đã mất quyền; client removal dọn messages/pins/call state, reconnect refetch hội thoại. Đây không phải durable event queue: restart mất phòng/presence, cần refetch MongoDB để khôi phục dữ liệu chat. Chưa có Redis adapter hoặc bằng chứng nhiều instance chạy đúng.

### 8.2. WebRTC

`simple-peer` thiết lập kết nối browser-to-browser; Socket.IO truyền signaling, không vận chuyển toàn bộ media. Group store có camera, mic, screen sharing/replaceTrack và cleanup. Chưa cấu hình TURN được xác nhận trong source, chưa có SFU, recording hay đảm bảo mạng restrictive NAT. Không dựa vào build pass để kết luận cuộc gọi chạy giữa thiết bị thật.

### 8.3. Anti-Peep

1. Lazy import Human; detector BlazeFace quét trước, phân tích FaceMesh/Iris/FaceRes khi cần. Model ở `client/public/models/human/`.
2. Video constraint ideal 320x240, max 640x480, frameRate ideal 6/max10; scan interval 1500 ms và analysis 350 ms.
3. Enrollment 5 mẫu, modelVersion `human-faceres-v3.3.6`; backend xác minh vector 1024 chiều.
4. Similarity chủ threshold 0.5; người chú ý cần face area >=2.5%, gesture facing center + looking center.
5. Tracker theo box và embedding, không cộng thời gian hai người khác nhau; dwell 3000 ms, grace 500 ms.
6. Lock dừng protection stream; PIN verify qua backend rồi mở khóa. Tab ẩn/calibration/logout/user đổi có cleanup/cancel generation.

Vision heuristic không có liveness/anti-spoof; false positives/negatives phải được đánh giá trên camera thật. Embedding là dữ liệu nhạy cảm lưu ở server; camera frame không có luồng upload được tìm thấy trong module này. Overlay chỉ che UI, không thay đổi quyền JWT hay mã hóa dữ liệu đã tải.

## 9. Thiết kế còn thiếu

| Chủ đề | Hướng cần chốt trước code mở rộng | Ticket |
| --- | --- | --- |
| Privacy post/profile | Một policy chung cho list/detail/interaction/save; field-level DTO backend | QS-B01, QS-B02 |
| Ai được gửi/gọi | Quan hệ bạn bè, whoCanMessage, blocked; server là authority | QS-B03 |
| Xóa tài khoản/nhóm | Retention, cascade/ẩn danh, revoke session, idempotency và recovery | QS-B05, QS-B12 |
| Media | Validate nội dung, allowed URL, ownership, cleanup; thu hồi/hide consistent | QS-B04, QS-B11 |
| Classifier | Timeout/error contract; fallback rõ; cách trình bày heuristic | QS-B06 |
| UI nhất quán | Token thay hardcode; dịch đầy đủ; a11y/focus/mobile state | QS-B08, QS-B09 |
| Notification preferences | Quyền desktop, delivery và sound thực; không chỉ toggle persisted | QS-B07 |
| Reliability | Refresh single-flight, race/group CRUD, reconnect/session, pagination | QS-B10, QS-B12, QS-B13 |
| Release | Ma trận browser/device/network, env/TLS/CORS, backup/restore và benchmark | QS-Q01, QS-Q02, QS-Q03 |

Thứ tự và exit gate: [Plan](./plan.md). Những lựa chọn này là backlog đề xuất, chưa được triển khai hoặc phê duyệt như scope phát hành mới.

## Bổ sung kiến trúc sau pull

- Group delegated admin/member, add/role/leave và ma trận creator-only đã có; API/DTO/link legacy: [group-roles](./group-roles.md). Message poll embedded question/options/votes/allowMultiple/closed/closedAt/createdBy; không có collection Poll. Group-call messages thêm callId/callStatus/callDuration/startedAt/endedAt. Đóng poll emits messageUpdated, tạo poll emits newMessage.
- QR upstream: `client/src/components/common/TreeQRCodeModal.jsx`, magic-tree scene và html5-qrcode có cây3D/scan/file; link mới/legacy đều tới preview xác nhận, không auto-join; không dùng conversationId thay secret. Pending onboarding giữ cả64/24hex qua login/complete-profile.

### Note dịch PCM hiện tại

Audio cuộc gọi vẫn đi qua WebRTC giữa peer. Bảng note lấy cả mic của viewer (`isSelf=true`) và remote track của đối phương (`conversationTranslationSources`) khi bảng mở, call active, có user/socket, mic/track không mute và tab hiển thị. `TranslationNotes.jsx` dùng AudioWorklet qua `translationPcmCapture.js`/`translationPcmWorklet.js`, downmix/resample theo sample rate thực thành PCM16 little-endian mono16kHz; output của worklet là silence để không phát lại âm thanh.

| Socket.IO event | Contract |
| --- | --- |
| `translation:start` | `{kind, sessionId, speakerId, sourceLanguage, targetLanguage, translate?}`; đối phương: hai language en/vi khác nhau; lời của chính viewer (`speakerId === viewerId`): `translate: false` và `sourceLanguage === targetLanguage`. Ack thành công `{ok:true, streamId, sampleRate:16000, channels:1, packetSamples:2048}`; lỗi `{ok:false,status,message}` |
| `translation:audio` | `{streamId,seq,audio}`; seq bắt đầu0 tăng1, ArrayBuffer đúng4096bytes=2048samples=128ms; ack báo gói đã chuyển tới AI |
| `translation:stop` | `{streamId}`; dừng đúng stream thuộc socket |
| `translation:event` | Thêm `streamId,speakerId,speakerName` do backend xác định vào transcript/translation/status/error đã kiểm tra schema; nội dung lỗi được lọc |

Transcript có `utteranceId,revision,original,sourceLanguage,targetLanguage,isFinal` (và `translate:false` cho luồng của chính viewer). Note định danh stream+utterance; revision phải tăng, câu cuối không nhận sửa lại. Với lời của viewer (`translationState='self'`), bảng note chỉ hiển thị văn bản gốc, không gọi dịch và không hiện dòng dịch. Với lời của đối phương, original tạm hiện ngay cùng dòng dịch `Translating...`; `translation` (`utteranceId,revision,translated`, khớp câu cuối) cập nhật phía dưới cùng note. Status202/429/503 chỉ là cảnh báo, không kết thúc note. Error có utteranceId kết thúc câu đó và giữ original; error không có utteranceId dừng stream. Notes tối đa50entries trong RAM, không lưu audio/note vào MongoDB.

`socket.js` xác thực JWT, gọi bridge `translationPcm.js`; direct chỉ accepted sau answer, sessionId=peer userId; group sessionId=conversationId, viewer/speaker phải còn trong active room. Bridge chỉ cho phép `speakerId === viewerId` khi `translate === false` và `sourceLanguage === targetLanguage`; pin reference phiên và attendance trong group, kiểm tra mỗi gói/event và mỗi500ms. End/disconnect/leave/rejoin cùng ID thu hồi stream cũ; query group không reset direct session. Reference không trả qua DTO.

Bridge mở WebSocket `/stream/pcm` từ TRANSLATION_AI_URL, gửi x-api-key bằng TRANSLATION_AI_KEY và JSON `{sourceLanguage,targetLanguage,translate?}` trước binary PCM. Chờ AI ready đúng cấu hình mới ack start. FastAPI thiếu khóa trả503, sai khóa401. Khóa chỉ ở backend/AI; Compose dùng chung ai-service/.env qua init-env.ps1, ngoài Docker phải đồng bộ thủ công.

| Tầng | Giới hạn hiện có |
| --- | --- |
| Client | Tối đa2gói chờ ack, audio ack timeout2.5s/start15s; không queue audio offline; quá tải dừng và mở stream mới với cảnh báo |
| Bridge | 8streams/socket,64/process; setup/idle5s; token bucket12gói/s burst4;64KiB bộ đệm/event; ledger câu và tombstone giới hạn, từ chối kết quả cũ |
| AI | 64streams; setup/idle5s; mỗi stream tối đa3công việc ASR câu cuối và3dịch kể cả đang chạy; partial giữ mới nhất; quá tải trả lỗi rõ |

`pcm_vad.py` nạp Silero VAD v6.2 ONNX đã pin checksum, CPUExecutionProvider một thread; recurrent state/context riêng mỗi stream. Xét frame512samples/32ms, pre-roll8frames/256ms; bắt đầu ngưỡng0.5, giữ câu ngưỡng0.35, chốt sau10frames/320ms im lặng hoặc250frames/8s gồm đầu/đuôi. Partial sau19frames lời nói/608ms, nhịp16frames/512ms. PCM chỉ được bọc WAV trong RAM cho Whisper, không gọi decode_audio/FFmpeg.

`pcm_stream.py` tách ASR và dịch văn bản, dùng chung hai lock model độc lập; ưu tiên câu cuối hơn partial, có deadline và giới hạn queue. Khi `translate=false`, pipeline chỉ phát `transcript` (kèm `translate:false`) và bỏ qua hàng đợi dịch. Whisper chạy greedy decoding độ trễ thấp (`beam_size=1`, `best_of=1`, `temperature=0.0`, `temperature_inc=0.0`, `max_context=0`, `--no-fallback`), local `base-q5_1` (hoặc `WHISPER_MODEL=medium-q5_0`), `audio_ctx` theo thời lượng WAV+1s đệm (min128/max1500). Giải mã giữ timestamp tokens (`no_timestamps=false`) để xác định cuối lời nói; tắt căn chỉnh từng token (`token_timestamps=false`).

`app.abnormal_recognition` kiểm tra trước khi phát original/gửi dịch: kết quả >8192chars, chuỗi tuần hoàn dài có mật độ từ vượt ngưỡng, segment lặp chồng thời gian hoặc lời sinh ngoài độ dài audio. Ngưỡng là heuristic bảo thủ, không cắt/xóa câu lặp trong chuỗi. Partial bất thường chỉ cảnh báo503/chờ snapshot mới; final/HTTP được thử lại tối đa1lần, giữ audio/ngôn ngữ và deadline cũ, dùng full audio context (`audio_ctx=0`) + beam3. Nếu vẫn bất thường hoặc retry rỗng thì422; giữ partial hợp lệ trước đó, kết thúc đúng utterance và tiếp tục câu mới. UI báo có đoạn chưa rõ/cần nói lại, kể cả khi chưa có original. Đóng stream ngăn retry mới; slot inference chỉ nhả khi công việc sync thực sự kết thúc. [Kiểm chứng chống lặp](./validation/2026-10-18-translation-repetition-fix.md).

Dịch văn bản hai chiều (`en-vi`, `vi-en`) ưu tiên CTranslate2 INT8 MarianMT (`dekthedev/opus-mt-en-vi-ct2-int8` và `dekthedev/opus-mt-vi-en-ct2-int8`, kiểm tra SHA-256 tại `/models/ct2` trong volume `qwen-model-cache`), fallback sang Qwen3 GGUF (`QWEN_URL`) khi CTranslate2 không khả dụng. `compute_profile()` chia tải 50/50: khi có GPU (`cpu_gpu_50_50`), 50% tải (Whisper ASR) chạy trên GPU và 50% tải (Silero VAD + CTranslate2 MarianMT) chạy trên CPU; khi không có GPU (`cpu_only_50_50`), chia 50/50 số luồng CPU giữa nhánh ASR và nhánh VAD+MT.

Anh→Việt nghĩa đối phương nói Anh, viewer đọc/nói Việt; Việt→Anh ngược lại. UI vi/zh mặc định Anh→Việt, UI en mặc định Việt→Anh. Đổi direction hủy stream/xóa notes. Đóng bảng/hidden/disconnect dọn worklet, port, node, context, timer/listener và đánh dấu pending bị gián đoạn; đóng bảng giữ note cùng cuộc gọi. Visible/reconnect bắt đầu stream mới, không replay audio. Đổi phiên/end/logout xóa note, unmount dọn xử lý; không stop WebRTC track. Health client dùng mode=pcm(timeout20s/retry3s tới10phút); kiểm tra Silero+Whisper và làm nóng CTranslate2 nếu đã có trong `/models/ct2`, không phụ thuộc Qwen. Proxy health15s.

### HTTP tương thích cũ

`/api/translation` protectedRoute giữ GET `/health`: mặc định Whisper+Qwen, mode=transcribe chỉ Whisper, mode=pcm Whisper+Silero, mode khác400. POST `/chunk` JSON và `/chunk-stream` NDJSON vẫn nhận memory multipart audio<=2MiB, webm/mp4/wav; body kind/sessionId/speakerId/targetLanguage(en/vi)/sourceLanguage(en/vi/auto). HTTP clip được FFmpeg decode một lần thành mono16kHz WAV trong RAM, kiểm tra<=15s; ngân sách AI80s/proxy90s. JSON legacy lấy cả hai slot model; NDJSON nhả ASR trước transcript rồi translation/error, slot bận trả429. Proxy kiểm tra quyền/reference phiên trước inference và từng kết quả, giới hạn64KiB/event; đóng HTTP hủy reader/fetch. Bảng note hiện tại không tạo MediaRecorder clip hoặc gọi hai route upload này.

Kiểm chứng hiện tại: [PCM](./validation/2026-10-17-translation-pcm.md). [Progressive HTTP](./validation/2026-10-17-translation-progressive.md) và [clip6s](./validation/2026-10-17-translation-speed.md) giữ evidence từng snapshot; chất lượng, latency model, WebRTC nhiều người và consent/retention/logging còn thuộc Q01/Q02/Q03.

### Chạy dịch thuật cục bộ

Từ thư mục root, sau khi đã cấu hình `server/.env` và `client/.env.development`:

~~~powershell
.\ai-service\init-env.ps1
docker compose config --quiet
docker compose up -d --build
~~~

Script tạo `ai-service/.env` với khóa ngẫu nhiên, không in khóa và không ghi đè tệp đã có. Compose nạp tệp này vào **cả backend và ai**, sau `server/.env`, nên `TRANSLATION_AI_KEY` trong đó được dùng chung cho Docker. Không dùng `docker compose config` không có `--quiet` để chia sẻ output vì nó có thể chứa secrets. FastAPI trả 503 khi chưa cấu hình khóa và 401 khi khóa không đúng.

Compose này dành cho local: mở `http://localhost:5173`; API, Socket.IO và media đều dùng `http://localhost:5001`. Các URL này được Compose ưu tiên hơn giá trị trong env client, tránh gọi nhầm Render hoặc HTTPS vào backend HTTP. Backend dùng cổng 5001, chế độ development và CORS cho `http://localhost:5173`. Khi sửa cấu hình Compose, áp dụng bằng `docker compose up -d --no-deps frontend backend`; không cần tải lại model.

Compose mặc định chạy **CPU**, phù hợp máy không có NVIDIA GPU; `whisper` build từ `ai-service/whisper/Dockerfile`, không tải CUDA. Dùng whisper.cpp v1.9.4 và mặc định `ggml-base-q5_1.bin` đa ngôn ngữ (59.7 MB), kiểm tra SHA-256 và giữ model trong volume `whisper-model-cache`. Service `qwen` mặc định Qwen3 0.6B GGUF Q8_0 bằng llama.cpp, giữ model trong volume `qwen-model-cache`. Đây là lựa chọn ưu tiên tốc độ local; model nhỏ có thể giảm độ chính xác. Cache medium/1.7B đã tải vẫn được giữ. Lần đầu cần mạng để tải model. Chọn model qua `WHISPER_MODEL` (base-q5_1 hoặc medium-q5_0) và `QWEN_MODEL`. [Kiểm tra hiệu năng local](./validation/2026-10-17-translation-speed.md).

Để quay lại cấu hình model lớn đã dùng trước đó, đặt hai biến trong terminal hiện tại rồi áp dụng (cache cũ được tái sử dụng):

```powershell
$env:WHISPER_MODEL="medium-q5_0"
$env:QWEN_MODEL="Qwen/Qwen3-1.7B-GGUF:Q8_0"
docker compose up -d --no-deps whisper qwen
```

Xóa hai biến môi trường này khỏi terminal khi muốn dùng lại mặc định nhỏ.

Máy có NVIDIA GPU và Docker Desktop WSL2 GPU support có thể dùng cấu hình riêng:

~~~powershell
docker compose -f compose.yaml -f compose.gpu.yaml up -d --build
~~~

Override này dùng `Dockerfile.cuda`, GPU reservation và mặc định Whisper medium-q5_0; Qwen vẫn theo QWEN_MODEL. Silero VAD và xử lý audio chạy CPU; Whisper dùng GPU khi cấu hình NVIDIA được hỗ trợ, hoặc cấu hình CPU mặc định khi không có GPU phù hợp. Đây là hai cấu hình khởi chạy, chưa tự chuyển GPU lỗi sang CPU lúc đang chạy. Build CUDA lần đầu phải tải các lớp lớn và biên dịch riêng. Model-cache volumes dùng chung; FastAPI dùng `/tmp` trên tmpfs cho multipart HTTP cũ, PCM/WAV xử lý trong RAM. [Kiểm tra build CPU](./validation/2026-10-17-whisper-cpu-build.md).

Nếu Docker Engine trả lỗi 500 khi chạy `docker info`, cần khởi động/khôi phục Docker Desktop Linux Engine trước khi build hoặc chạy model. Kết quả kiểm tra code, Compose và giới hạn thử nghiệm ngày 2026-10-17: [translation review](./validation/2026-10-17-translation.md).

AI service dùng Uvicorn core với HTTP parser `h11`, protocol `websockets` và ONNX Runtime CPU cho Silero. Docker build kiểm tra `pip check`, checksum/model VAD và chạy thử inference VAD. Hai Dockerfile Whisper chuẩn hóa script khởi động từ CRLF về LF. [Kiểm tra sửa lỗi Docker build trước PCM](./validation/2026-10-17-ai-docker-build.md).

Nếu chạy ngoài Docker, cần Python 3.10+, `whisper-server` được build theo [hướng dẫn whisper.cpp](https://github.com/ggml-org/whisper.cpp), `llama-server` theo [hướng dẫn llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), model base q5_1 đa ngôn ngữ (hoặc medium q5_0) và FFmpeg trên PATH. Khởi động `whisper-server` trước với `--model <đường_dẫn_model> --host 127.0.0.1 --port 8080 --language auto`; khởi động `llama-server` với `-hf Qwen/Qwen3-0.6B-GGUF:Q8_0 --host 127.0.0.1 --port 8081 -c 1024 -np 1 -t 4`, rồi chạy FastAPI từ thư mục `ai-service/`:

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:TRANSLATION_AI_KEY="replace_with_a_long_random_key"
$env:QWEN_URL="http://127.0.0.1:8081"
$env:WHISPER_CPP_URL="http://127.0.0.1:8080"
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001 --http h11 --ws websockets --ws-max-size 4096 --ws-max-queue 8
~~~

Đặt cùng giá trị `TRANSLATION_AI_KEY` trong `server/.env`, và `TRANSLATION_AI_URL=http://127.0.0.1:8001` nếu chạy backend trực tiếp trên Windows.

Để thử riêng Qwen với câu mẫu trước khi mở cuộc gọi, chạy trong thư mục `ai-service/` sau khi `llama-server` sẵn sàng:

~~~powershell
.\.venv\Scripts\python.exe -c "from app import translate_text; print(translate_text('We should deploy the backend tonight.', 'en', 'vi'))"
~~~

Kết quả kỳ vọng là một câu tiếng Việt ngắn như `Chúng ta nên triển khai backend vào tối nay.`; cách diễn đạt có thể khác đôi chút giữa các lần chạy/model.

Compose tự nối backend đến `http://ai:8001`; không dùng `127.0.0.1` giữa hai container. `/health` kiểm tra Whisper/Qwen; `/health?mode=transcribe` chỉ kiểm tra Whisper. Bảng note dùng `/health?mode=pcm` qua proxy: kiểm tra Whisper và Silero, cho phép hiện chữ gốc khi Qwen chưa sẵn sàng. Chưa sẵn sàng trả HTTP503 với status=loading. Model Qwen mặc định `Qwen/Qwen3-0.6B-GGUF:Q8_0`; QWEN_MODEL cho phép quay lại1.7B.

Chỉ hỗ trợ Việt ↔ Anh, chỉ ghi lời đối phương/thành viên khác. Chọn **Anh → Việt** khi đối phương nói Anh và bạn muốn đọc Việt; **Việt → Anh** cho chiều ngược lại. UI tiếng Việt/Trung mặc định Anh→Việt, UI tiếng Anh mặc định Việt→Anh. Đổi chiều hủy xử lý và xóa note cũ. Chữ gốc tạm có thể được sửa tới khi câu chốt; `Translating...` được thay bằng bản dịch hoặc trạng thái lỗi, vẫn giữ chữ gốc. Gói audio128ms không đồng nghĩa transcript/model trả trong128ms hoặc bảo đảm1–2giây. [Contract và giới hạn hiện tại](./validation/2026-10-17-translation-pcm.md).

Whisper dùng cửa sổ audio theo độ dài WAV cộng1giây đệm, tối đa30giây. PCM giữ partial mới nhất và tối đa3công việc nhận dạng câu cuối/3công việc dịch mỗi stream; ưu tiên câu cuối, quá tải báo lỗi rõ và giữ chữ gốc đã có. Client tối đa2gói chưa được xác nhận; chậm hoặc mất kết nối dừng stream rồi mở mới, không tích audio để phát lại. Local mặc định2thread/model và tắt Qwen polling; điều chỉnh WHISPER_THREADS/QWEN_THREADS theo phần cứng. Cảnh báo status không kết thúc note; lỗi từng câu chỉ kết thúc câu đó, lỗi stream/quyền dừng stream. Chỉ bật note khi người tham gia đồng ý gửi audio đến dịch vụ AI.


Evidence hiện tại và warnings mới: [pull conflict resolution](./validation/pull-conflict-resolution.md). Kết quả cleanup trước pull giữ riêng; không thay chúng bằng kết quả tree mới.
