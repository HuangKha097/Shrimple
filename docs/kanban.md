# Kanban — Shrimple: baseline triển khai và việc cần hoàn thiện

Cập nhật: **2026-10-08**. Phiên bản: **1.0**. Phạm vi: code trong working tree hiện tại, không chỉ commit đã push. Yêu cầu sản phẩm ở [PRD](./prd.md); thiết kế ở [Design](./design.md); thứ tự xử lý ở [Plan](./plan.md).

## 1. Cách đọc board

| Trạng thái | Ý nghĩa |
| --- | --- |
| Done | Phần việc mô tả đã có luồng thực thi và evidence source; không tự đồng nghĩa nghiệm thu production |
| In Progress | Có công việc đang thực hiện, chưa đạt AC ticket |
| Review | Có thay đổi cần review/test hoặc kết luận chưa khép |
| Backlog | Chưa đạt yêu cầu, còn stub hoặc cần thiết kế/triển khai tiếp |

Mức bằng chứng: **C** = đọc code, **T** = test tự động trong phạm vi suite, **B** = build/lint/syntax, **U** = browser/device walkthrough, **P** = production. Done hiện tại chủ yếu C; chỉ gắn T/B khi có kết quả chạy thật. Không có U/P được xác nhận trong đợt này. Ticket cải thiện riêng không làm mất Done cho phần baseline đã có, nhưng chặn tuyên bố feature đã hoàn thiện toàn diện.

Ưu tiên: P0 = dữ liệu/quyền hoặc điều kiện bắt buộc trước release; P1 = trải nghiệm/reliability quan trọng; P2 = hoàn thiện chất lượng. Owner ghi theo trách nhiệm đề xuất, không gán cho cá nhân chưa nhận việc.

## 2. Board tổng hợp

| Cột | Ticket |
| --- | --- |
| Done | QS-I01–QS-I23, QS-M01, QS-M02 |
| In Progress | Chưa có ticket sản phẩm được giao trong tài liệu baseline |
| Review | Chưa có ticket riêng được chuyển Review |
| Backlog | QS-B01–QS-B14, QS-Q01–QS-Q03 |

**42 ticket: 25 Done về triển khai, 17 Backlog.** Đây là tỷ lệ theo board mới tái dựng, không phải coverage test, mức hoàn thành sản phẩm hay phần trăm sẵn sàng phát hành. Ticket QS-I21 Done chỉ là endpoint yêu cầu xóa User; xóa toàn bộ dữ liệu vẫn là QS-B05.

## 3. Các phase

| Phase | Phạm vi | Baseline | Exit gate còn lại |
| --- | --- | --- | --- |
| A | Auth/profile/friends | QS-I01–I06 Done C | Quyền field, reset/session, invite onboarding, blocked matrix |
| B | Chat/groups/media | QS-I07–I11 Done C/T một phần | Media privacy, races/cascade, avatar nhóm |
| C | Calls/realtime | QS-I12–I13 Done C | WebRTC thật, caller identity/block policy, reconnect/network |
| D | Feed/video/notifications | QS-I14–I18 Done C | Privacy P0, classifier failure, notification delivery và i18n |
| E | Anti-Peep/account | QS-I19–I21 Done C/T một phần | Camera/device, embedding exposure, delete lifecycle |
| F | Cleanup/docs/verification | QS-M01–M02 Done C/T/B | QA browser/security/recovery trước release |

Phase là nhóm công việc, không đại diện release đã được duyệt. Thứ tự backlog đi theo dependency ở Plan.

## 4. Done — nền tảng tài khoản

| ID | Ticket / AC phần đã làm | FR / dependency | Priority / owner | Evidence / mức |
| --- | --- | --- | --- | --- |
| QS-I01 | Email signup pending, OTP verify/resend, tạo tài khoản sau xác minh | FR-01; không | P1 Backend + UI | `server/src/controllers/authController.js`; `client/src/pages/SignUpPage.jsx`; `client/src/components/auth/SignupOtpDialog.jsx` — C |
| QS-I02 | Email/Google signin, session cookie, access token, signout/refresh, protected navigation | FR-02; I01 | P1 Backend + UI | `server/src/controllers/authController.js`; `server/src/models/Session.js`; `client/src/stores/useAuthStore.js`; `client/src/auth/ProtectedRoute.jsx`; `client/src/lib/axios.js` — C |
| QS-I03 | Forgot password qua email/OTP; đổi password đã đăng nhập | FR-03; I02 | P1 Backend + UI | `server/src/routes/authRoute.js`; `server/src/controllers/authController.js`; `client/src/pages/ForgotPasswordPage.jsx`; `client/src/components/setting/AccountSettings.jsx` — C; UI recovery đồng bộ X, lint/build + browser fixture 2026-10-15: [evidence](./validation/auth-recovery-ui-and-app-screens.md); email/reset thật vẫn cần nghiệm thu riêng |
| QS-I04 | Complete profile, update profile/avatar và màn hồ sơ | FR-04; I02 | P1 Backend + UI | `server/src/models/User.js`; `server/src/controllers/userController.js`; `client/src/pages/CompleteProfile.jsx`; `client/src/components/posts/ProfileContainer.jsx` — C |
| QS-I05 | Request/accept/decline/unfriend, list/gợi ý bạn bè | FR-05; I02 | P1 Backend + UI | `server/src/controllers/friendController.js`; `server/src/models/Friend.js`; `FriendRequest.js`; `client/src/services/friendService.js`; `client/src/components/posts/FriendsContainer.jsx` — C |
| QS-I06 | User block/unblock/blocked-list và UI quản lý | FR-06; I02 | P1 Backend + UI | `server/src/controllers/userController.js`; `client/src/components/setting/BlockedUsers.jsx` — C; legacy friends/block stub không thuộc AC |

Tiêu chí hoàn tất baseline: route → controller/model → service/store/UI tồn tại và có kết quả mong đợi trong code. Acceptance toàn auth/field/block cần QS-B02/B03/B10 và QS-Q01/Q02; chưa gắn T cho các luồng chưa có suite chạy riêng.

## 5. Done — chat, nhóm và lời mời

| ID | Ticket / AC phần đã làm | FR / dependency | Priority / owner | Evidence / mức |
| --- | --- | --- | --- | --- |
| QS-I07 | Create/list conversation, direct/group send, lịch sử cursor, unread và mark read | FR-07; I05 | P1 Backend + UI | `server/src/controllers/conversationController.js`; `messageController.js`; `server/src/utils/messageHelper.js`; `client/src/stores/useChatStore.js`; `client/src/components/chat/ChatBody.jsx` — C; T quyền nhóm một phần |
| QS-I08 | Upload/gửi ảnh-video-file, audio record, location, shared media UI | FR-08; I07 | P1 Backend + UI | `server/src/middlewares/uploadMiddleware.js`; `server/src/controllers/messageController.js`; `client/src/components/chat/ChatInput.jsx`; `ChatInfo.jsx`; `CustomAudioPlayer.jsx` — C |
| QS-I09 | Reaction, sender recall, delete-for-me, pin/unpin, forward | FR-09; I07 | P1 Backend + UI | `server/src/routes/messageRoute.js`; `server/src/controllers/messageController.js`; `client/src/components/chat/Message.jsx`; `ForwardModal.jsx` — C; T quyền outsider một phần |
| QS-I10 | Tạo nhóm, leader/admin/member, add/role/leave, sửa tên/mô tả, remove và delete theo quyền | FR-10; I07 | P1 Backend + UI | `server/src/controllers/groupController.js`; `server/src/utils/conversationHelper.js`; `server/src/middlewares/conversationMiddleware.js`; `client/src/components/chat/GroupDetails.jsx`; `server/test/groups.test.js` — C,T |
| QS-I11 | Invite random token, QR local/copy/download SVG, preview/confirm join, idempotent join và rotate | FR-11; I10 | P1 Backend + UI | `server/src/controllers/groupController.js`; `client/src/pages/JoinGroupPage.jsx`; `client/src/components/chat/GroupDetails.jsx`; `server/test/groups.test.js` — C,T API; QR chưa U |

AC QS-I10/I11: member không quản lý; leader không tự remove; old group suy role từ createdBy; invite token không lộ conversation DTO; join lặp không trùng; revoked token 404. Removed member bị chặn history/interaction/gọi nhóm; store dọn cache khi event/reconnect. Đợt trước pull có10cases nhóm; sau merge có nhóm/poll/admin/legacy và translation session được kiểm tra tại [evidence mới](./validation/pull-conflict-resolution.md); không coi là test toàn chat/media/calls.

## 6. Done — gọi, feed và cá nhân hóa

| ID | Ticket / AC phần đã làm | FR / dependency | Priority / owner | Evidence / mức |
| --- | --- | --- | --- | --- |
| QS-I12 | Signaling + modal cuộc gọi cá nhân thoại/video, accept/end | FR-12; I02/I07 | P1 Realtime + UI | `server/src/socket/socket.js`; `client/src/stores/useCallStore.js`; `client/src/components/chat/CallModal.jsx` — C |
| QS-I13 | Phòng gọi nhóm, join/leave/mute/camera/screen-share, banner và floating bar | FR-13; I10/I12 | P1 Realtime + UI | `server/src/socket/socket.js`; `client/src/stores/useGroupCallStore.js`; `client/src/components/chat/GroupCallModal.jsx`; `GroupCallFloatingBar.jsx`; `GroupCallBanner.jsx` — C; T membership signaling một phần |
| QS-I14 | Post create/list/detail/delete/update once/privacy controls | FR-14; I02/I04 | P1 Backend + UI | `server/src/models/Post.js`; `server/src/controllers/postController.js`; `client/src/components/posts/PostsContainer.jsx`; `PostItem.jsx`; `client/src/pages/SinglePostPage.jsx` — C; bảo mật direct read còn B01 |
| QS-I15 | Like/comment/reply/reaction, repost/save/unsave và saved list | FR-15; I14 | P1 Backend + UI | `server/src/controllers/postController.js`; `userController.js`; `client/src/components/posts/PostCommentItem.jsx`; `SavedPostsContainer.jsx` — C |
| QS-I16 | Search/trends hashtag, user posts/profile, short-video feed/upload | FR-16; I14 | P1 Backend + UI | `server/src/models/Hashtag.js`; `server/src/controllers/postController.js`; `client/src/components/posts/SearchResultsContainer.jsx`; `TrendsWidget.jsx`; `VideoUploadModal.jsx`; `client/src/pages/VideoFeed.jsx` — C |
| QS-I17 | Persist/list in-app notifications, Socket updates và read/read-all | FR-17; I05/I15 | P1 Backend + UI | `server/src/models/Notification.js`; `server/src/controllers/notificationController.js`; `client/src/stores/useNotificationStore.js`; `client/src/components/common/NotificationDropdown.jsx` — C |
| QS-I18 | Light/dark, hex primary, vi/en/zh và settings sound/desktop persisted | FR-18; I02 | P2 UI | `client/src/stores/useThemeStore.js`; `client/src/index.css`; `client/src/i18n.js`; `client/src/components/setting/LanguageSettings.jsx`; `Notifications.jsx`; `server/src/controllers/userController.js` — C; không có push/sound delivery hoàn chỉnh |

AC các ticket này giới hạn vào chức năng code hiện hữu. Thử media thực, đổi theme toàn màn, dịch mọi nhãn, privacy post và push là các gate riêng; không có bằng chứng U/P.

## 7. Done — bảo vệ và bảo trì

| ID | Ticket / AC phần đã làm | FR / dependency | Priority / owner | Evidence / mức |
| --- | --- | --- | --- | --- |
| QS-I19 | Human enrollment 5 mẫu, owner match/attention tracker 3s, camera lifecycle, lock/PIN | FR-19; I02 | P1 Vision + Backend + UI | `client/src/components/anti-peep/AntiPeepProvider.jsx`; `antiPeepVision.js`; `antiPeepTracker.js`; `antiPeepTracker.test.js`; `server/src/controllers/userController.js` — C,T tracker (8 tests) |
| QS-I20 | TF-IDF/RandomForest Python trong post create >50 ký tự, nhận isFake/confidence | FR-20; I14 | P2 Backend/ML | `server/src/controllers/postController.js`; `server/src/algorithms/TF-IDF_RandomForest/predict_news.py`; `train_model.py` — C; chưa benchmark/accuracy/production |
| QS-I21 | Cài đặt có request delete account; endpoint xóa User document | FR-21; I02 | P1 Backend + UI | `server/src/controllers/userController.js`; `client/src/components/setting/AccountSettings.jsx` — C; chưa đạt AC-17 hoàn chỉnh |
| QS-M01 | Dọn module/assets/import/state không dùng; bỏ dependency backend không dùng; sửa hook conditional; không đổi phạm vi sản phẩm | Không FR mới; code audit | P2 Maintenance | Static import/dependency graph, lint/build/client+server tests; chi tiết ở `docs/validation/codebase-cleanup.md` — C,T,B |
| QS-M02 | PRD/kanban/design/plan/AGENTS và codebase-summary phản ánh working tree; source refs/link/status có đối chiếu | Tất cả FR; M01 | P2 Documentation | [PRD](./prd.md), [Design](./design.md), [Plan](./plan.md), [Summary](./codebase-summary.md), [AGENTS](../AGENTS.md) — C; kiểm tra đường dẫn/links/LOC |

## 8. Backlog — gaps có căn cứ code

| ID / priority / owner | Vấn đề cụ thể và evidence | Dependency | AC để chuyển Done |
| --- | --- | --- | --- |
| QS-B01 / P0 / Backend | `postController.js`: getPostById đọc theo ID không kiểm tra privacy; interaction/save cần policy chung | I14/I15 | Owner/friend/stranger/blocked matrix cho list/detail/comment/reaction/repost/save; private không bị đọc qua ID; regression API |
| QS-B02 / P0 / Backend + UI | `userController.js`, `ProfileContainer.jsx`: setting ẩn trường chưa bảo đảm response backend lọc theo viewer | I04/I18 | Backend DTO đúng privacy từng field/birthday; stranger không nhận data ẩn; UI và API đồng nhất; tests |
| QS-B03 / P0 / Backend + Realtime | `friendMiddleware.js`, `messageController.js`, `socket.js`: whoCanMessage lưu nhưng chưa enforce toàn luồng; caller ID đã lấy socket auth sau merge; name/avatar và policy quan hệ/block cần audit; legacy blockFriend stub | I06/I07/I12 | Policy direct/forward/call/request rõ và enforce server; caller lấy auth identity; block endpoints không treo; matrix Everyone/Friends/Nobody |
| QS-B04 / P1 / Backend | `getSharedMedia` chưa filter đầy đủ `isRecalled`/`deletedForUsers` | I08/I09 | Người xóa với mình/thu hồi không thấy media tương ứng qua API panel; người khác đúng semantics; tests |
| QS-B05 / P0 / Backend + UI | deleteAccount chỉ delete User; Session/posts/messages quan hệ còn lại; UI có thể hứa quá mức | I21/I03 | Chốt cascade/ẩn danh/retention; revoke sessions/socket; kết quả idempotent; thông điệp đúng policy; test partial failure/orphan refs |
| QS-B06 / P1 / Backend/ML | checkFakeNews spawn chưa có error listener/timeout; fallback và wording cần rõ | I20 | Không Python/model/JSON malformed/timeout đều settle; không crash/treo; cleanup tiến trình; UI thể hiện heuristic; tests |
| QS-B07 / P1 / UI | Notifications settings chỉ persisted; chưa có sound/desktop delivery end-to-end | I17/I18 | Permission flow, actual notification/sound theo toggle, rollback/reload, browser deny/unsupported; hoặc thay nhãn giới hạn đúng capability |
| QS-B08 / P1 / UI | CSS hardcode/theme, accent phụ chưa theo màu chọn; chuỗi hardcode vi/en và dịch thiếu | I18 | Các màn chính light/dark/custom color nhất quán; vi/en/zh không key thô/chữ sai fallback; snapshot/browser matrix |
| QS-B09 / P1 / UI | Accessibility chưa audit focus trap/return focus/labels/dialogs/JS reduced motion | I18/I19 | Keyboard-only flows, modal focus/Escape, screen reader name, contrast/zoom; evidence U theo Design |
| QS-B10 / P1 / Auth | `lib/axios.js`: refresh tối đa 4 retries/request nhưng chưa single-flight; PIN sai 401 có thể refresh; auth test hẹp | I02/I03/I19 | Đồng thời nhiều 401 chỉ một refresh, không loop; PIN invalid không refresh; logout/revoke/expiry tests và error without config |
| QS-B11 / P1 / Backend | Upload regex extension OR broad MIME; raw media URL được nhận, duration chỉ nhánh upload | I08/I14/I16 | Validate MIME/content/URL/size/duration server, access policy media rõ; cleanup failed upload; tests unsafe type/quota |
| QS-B12 / P1 / Backend | Group delete/member write và calls/cache chạy nhiều bước, không có multi-document transaction | I10/I11/I13 | Race update/remove/delete/join không tạo orphan/privilege regain; partial failure có recovery; idempotent delete; integration concurrent |
| QS-B13 / P2 / Backend + UI | Timestamp cursor history, notification 50/shared media 100, room state RAM | I07/I13/I17 | Pagination không bỏ sót timestamp trùng; limit clamp; reconnect/refetch; scope multi-instance chốt trước scaling |
| QS-B14 / P2 / Backend + UI | CreateGroupPopUp có avatar preview nhưng service create không upload/persist avatar | I10 | Upload multipart hoặc flow media riêng với quyền; avatar lưu group.avatarURL/avatarId; reload/list/header cùng ảnh; lỗi/cancel cleanup |

Không tự triển khai các thay đổi hành vi này trong đợt cleanup. Đây là backlog có căn cứ, chưa có estimate/ngày giao/người nhận được xác nhận.

## 9. Backlog — nghiệm thu và vận hành

### QS-Q01 — Browser và thiết bị thật (P1, QA + UI)

Dependency: các ticket liên quan phải được sửa trước khi nghiệm thu lại. AC: signup/email/Google/reset, profile/invite redirect, chat/media/audio/vị trí, QR, feed/privacy, theme/i18n, settings, camera enrollment/lock và gọi 1:1/nhóm chạy trên >=2 tài khoản/browser. Kiểm tra mobile/desktop, denied permissions, tab hidden, logout và mạng ngắt/reconnect. Ghi thiết bị, browser version, steps, expected/actual và evidence; tuyệt đối không thay walkthrough bằng build pass.

### QS-Q02 — Regression quyền và lỗi (P0, QA + Backend)

Dependency: B01/B02/B03/B05/B10/B11/B12. AC: auth lifecycle, owner/member/friend/stranger/blocked, source/target forward, session expiry, OTP rate/replay, profile DTO, private post, account deletion và fault injection có test đúng DB tạm. Không dùng database thật. Xác nhận log không lộ JWT/PIN/OTP/password/embedding; không ghi secret vào evidence.

### QS-Q03 — Release/restore/performance (P1, Operations + QA)

Dependency: Q01/Q02; scope hosting do người dùng chọn. AC: env/CORS/cookie/TLS, build serving và SPA fallback; Mongo backup/restore test; Cloudinary/email failure; không có stub endpoint treo; đo latency/memory/WebRTC với workload cụ thể; cảnh báo bundle được triage. Chưa có triển khai/deploy/release được ủy quyền trong task này.

## 10. Bằng chứng kiểm tra baseline cleanup trước pull

Các kết quả dưới đây áp dụng cho code đã cleanup ngày 2026-10-08; không phải bằng chứng production. Lệnh, output và review đầy đủ: [bằng chứng cleanup](./validation/codebase-cleanup.md).

| Check thực chạy | Kết quả | Phạm vi / giới hạn |
| --- | --- | --- |
| `npm --prefix client run lint` | Pass, 0 errors / 7 warnings | Warnings exhaustive-deps còn tồn tại; không gọi lint “sạch hoàn toàn” |
| `npm --prefix client test` | 8/8 pass | Anti-Peep tracker unit suite, không kiểm tra Human perception bằng camera |
| `npm --prefix client run build` | Pass | Cảnh báo mixed static/dynamic authStore import và chunks >500 kB; không test call/UI runtime |
| `npm --prefix server test` | 10/10 pass với MongoDB binary cache workspace và runtime-download=false | REST/Socket.IO nhóm qua mongodb-memory-server; không DB thật; lần chạy mặc định tải binary đã dừng |
| `node --check` toàn server JS | Pass | Syntax, không xác nhận nghiệp vụ |
| `git diff --check` | Pass | Whitespace, không xác nhận mọi nguồn untracked |
| Static import/dependency graph | Không còn file JS/JSX không reachable trong source graph được kiểm tra | Asset/dynamic convention cần kiểm chứng riêng; Human/Python model cần giữ |
| Browser/camera/WebRTC/production | Chưa chạy | Q01/Q03 Backlog |

Suite server cache dùng `MONGOMS_DOWNLOAD_DIR` trỏ `server/node_modules/.cache/mongodb-memory-server` và `MONGOMS_RUNTIME_DOWNLOAD=false` trong lần chạy đã xác nhận. Máy mới có thể cần tải MongoDB binary; không biến env kiểm tra này thành cấu hình sản phẩm.

## 11. Quy tắc chuyển trạng thái và bảo trì

1. Ticket có FR/AC, dependency, owner trách nhiệm và evidence source trước khi làm.
2. Done cho implementation phải nêu rõ phạm vi, không gồm placeholder/stub/UI-only promise chưa nối backend.
3. Ticket security/reliability mới cần test regression phù hợp; UI/device cần U. Record command/exit/output summary trong `docs/validation/`.
4. Nếu AC runtime fail, chuyển Review/Backlog phần tương ứng; không sửa nhãn Done để giấu lỗi hoặc lấp gap bằng lời hứa.
5. Sửa code xong đồng bộ PRD/Design/Plan; không copy rule/stack/ticket KaZhen vào app này.
6. Không tự đặt deadline/effort hoặc đánh dấu release Done khi chưa có bằng chứng và quyết định phát hành.


## Cập nhật sau pull — triển khai upstream

| ID | Ticket / AC phần đã có | FR / dependency | Priority / owner | Evidence / mức |
| --- | --- | --- | --- | --- |
| QS-I22 | Poll group create/vote single/multiple/toggle/close theo membership và quyền creator/admin/leader | FR-22; I07/I10 | P1 Backend + UI | `server/src/models/Message.js`; `server/src/controllers/messageController.js`; `client/src/components/chat/CreatePollModal.jsx`; `Message.jsx`; `server/test/groups.test.js` — C,T quyền; cap/concurrency/browser chưa khép |
| QS-I23 | Note dịch vi↔en direct/group; accepted-session gate, audio proxy và AI service code | FR-23; I12/I13 | P1 Realtime + AI + UI | `server/src/routes/translationRoute.js`; `server/tests/translationSession.test.js`; `client/src/components/chat/TranslationNotes.jsx`; `ai-service/app.py` — C,T direct-session; AI output/latency chưa thử |

QS-I10/I11 cập nhật: admin được lưu, creator DTO leader; creator-only role/delete/rotate, admin add/remove ordinary member; leave chuyển successor; alias legacy24hex tra secret DB, không join bằng conversationId; rotate thu hồi cả legacy. QR mới/legacy tới preview và giữ qua onboarding; không auto-join khi scan. Quyền/cases đầy đủ ở [group-roles](./group-roles.md).

Backlog Q01/Q02/Q03 mở rộng kiểm tra poll vote/close concurrent/caps, translation health/chunk/permission/timeout/consent/retention và incoming group-call media thật. Done I22/I23 không xác nhận AI/camera/WebRTC chạy thực tế. B03 tiếp tục Backlog cho policy người gọi/block dù caller ID đã được sửa.

Kết quả tree sau pull: xem [pull conflict resolution](./validation/pull-conflict-resolution.md). Bảng baseline ở mục10 giữ lịch sử, không được dùng làm kết quả lint/build của tree sau merge.

## Chạy thử và sửa lỗi 2026-10-17

- QS-I05/I07/I15: sửa thiếu username friend DTO, thứ tự Hooks trong ChatInput
  và Fast Refresh của module mention/vẽ. Test server 21/21, client 8/8;
  lint 0 errors/9 warnings, build pass.
- QS-B05: sửa mô tả xóa tài khoản vi/en/zh cho đúng giới hạn hiện tại;
  lifecycle/cascade/session AC vẫn Backlog.
- QS-Q01/Q02: thêm evidence U cục bộ cho signin, chuyển hội thoại, gửi direct/group,
  mention bài/bình luận, feed/settings mobile 390px; không đóng nghiệm thu toàn app.
- Commands, giới hạn, ảnh và lỗi môi trường: [validation](./validation/2026-10-17-project-smoke.md).

QS-M01 bổ sung cleanup 2026-10-17: bỏ dependency/style/prototype QR không dùng,
imports dư, alias formatter và sáu hook warnings an toàn; giữ toàn bộ test đang
hoạt động. Server21/21, client8/8, lint0errors3warnings, build/syntax/diff check
pass. Người dùng xác nhận push toàn bộ source bằng GitHub Desktop;
[evidence cleanup](./validation/2026-10-17-cleanup-push.md). Các AC Q01/Q02/Q03
và cảnh báo lifecycle CallModal/TreeQRCodeModal vẫn cần kiểm chứng riêng.
