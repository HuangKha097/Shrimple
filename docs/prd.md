# PRD — Shrimple: nhắn tin và mạng xã hội

Cập nhật: **2026-10-08** (Asia/Saigon). Phiên bản tài liệu: **1.0 — tái dựng từ code hiện có**.

Tài liệu xác định sản phẩm đang có và yêu cầu hoàn thiện tiếp theo, không giả định đây là PRD đã được duyệt trước khi triển khai. Đối tượng được khảo sát là working tree QtmShrimple, bao gồm tính năng vai trò nhóm và lời mời đang có trong code. Cấu trúc tham khảo KaZhen; nghiệp vụ KaZhen không áp dụng cho Shrimple.

## Mục lục

1. [Vấn đề, mục tiêu và người dùng](#1-vấn-đề-mục-tiêu-và-người-dùng)
2. [Phạm vi và mức xác nhận](#2-phạm-vi-và-mức-xác-nhận)
3. [Hành trình sử dụng](#3-hành-trình-sử-dụng)
4. [Yêu cầu chức năng](#4-yêu-cầu-chức-năng)
5. [Luật nghiệp vụ](#5-luật-nghiệp-vụ)
6. [Phi chức năng và dữ liệu](#6-phi-chức-năng-và-dữ-liệu)
7. [Tiêu chí nghiệm thu](#7-tiêu-chí-nghiệm-thu)
8. [Đo lường và quản lý thay đổi](#8-đo-lường-và-quản-lý-thay-đổi)

## 1. Vấn đề, mục tiêu và người dùng

Shrimple kết hợp trò chuyện cá nhân/nhóm, cuộc gọi và chia sẻ nội dung trên web. Người dùng chuyển giữa nhắn tin, bảng tin, video và hồ sơ trong cùng giao diện. Anti-Peep bổ sung lớp che nội dung khi phát hiện người lạ có dấu hiệu nhìn vào màn hình.

| Mục tiêu | Giá trị cần đạt | Phạm vi hiện có |
| --- | --- | --- |
| Liên lạc nhanh | Trao đổi text, media, file, audio và vị trí | REST lưu dữ liệu; Socket.IO cập nhật thời gian thực |
| Sinh hoạt nhóm | Quản lý thành viên và mời qua URL/QR | Trưởng nhóm, admin, thành viên, đổi link mời, poll và phòng gọi nhóm |
| Chia sẻ nội dung | Đăng bài, tương tác, lưu bài và khám phá | Feed, video, tìm kiếm, hashtag, gợi ý kết bạn |
| Cá nhân hóa | Chọn theme, màu chủ đạo và ngôn ngữ | Sáng/tối, màu hex, vi/en/zh; dịch chưa đồng nhất toàn app |
| Riêng tư | Có quyền truy cập và kiểm soát hiển thị rõ ràng | Đã có thiết lập/quyền nhóm; còn lỗ hổng quyền bài đăng cần xử lý |

Người dùng mục tiêu: người sử dụng web muốn trao đổi với bạn bè và nhóm nhỏ; đây là suy luận từ các luồng hiện có, chưa có nghiên cứu người dùng xác nhận. Không có vai trò quản trị hệ thống, giáo viên, tổ chức hoặc thuê bao trả phí trong model hiện tại.

| Vai trò | Quyền chính |
| --- | --- |
| Khách | Đăng ký, đăng nhập, quên mật khẩu; không đọc feed hoặc lịch sử chat qua API riêng |
| Tài khoản chưa hoàn tất hồ sơ | Được hướng tới `/complete-profile` bởi client |
| Người dùng | Hồ sơ, bạn bè, chat, bài đăng, thông báo, thiết lập |
| Thành viên nhóm | Chat/gọi, poll/vote, xem thông tin, chia sẻ lời mời và rời nhóm |
| Admin nhóm | Quyền member cộng thêm người, xóa member thường và đóng poll |
| Trưởng nhóm | Quyền admin cộng sửa nhóm, phân quyền admin/member, xóa admin khác, xóa nhóm, đổi link mời |

## 2. Phạm vi và mức xác nhận

**Đã triển khai** nghĩa là tìm thấy luồng thực thi trong code, không đồng nghĩa đã nghiệm thu production. [Kanban](./kanban.md) tách trạng thái triển khai khỏi bằng chứng test/build/browser. Mọi FR bên dưới mô tả baseline; các yêu cầu khắc phục có ticket riêng.

Phạm vi hiện tại: email/Google + OTP, hồ sơ, kết bạn/chặn, chat/media/poll, nhóm leader/admin/member, QR, gọi cá nhân/nhóm và note dịch vi↔en, feed/video, thông báo trong app, theme/ngôn ngữ, Anti-Peep, bộ phân loại tin tiếng Việt.

Ngoài phạm vi code hiện tại: ứng dụng native; thanh toán; quản trị/kiểm duyệt thủ công; end-to-end encryption; push nền qua service worker; media server/SFU; đảm bảo liên lạc trên mọi NAT; đo lường analytics và SLA đã kiểm chứng. Không tự thêm các mục này vào phạm vi đã duyệt.

## 3. Hành trình sử dụng

### 3.1. Vào ứng dụng

1. Đăng ký email, nhập OTP hoặc đăng nhập Google.
2. Tài khoản Google mới đi qua OTP và hoàn tất hồ sơ nếu cần; tài khoản cũ nhận session theo nhánh backend.
3. Client nhận access token, refresh cookie và dữ liệu người dùng.
4. ProtectedRoute kiểm tra tài khoản, chuyển tới chat hoặc màn hoàn tất hồ sơ.
5. Nếu mở link mời trước khi đăng nhập, client giữ đường dẫn trong sessionStorage và quay lại trang mời sau onboarding.

### 3.2. Trao đổi cá nhân/nhóm

1. Tìm username, gửi lời mời và chấp nhận kết bạn.
2. Chọn bạn hoặc tạo nhóm với ít nhất hai bạn khác.
3. Gửi text, emoji, media, file, ghi âm hoặc vị trí sau khi cấp quyền thiết bị.
4. Xem tin, reaction, thu hồi tin mình gửi, xóa đối với mình, ghim/chuyển tiếp.
5. Mở thông tin hội thoại để xem media/ghim; nhóm có danh sách thành viên và QR mời.
6. Bắt đầu/nhận cuộc gọi; nhóm có banner, modal và thanh nổi khi thu nhỏ.

### 3.3. Chia sẻ và khám phá

1. Mở `/feed`, nhập nội dung và chọn media/quyền riêng tư.
2. Đăng bài; nội dung dài có thể đi qua bộ phân loại Python.
3. Like, bình luận, trả lời, repost hoặc lưu bài.
4. Tìm kiếm/hashtag, mở hồ sơ tác giả hoặc `/video`.
5. Xem thông báo và đánh dấu đã đọc.

### 3.4. Bảo vệ màn hình

1. Mở cài đặt Anti-Peep, cấp camera và ghi danh khuôn mặt.
2. Hoàn tất 5 mẫu embedding cùng PIN 4 số.
3. Bật bảo vệ; camera chạy khi tab hiển thị và có enrollment tương thích.
4. Nếu cùng người lạ có dấu hiệu nhìn vào màn hình đủ 3 giây, app hiện overlay khóa.
5. Nhập PIN để mở khóa; chuyển tab ẩn dừng camera. Đây là lớp che giao diện, không phải cơ chế xác thực danh tính thay thế.

## 4. Yêu cầu chức năng

| ID | Yêu cầu / kết quả người dùng | Bằng chứng code chính | Giới hạn hiện tại |
| --- | --- | --- | --- |
| FR-01 | Đăng ký email, xác minh và gửi lại OTP trước khi tạo tài khoản | `server/src/controllers/authController.js`; `client/src/pages/SignUpPage.jsx`; `SignupOtpDialog.jsx` | Chưa có regression suite auth riêng |
| FR-02 | Đăng nhập email hoặc Google, đăng xuất và refresh session | `authController.js`; `client/src/stores/useAuthStore.js`; `client/src/lib/axios.js` | Access token có lưu localStorage; refresh concurrency cần kiểm tra |
| FR-03 | Quên/đổi mật khẩu qua OTP hoặc mật khẩu hiện tại | `authController.js`; `ForgotPasswordPage.jsx`; `AccountSettings.jsx` | Chưa chứng minh thu hồi toàn bộ session khi đổi/reset |
| FR-04 | Hoàn tất/chỉnh hồ sơ, avatar, bio, thông tin học tập/công việc và vị trí | `userController.js`; `User.js`; `CompleteProfile.jsx`; `ProfileContainer.jsx` | Quyền hiển thị một số trường do UI thực hiện; cần bảo vệ response backend |
| FR-05 | Gửi/nhận/chấp nhận/từ chối lời mời; hủy kết bạn; gợi ý bạn bè | `friendController.js`; `friendService.js`; `BodyRequests.jsx`; `FriendsContainer.jsx` | Widget “WhoToFollow” dùng kết bạn, không có model follow riêng |
| FR-06 | Chặn, bỏ chặn và liệt kê tài khoản bị chặn | `userController.js`; `BlockedUsers.jsx` | API cũ `/api/friends/block/:userId` là stub; không đại diện luồng chặn hoạt động |
| FR-07 | Chat cá nhân và nhóm có lịch sử, unread và trạng thái đọc | `conversationController.js`; `messageController.js`; `useChatStore.js` | Chưa có đảm bảo delivery/exactly-once hoặc tìm kiếm toàn bộ lịch sử |
| FR-08 | Gửi ảnh/video/file/audio/vị trí; upload media và xem media chia sẻ | `ChatInput.jsx`; `uploadMiddleware.js`; `messageController.js`; `ChatInfo.jsx` | 50 MiB/file; media dùng URL/CDN, không phải storage riêng có quyền theo người xem |
| FR-09 | Reaction, thu hồi, xóa với mình, ghim/bỏ ghim và chuyển tiếp tin | `messageRoute.js`; `messageController.js`; `Message.jsx`; `ForwardModal.jsx` | Schema có `replyTo` và trường edit nhưng chưa có API sửa/reply tin hoàn chỉnh |
| FR-10 | Tạo nhóm, admin/member và quyền creator hiện tại | `Conversation.js`; `conversationHelper.js`; `groupController.js`; `GroupDetails.jsx` | Creator hiện tại trả leader; admin được lưu; creator rời nhóm tự chuyển quyền cho admin đầu tiên hoặc member đầu tiên |
| FR-11 | Mời bằng URL/QR, preview, tham gia xác nhận, đổi token thu hồi link | `groupController.js`; `JoinGroupPage.jsx`; `GroupDetails.jsx` | Link không hết hạn tự động; thành viên bị xóa có thể quay lại nếu còn link hợp lệ |
| FR-12 | Gọi thoại/video cá nhân | `useCallStore.js`; `CallModal.jsx`; `server/src/socket/socket.js` | Caller ID lấy socket auth; quan hệ/block còn cần policy; phụ thuộc WebRTC/NAT |
| FR-13 | Phòng gọi nhóm, mute/camera, chia sẻ màn hình, thu nhỏ/mở lại | `useGroupCallStore.js`; `GroupCallModal.jsx`; `GroupCallBanner.jsx` | Peer-to-peer; trạng thái phòng ở RAM server; chưa có giới hạn tải được kiểm chứng |
| FR-14 | Tạo/xem/xóa/sửa bài và đổi quyền riêng tư | `postController.js`; `Post.js`; `PostsContainer.jsx`; `PostItem.jsx` | Bài được sửa nội dung tối đa 1 lần; quyền đọc direct URL chưa đầy đủ |
| FR-15 | Like, bình luận, trả lời nhiều cấp, reaction, repost và lưu bài | `postController.js`; `userController.js`; `PostCommentItem.jsx`; `SavedPostsContainer.jsx` | Chưa có regression suite quyền tương tác/lưu bài riêng tư |
| FR-16 | Tìm kiếm bài, xu hướng hashtag, hồ sơ và video ngắn | `postController.js`; `Hashtag.js`; `SearchResultsContainer.jsx`; `VideoFeed.jsx` | Bộ đếm xu hướng phản ánh dữ liệu Hashtag, không có thuật toán recommendation cá nhân hóa |
| FR-17 | Thông báo trong app và đánh dấu đọc | `notificationController.js`; `Notification.js`; `useNotificationStore.js`; `NotificationDropdown.jsx` | Lấy tối đa 50 thông báo; chưa có pagination đầy đủ |
| FR-18 | Lưu cài đặt sound/desktop notifications, theme/màu và vi/en/zh | `userController.js`; `Notifications.jsx`; `useThemeStore.js`; `i18n.js` | Toggle notification lưu dữ liệu nhưng chưa có luồng phát âm thanh/push desktop hoàn chỉnh; nhiều chuỗi chưa dịch |
| FR-19 | Anti-Peep enrollment, theo dõi người lạ và mở khóa PIN | `AntiPeepProvider.jsx`; `antiPeepVision.js`; `antiPeepTracker.js`; `userController.js` | Không bật liveness/anti-spoof; độ chính xác camera thực tế chưa được đo |
| FR-20 | Kiểm tra nội dung dài bằng TF-IDF/Random Forest tiếng Việt | `postController.js`; `server/src/algorithms/TF-IDF_RandomForest/predict_news.py` | Heuristic; không chứng minh tin đúng/sai; xử lý lỗi tiến trình/timeout chưa đầy đủ |
| FR-21 | Yêu cầu xóa tài khoản từ cài đặt | `AccountSettings.jsx`; `userController.js` | Hiện chỉ xóa User; chưa xóa/ẩn danh posts/messages/session liên quan |

Các tên file ngắn trong bảng thuộc module frontend tương ứng hoặc `server/src/controllers/` / `server/src/models/`. Đường dẫn đầy đủ được liệt kê theo ticket ở [Kanban](./kanban.md) và kiến trúc ở [Design](./design.md).

## 5. Luật nghiệp vụ

| ID | Luật baseline xác nhận từ code | Phân biệt với yêu cầu cần hoàn thiện |
| --- | --- | --- |
| BR-01 | Access JWT 15 phút; refresh token ngẫu nhiên 64 byte, Session TTL 3 ngày; cookie httpOnly, production secure + SameSite=None | Chưa kết luận session rotation/revocation hoàn chỉnh |
| BR-02 | OTP 6 số, sống 5 phút, tối đa 5 lần sai; hash theo email + purpose + mã; pending signup token 10 phút | Chưa có rate limit phân tán cho gửi lại/login |
| BR-03 | Email/username chuẩn hóa lowercase; password local bắt buộc nếu không có googleId | Không coi username và displayName là cùng trường |
| BR-04 | Tạo chat cá nhân và gửi trực tiếp phải có quan hệ bạn bè; tạo nhóm cần >=2 bạn khác người tạo | `whoCanMessage` hiện được lưu nhưng chưa chi phối đầy đủ gửi tin; không hứa “Everyone” hoạt động |
| BR-05 | Chặn hai chiều được kiểm tra khi gửi tin cá nhân | Cần kiểm chứng riêng cho lời mời, feed, gọi và chuyển tiếp |
| BR-06 | Trưởng nhóm từ `group.createdBy` + membership; role trả leader/admin/member, admin giữ role được lưu | Không cấp quyền chỉ dựa vào role từ client |
| BR-07 | Không tự remove/không remove creator; creator-only sửa/xóa/role/rotate; admin thêm/xóa member thường | Có leave; creator rời chuyển quyền, nhóm trống bị xóa; race nhiều bước cần kiểm chứng |
| BR-08 | Invite mới32byte/64hex; token+inviteCode alias chỉ API invite; legacy24hex chỉ join nếu khớp mã lưu; rotate xóa legacy; join201/200 | Người có link + tài khoản có thể join; không có danh sách ban vĩnh viễn |
| BR-09 | Tin thu hồi vẫn giữ record với trạng thái; xóa với mình dùng `deletedForUsers`; ghim dùng `isPinned` | Media API cần kiểm tra không lộ tin đã thu hồi/xóa với mình |
| BR-10 | Bài tối đa 2000 ký tự; privacy public/friends/private; chỉ sửa nội dung một lần | Direct read và interaction phải được bổ sung kiểm tra privacy nhất quán |
| BR-11 | Tạo bài cùng tác giả/nội dung trong 60 giây trả bài cũ; upload video Cloudinary >60.5 giây bị từ chối | URL video truyền trực tiếp chưa được xác minh cùng giới hạn duration |
| BR-12 | Mỗi file upload tối đa 50 MiB; post nhận ảnh/video, chat nhận thêm audio/document | Bộ lọc extension hoặc MIME hiện rộng, chưa là xác minh nội dung thực |
| BR-13 | Nội dung bài >50 ký tự được gọi Python; `isFake` có thể chặn đăng; lỗi xử lý được một số nhánh cho phép tiếp tục | Cần timeout/error handler và thông điệp không khẳng định kết quả như chân lý |
| BR-14 | Anti-Peep nhận 5 vector 1024 chiều hữu hạn, version `human-faceres-v3.3.6`, PIN đúng 4 số và hash server | Embedding lưu backend; không tuyên bố tất cả dữ liệu sinh trắc chỉ ở máy |
| BR-15 | Scan nghỉ 1500 ms, analysis nghỉ 350 ms; người lạ chú ý >=3000 ms mới khóa, grace mất dấu 500 ms | Ngưỡng là cấu hình, không phải chứng nhận chính xác thực tế |
| BR-16 | PIN có tối đa 5 lần sai trong cửa sổ 5 phút, bộ đếm ở RAM theo user | Reset khi server restart, không chia sẻ giữa nhiều instance |

## 6. Phi chức năng và dữ liệu

| ID | Yêu cầu / ràng buộc | Hiện trạng | Nghiệm thu cần có |
| --- | --- | --- | --- |
| NFR-01 | API dữ liệu cần xác thực và quyền tài nguyên | Có JWT/membership nhóm; quyền post chưa đầy đủ | Ma trận owner/friend/member/stranger/blocked với request trực tiếp |
| NFR-02 | Không trả password/PIN hash/embedding người khác trong payload công khai | Anti-Peep fields select:false, `/me` chọn dữ liệu của chủ | Kiểm tra response cho search/profile/feed/socket |
| NFR-03 | Camera/mic/vị trí chỉ hoạt động khi được cấp quyền; có lỗi rõ ràng | Có API browser và cleanup camera Anti-Peep | Thiết bị thật, từ chối quyền, chuyển tab, đổi user, kết thúc cuộc gọi |
| NFR-04 | Layout usable trên mobile và desktop | CSS có breakpoint 768/1024 px | Kiểm tra 360/390/768/1024/1440 px, zoom, bàn phím mobile |
| NFR-05 | Có focus, label, reduced motion và hoạt động bàn phím | Một phần đã có CSS/global và component | Audit focus trap, return focus, screen reader, contrast |
| NFR-06 | Không tích lũy socket listener/stream sau chuyển màn hoặc logout | Stores có subscribe/unsubscribe, cleanup | Regression reconnect/multi-tab/unmount |
| NFR-07 | Build và regression chạy được, lint không tăng lỗi | Có scripts build/lint/test; coverage còn hẹp | Kết quả thật trong Kanban; không tự suy ra tỷ lệ coverage |
| NFR-08 | Môi trường tách client/server, không commit secret | Có `.env.example`; VITE_* là public | Kiểm tra bundle, cấu hình CORS/TLS/cookie theo môi trường |
| NFR-09 | Phục hồi dữ liệu và thao tác xóa nhất quán | Chưa có quy trình backup/restore hoặc transaction xóa nhiều collection | Thiết kế và thử phục hồi trước nghiệm thu phát hành |
| NFR-10 | Hiệu năng có số liệu trên môi trường xác định | Chưa có benchmark hoặc telemetry | Chốt workload/thiết bị, đo latency/memory/call capacity; không bịa SLA |

Dữ liệu cốt lõi: User, Session, Otp, Friend, FriendRequest, Conversation, Message, Post, Hashtag, Notification. Camera frame được phân tích ở browser; embedding enrollment và PIN hash được lưu User. Nội dung chat/bài/media là dữ liệu người dùng, chưa có E2EE hoặc thời hạn giữ dữ liệu tự động toàn hệ thống. Schema và ranh giới dữ liệu: [Design](./design.md).

## 7. Tiêu chí nghiệm thu

| ID | Kịch bản / kết quả mong đợi | FR | Mức hiện tại |
| --- | --- | --- | --- |
| AC-01 | Email signup phải xác minh OTP đúng purpose; mã sai/hết hạn không tạo user; gửi lại không dùng được mã cũ | 01,03 | Code; cần test tích hợp auth |
| AC-02 | Token hết hạn refresh được; token sai từ chối; lỗi quyền 403 không refresh vô hạn | 02 | Code; cần test auth/refresh đa request |
| AC-03 | Google mới hoàn tất hồ sơ; link mời được giữ qua đăng nhập/onboarding | 02,04,11 | Code; cần browser walkthrough |
| AC-04 | Hai bạn gửi/đọc tin, unread reset; stranger không truy cập API lịch sử/ghim/interaction | 07,09 | Code và suite groups ở phạm vi quyền đã có |
| AC-05 | Upload hợp lệ xem được; >50 MiB bị từ chối; mic/vị trí từ chối hiển thị lỗi | 08 | Code; cần media/device tests |
| AC-06 | Thu hồi chỉ sender; delete-for-me không mất dữ liệu người khác; ghim/chuyển tiếp đúng quyền | 09 | Code; cần toàn bộ ma trận trường hợp |
| AC-07 | Group creator có leader; member bị từ chối quản lý; leader không tự xóa mình | 10 | Có integration cases trong `server/test/groups.test.js` |
| AC-08 | QR chứa đúng URL; preview không tự join; join lặp không trùng; token cũ bị thu hồi | 11 | API có integration cases; QR cần browser |
| AC-09 | Người bị xóa không đọc/chat/gọi nhóm; cache dọn ngay và sau reconnect | 10,13 | Code + suite groups; browser reconnect cần xác nhận |
| AC-10 | Hai trình duyệt gọi được, mute/camera/end hoạt động; nhóm chia sẻ màn hình và thu nhỏ | 12,13 | Code; chưa có media/network nghiệm thu |
| AC-11 | Owner sửa tối đa 1 lần; feed/search/profile theo privacy; direct URL/interaction không vượt quyền | 14,15,16 | Một phần; direct access là Backlog P0 |
| AC-12 | Like/comment/reply/friend tạo notification đúng recipient; chỉ recipient mark read | 05,15,17 | Code; cần regression notification |
| AC-13 | Theme/màu/language giữ qua reload; nhãn nhất quán vi/en/zh; không hứa push khi chỉ lưu toggle | 18 | Code một phần; translation/push là Backlog |
| AC-14 | Enrollment đủ 5 mẫu; chủ không khóa; cùng người lạ chú ý đủ 3s khóa; mất dấu reset đúng ngưỡng | 19 | Tracker có unit tests; perception cần camera thật |
| AC-15 | Tab ẩn/logout/model lỗi không để camera chạy; PIN sai giới hạn; data chủ không lộ ra user khác | 19 | Code; cần integration/device audit |
| AC-16 | Python thiếu/model lỗi/timeout không treo app; kết quả hiển thị như heuristic | 20 | Một phần; timeout/error contract Backlog |
| AC-17 | Xóa tài khoản thu hồi session và xử lý dữ liệu liên quan theo policy | 21 | Chưa đạt; chỉ xóa User hiện tại |
| AC-18 | Mobile/desktop, bàn phím, focus, reduced motion, offline/reconnect được kiểm tra và ghi evidence | Tất cả UI | Chưa nghiệm thu đầy đủ |

Điều kiện phát hành: khép P0 privacy/session/data-integrity, hoàn thành regression/build cần thiết và browser/device walkthrough. Các ticket Done trong Kanban chỉ ghi nhận phần đã triển khai; không thay thế gate phát hành này.

## 8. Đo lường và quản lý thay đổi

Chưa có analytics tích hợp được xác nhận. Bộ chỉ số **đề xuất**, chưa có giá trị baseline hay target đã duyệt: tỷ lệ hoàn tất signup; tỷ lệ gửi tin thành công; latency gửi→nhận theo p50/p95; tỷ lệ kết nối/cuộc gọi lỗi; retention nhóm; lỗi upload; false-lock/false-negative Anti-Peep trên tập tình huống được đồng ý. Ghi nhận số liệu phải tránh lưu ảnh/embedding/nội dung riêng tư vào log.

Mỗi thay đổi sản phẩm cập nhật FR/BR/AC và ticket liên quan; đổi API/schema cập nhật Design; đổi thứ tự/dependency cập nhật Plan. Khi tài liệu mâu thuẫn với code, ghi rõ gap và quyết định sửa code hoặc spec; không viết lại yêu cầu để che lỗi quyền. Phiên bản 1.0 ghi nhận baseline 2026-10-08, chưa có lịch phát hành hoặc scope mới được duyệt.

## Tài liệu liên quan

- [Kanban và bằng chứng](./kanban.md)
- [Thiết kế sản phẩm/kỹ thuật](./design.md)
- [Kế hoạch hoàn thiện](./plan.md)
- [Tóm tắt codebase](./codebase-summary.md)
- [Quyền nhóm và lời mời](./group-roles.md)
- [Hướng dẫn agent](../AGENTS.md)

## Cập nhật sau pull — admin, poll và dịch cuộc gọi

Working tree đã hợp nhất upstream; baseline kiểm tra trước pull ở Kanban vẫn là lịch sử. Quyền nhóm chi tiết: [group-roles](./group-roles.md); evidence hiện tại: [pull-conflict-resolution](./validation/pull-conflict-resolution.md).

| ID | Yêu cầu đã triển khai | Bằng chứng / giới hạn |
| --- | --- | --- |
| FR-22 | Member nhóm tạo/vote poll, một hoặc nhiều lựa chọn; creator/admin/leader đóng poll | `server/src/controllers/messageController.js`, `client/src/components/chat/CreatePollModal.jsx`, Message.jsx; caps server và race vote/close cần test thêm |
| FR-23 | Mở note dịch âm thanh vi↔en trong cuộc gọi direct/group đang hoạt động | `server/src/routes/translationRoute.js`, `client/src/components/chat/TranslationNotes.jsx`, `ai-service/app.py`; service/AI thực chưa chạy trong đợt merge |
| BR-17 | Admin lưu role, creator DTO leader; role/delete/rotate chỉ creator; leave chuyển creator hoặc giải tán nhóm trống | Không cấp quyền từ role client; xem ma trận group-roles |
| BR-18 | Poll embedded Message; >=2 options hợp lệ; single-choice chuyển/toggle, multiple toggle; closed không vote | Backend membership trước create/vote/close; UI caps không phải cap server |
| BR-19 | Dịch direct chỉ sau answer accepted; group viewer và speaker phải ở phòng gọi; end/disconnect thu hồi direct session | State RAM; sessionId direct là userId đối tác, group là conversationId |
| BR-20 | Translation upload field audio <=2MiB; target en/vi, source en/vi/auto; AI proxy health15s/translate90s timeout | Audio clip được gửi browser→backend→AI; khác media WebRTC peer-to-peer thông thường |
| AC-19 | Creator/admin/member được quyền đúng; admin không role/delete/rotate/removeadmin/creator; leave successor và legacy revoke đúng | Backend groups có regression; UI/device walkthrough chưa có |
| AC-20 | Outsider không create/vote/close poll; user đủ quyền vote/toggle/close và client nhận messageUpdated | Regression quyền có; concurrency/caps cần QA |
| AC-21 | Unaccepted/ended/nonparticipant direct không dịch; group membership đúng; service missing/error/timeout không treo; notes cleanup đúng | Direct-session regression có; AI output/latency/permission/retention chưa nghiệm thu |

Audio dịch đi tới các service cấu hình; cần thông báo rõ việc xử lý âm thanh và chốt consent/retention/logging trước release. Notes client giữ tối đa50 entries, không có persistence notes server được xác nhận. Không gọi đây là bản ghi/transcript đầy đủ hoặc dịch liên tục không bỏ đoạn: client clip6s, backlog nhỏ có thể bỏ clip khi xử lý chậm.
