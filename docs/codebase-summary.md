# Codebase summary — Shrimple

Cập nhật: **2026-10-08**, baseline cleanup và bổ sung sau pull. Bản đồ này được tạo từ compaction Repomix của working tree rồi đối chiếu các source file thật; dùng để định vị code, không thay cho specification hoặc review nghiệp vụ.

## 1. Phạm vi compaction baseline trước pull

Repomix cục bộ đã tạo `repomix-output.xml` ở root với XML/compress: **180 file** (138 client, 41 server, 1 compose). Bao gồm client/src, package/config/Dockerfiles, server/src JS/Python, test và bootstrap. Loại trừ env, secrets, node_modules, dist, .git, upload, BIN/PKL/XLSX. Giữ security scanner mặc định. Compaction là artifact tạm và được xóa sau khi viết summary để không nhân đôi source trong repo.

Compression có thể bỏ chi tiết schema/function body; các phần quyền/API/models/Anti-Peep trong bộ tài liệu được đọc thêm từ source nguyên bản. File model nhị phân và dataset không thuộc compaction không đồng nghĩa chúng không được app dùng.

## 2. Cấu trúc và entrypoints

```text
client/
  src/main.jsx                 bootstrap, polyfills, i18n, Google provider
  src/App.jsx                  routes, providers, call/notification listeners
  src/auth/                    ProtectedRoute
  src/pages/                   auth, chat shell, join group, profile completion, video
  src/components/              chat, posts, settings, anti-peep, navigation, UI
  src/stores/                  Zustand state + async/realtime flows
  src/services/                REST wrappers
  src/lib/                     Axios, motion
  src/config/env.js            API/socket/assets/Google client env
  src/assets/css/              SCSS modules
  src/index.css                global tokens/focus/reduced-motion/toasts
  public/models/human/         vision model JSON/BIN, runtime static URL
server/
  server.js                    Express mount/CORS/DB/listen
  src/routes/                  endpoint wiring
  src/middlewares/             JWT, membership/friendship, upload
  src/controllers/             business operations
  src/models/                  10 Mongoose models
  src/socket/socket.js         app/server/io, identity, presence, calls
  src/utils/                   conversation DTO, message counters, mail/media
  src/libs/db.js               MongoDB connect
  src/algorithms/TF-IDF_RandomForest/  Python inference/training + artifacts
  test/groups.test.js          integration REST/socket with temporary MongoDB
```

Không có workspace package.json root; client/server quản lý dependency/scripts riêng. Source là JavaScript ESM/JSX, không TypeScript. Dockerfiles client/server dùng Node 22; compose không có database service hoạt động. Backend runtime cần cwd server/.

## 3. Module chính

| Domain | Backend | Frontend |
| --- | --- | --- |
| Auth/password | authRoute/authController, User/Session/Otp, authMiddleware | pages signin/signup/forgot; authService/useAuthStore; OTP dialogs; ProtectedRoute |
| Profile/settings | userRoute/userController, User | CompleteProfile, ProfileContainer, AccountSettings, Notifications/BlockedUsers/LanguageSettings/AntiPeepSettings, userSettingsService |
| Friends | friendRoute/friendController, Friend/FriendRequest | friendService, AddFriendPopUp, BodyRequests/BodyFriendsChat, FriendsContainer, WhoToFollowWidget |
| Conversations/groups | conversationRoute/conversationController/groupController, Conversation, conversationHelper/conversationMiddleware | chatService/useChatStore, CreateGroupPopUp, ChatInfo/GroupDetails, JoinGroupPage |
| Messages/media | messageRoute/messageController, Message, messageHelper/uploadMiddleware/cloudinary | ChatBody/ChatInput/Message/ForwardModal/CustomAudioPlayer, useChatStore |
| Calls | socket.js room state/signaling | useCallStore/CallModal; useGroupCallStore/GroupCallModal/FloatingBar/Banner |
| Feed/video/search | postRoute/postController, Post/Hashtag, Python classifier | usePostStore, PostsContainer/PostItem/PostCommentItem, VideoFeed/UploadModal, SearchResults/Trends/SavedPosts |
| Notifications | notificationRoute/notificationController, Notification | useNotificationStore, NotificationDropdown |
| Theme/i18n/motion | Không lưu theme/lang vào User trong flow hiện tại | useThemeStore, index.css, i18n, useSceneMotion, MotionPresence, lib/motion |
| Anti-Peep | userController PIN/enrollment, User antiPeepData | AntiPeepProvider, antiPeepVision, antiPeepTracker, calibration modal và lock overlay |

File controller/route/model backend trong `server/src/` theo folder cùng tên; frontend component trong `client/src/components/` theo domain. Xem [Design](./design.md) khi cần exact API/path/DTO.

## 4. Dòng dữ liệu và authority

- REST dùng Axios có credentials/Bearer; backend JWT tra User rồi middleware quyền tài nguyên. User identity từ backend, không từ role/recipient client.
- MongoDB lưu người dùng, quan hệ, chat, post, notification, refresh session và OTP. Timestamps/index/TTL có ở model; không có cascade toàn dữ liệu tự động.
- Socket auth qua handshake.auth.token; room người dùng/presence và room gọi ở RAM. Reconnect refetch hội thoại; không có event log durable hoặc adapter multi-instance được xác nhận.
- WebRTC media giữa browser; backend gửi signaling. Group quyền được tra membership, leader từ group.createdBy; token invite xóa khỏi conversation DTO.
- Media nhận multipart, lưu disk tạm rồi upload Cloudinary; JSON raw media URL cũng có nhánh tiếp nhận. Chưa có private media authorization hoàn chỉnh.
- Vision inference ở browser với model Human local static; enrollment 5 embeddings/version và PIN hash lưu User. Không có liveness hoặc E2EE.
- Post text >50 ký tự spawn Python; mô hình TF-IDF/Random Forest đọc PKL. Không là dịch vụ fact-checking có độ tin cậy được đo.

## 5. Scripts và chất lượng hiện tại

| Package | Scripts xác nhận |
| --- | --- |
| client | dev (Vite), build, lint, preview, test (node:test tracker) |
| server | dev (nodemon), start, test (node:test groups + translation session), test:ai (live-service smoke) |

Kết quả 2026-10-08: client lint **0 errors/7 warnings**, tracker **8/8**, build **pass**; groups **10/10** trên MongoDB tạm với binary cache dự án; backend syntax/diff check pass. Source/dependency graph sau cleanup không phát hiện source unreachable trong phạm vi entry đã khảo sát. Review độc lập không tìm regression do cleanup. [Validation](./validation/codebase-cleanup.md) ghi actual commands, warnings và phạm vi.

Không có coverage toàn app, browser/camera/WebRTC/production acceptance được đo. Build còn main/Human chunks lớn và mixed static/dynamic import warning. Tỷ lệ Done trong Kanban không là test coverage.

## 6. Gaps cần nhớ trước khi sửa

1. Direct post read/interactions và profile DTO privacy chưa nhất quán với controls UI (B01/B02).
2. whoCanMessage và block/call policy chưa xuyên suốt; legacy friend block stub tồn tại (B03).
3. Shared media chưa lọc recall/delete-for-me đầy đủ, upload/URL validation rộng (B04/B11).
4. Delete account hiện chỉ xóa User, cần revoke/session/data policy (B05).
5. Python thiếu spawn-error/timeout handling đầy đủ; ML Docker deps chưa cài (B06/Q03).
6. Notification sound/desktop chỉ lưu toggle; i18n/themes/a11y chưa khép (B07/B08/B09).
7. Refresh concurrency/PIN status, group multi-step races, cursor/limits/room RAM cần kiểm chứng (B10/B12/B13).
8. Avatar tạo nhóm chỉ preview, chưa upload/persist (B14).

Mã ticket đầy đủ và AC ở [Kanban](./kanban.md); [Plan](./plan.md) nêu dependency/gates. PRD mô tả baseline và future requirements riêng để không biến gaps thành feature đã hoàn thiện.

## Tài liệu liên quan

- [PRD](./prd.md)
- [Design](./design.md)
- [Kanban](./kanban.md)
- [Plan](./plan.md)
- [Quyền nhóm](./group-roles.md)
- [Hướng dẫn làm việc](../AGENTS.md)

## Bổ sung module sau pull

- Conversation role leader/admin/member, legacy inviteCode select:false và formatter loại cả invite secrets. Group add/role/leave, creator-only authority và admin rights trong controllers/helper; [group-roles](./group-roles.md).
- Poll embedded Message; group-call metadata callId/status/duration/start/end. Frontend CreatePollModal, Message vote/close và realtime messageUpdated.
- `client/src/components/common/TreeQRCodeModal.jsx`, `components/magic-tree/` và html5-qrcode: TreeQR/scan camera/file, link64/legacy24 tới preview/onboarding, không join bằng ID.
- `server/src/routes/translationRoute.js` protected health/chunk; `socket.js` direct accepted session và group active-room gate; `client/src/components/chat/TranslationNotes.jsx` được nối cả CallModal/GroupCallModal.
- `ai-service/app.py`/requirements/Dockerfiles: FastAPI audio proxy tới whisper.cpp/Qwen, ffmpeg; env TRANSLATION_AI_URL/KEY ở server, QWEN_URL/WHISPER_CPP_URL ở AI service. Chưa chạy model/service smoke trong merge.
- `server/tests/translationSession.test.js` bổ sung suite session; không test actual translated text.

Compaction180files và số đo cleanup ở phần trước là snapshot trước pull; không phải số lượng tree mới. Evidence mới: [pull conflict resolution](./validation/pull-conflict-resolution.md). Bộ tài liệu đã đọc source upstream trực tiếp; chưa tạo compaction đầy đủ tree mới.

Compose mới có ai/whisper/qwen và model-cache volumes; Whisper CUDA yêu cầu GPU NVIDIA theo reservation cấu hình, chưa thử chạy. Kết quả tree cuối sau merge: server20/20, client8/8, lint0errors8warnings, build pass; syntax39JS pass. Điều này không thay các số đo snapshot cleanup trước pull ở phần5.
