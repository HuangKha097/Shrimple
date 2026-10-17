# Vai trò nhóm, lời mời và bình chọn

Cập nhật: **2026-10-08**, sau hợp nhất upstream. Quyền backend là authority; nhãn/CTA trên client không cấp quyền.

## Vai trò và quyền

Creator hiện tại là `group.createdBy`, được DTO trả `leader`; delegated admin giữ `participants[].role=admin`; còn lại `member`. Nhóm cũ suy creator từ createdBy, không cần migration chỉ để có nhãn leader. Không suy creator từ admin hoặc role do client gửi.

| Thao tác | Leader | Admin | Member |
| --- | --- | --- | --- |
| Chat/gọi nhóm, vote, tạo poll, lấy/chia sẻ link | Có | Có | Có |
| Sửa tên/mô tả nhóm | Có | Không | Không |
| Thêm người dùng hiện có vào nhóm | Có | Có | Không |
| Xóa member thường khác mình | Có | Có | Không |
| Xóa admin khác | Có | Không | Không |
| Xóa creator / tự remove bằng API remove | Không | Không | Không |
| Gán/thu hồi admin của người khác | Có | Không | Không |
| Xóa nhóm, đổi token mời | Có | Không | Không |
| Rời nhóm | Có, chuyển creator | Có | Có |
| Đóng poll | Có | Có | Chỉ poll mình tạo |

Khi creator rời: chọn admin đầu tiên làm successor, nếu không có thì participant đầu tiên; cập nhật createdBy và role leader. Nhóm hết người bị xóa cùng tin nhắn. Remove/leave dọn seenBy, unread và phòng gọi; các thao tác nhiều bước chưa có bảo đảm transaction toàn bộ.

`updateGroup` nhận tên trim 1–100 ký tự, mô tả tối đa 1000. Thêm members kiểm tra ObjectId, user tồn tại, loại trùng và người đã có trong nhóm; atomic authority/filter có thể trả 409 nếu nhóm thay đổi đồng thời. Gán role chỉ nhận admin/member và không thay creator. UI ChatInfo chứa thêm người/role/leave; GroupDetails chứa edit/delete/invite.

## Link mời và QR

Link mới `/groups/join/:token`, token random 32 byte / hex 64 ký tự. GET invite trả `token` và `inviteCode` alias **cùng token 64 hex**, kèm conversationId/name/avatarURL/participantsCount. `group.inviteCode` lưu DB chỉ phục vụ legacy; không đưa inviteToken/inviteCode vào conversation DTO/socket update.

Backend preview/join tra **token lưu DB**, không tra `_id` nhóm để cấp quyền. Chấp nhận legacy code hex 24 ký tự nếu thật sự khớp `group.inviteCode` hoặc inviteToken; biết conversationId không đủ để tham gia. POST `/join/:inviteCode` là alias của secure join, không nhánh bỏ qua token. Rotate chỉ creator: set token mới và unset legacy inviteCode, thu hồi cả mã/link cũ.

Trang mời mới yêu cầu login/complete profile, giữ link 64 hoặc legacy24 hex qua sessionStorage, preview không auto join; join lần đầu 201 và đã member 200, tránh participant trùng. Legacy code 24 hex có hỗ trợ backend; client đã nhận cả64/24hex và giữ đường dẫn qua onboarding; browser walkthrough vẫn chưa chạy.

GroupDetails sinh QR/SVG bằng qrcode.react; upstream TreeQRCodeModal thêm cây 3D và scan camera/file qua html5-qrcode. Link mời mới đi tới preview xác nhận; scan link mới/legacy đều tới preview xác nhận, không tự join. URL mời không gửi tới dịch vụ tạo QR bên ngoài; quyền camera/khả năng scan cây 3D cần thử browser thực. Member bị xóa vẫn có thể quay lại với link còn hợp lệ; chưa có ban vĩnh viễn/expiry tự động.

## API (protectedRoute + quyền tài nguyên)

| Method | Đường dẫn dưới `/api/conversations` | Quyền / kết quả |
| --- | --- | --- |
| PATCH | `/:conversationId/group` | Creator; `{name,descriptionGroup}` |
| DELETE | `/:conversationId/group`, `/:conversationId` | Creator; xóa nhóm/lịch sử; route thứ hai alias |
| POST | `/:conversationId/members` | Leader/admin; `{memberIds}` |
| DELETE | `/:conversationId/members/:memberId` | Leader/admin theo ma trận |
| PATCH | `/:conversationId/members/:memberId/role` | Creator; `{role:admin hoặc member}` |
| POST | `/:conversationId/leave` | Member; chuyển creator nếu cần |
| GET | `/:conversationId/invite` | Member; token + inviteCode alias và metadata |
| POST | `/:conversationId/invite` | Creator; rotate token, unset legacy |
| GET | `/invites/:token` | User đăng nhập; preview không list members |
| POST | `/invites/:token/join`, `/join/:inviteCode` | User đăng nhập; token lookup + idempotent join |

`conversationUpdated`, `conversationRemoved`, `groupInviteChanged`, `newConversation`, `groupDisbanded` đồng bộ client. Removed member không truy cập lịch sử/ghim/media/interaction/poll/forward/gọi nhóm; reconnect refetch và dọn cache. Socket xác thực JWT từ `handshake.auth.token`; query userId không là authority. 401 auth và 403 quyền được xử lý riêng.

## Poll

Poll là messageType `poll` với poll embedded trong Message, không có model/collection Poll riêng. Member nhóm tạo câu hỏi và >=2 phương án có nội dung; allowMultiple boolean. Single-choice chuyển vote sang phương án mới hoặc bỏ chọn khi bấm lại; multi-choice toggle từng option. Không vote poll closed. Poll creator còn là member, leader hoặc admin có thể close; outsiders bị chặn trước controller.

API dưới `/api/messages`: POST `/poll` với `{conversationId,question,options,allowMultiple}`, POST `/:id/vote` với `{optionId}`, PUT `/:id/poll/close`. Trả `{message}`; `newMessage`/`messageUpdated` phát realtime. UI giới hạn 10 options/question250/option150 nhưng backend chưa enforce toàn bộ caps; vote/close concurrent chưa được chứng minh atomic.

## Kiểm chứng

Sau hợp nhất: backend **20/20** (19 nhóm + 1 direct translation session), gồm race join gọi khi remove/delete/disconnect và concurrent joins; không test media/AI/camera bằng suite này. [Evidence sau pull](./validation/pull-conflict-resolution.md) ghi lint0errors8warnings, tracker8/8, build pass và giới hạn. [Evidence cleanup trước pull](./validation/codebase-cleanup.md) giữ nguyên như lịch sử, không dùng để kết luận tree mới.
