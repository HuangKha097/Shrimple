# Bằng chứng xử lý conflict sau pull

Ngày: **2026-10-08**, Asia/Saigon. Phạm vi: hợp nhất working tree với upstream, giữ cleanup/tài liệu trước đó cùng các tính năng upstream. Đây là evidence của tree sau merge, tách [cleanup trước pull](./codebase-cleanup.md).

## 1. Hợp đồng giữ khi giải conflict

- Socket JWT identity + conversation membership; creator từ createdBy trả DTO leader, persisted admin không bị format thành member.
- Creator-only role/delete/rotate; admin add/remove member thường/closepoll; creator không bị admin remove. Leave chuyển successor hoặc xóa nhóm trống.
- Invite mới token64hex, inviteCode response alias cùng token; DTO/socket không lộ cả hai secrets. Legacy24hex chỉ tra mã được lưu, không dùng `_id` bypass. Rotate unset legacy; join repeated idempotent.
- QR64/24hex giữ qua auth/onboarding và scan tới preview confirm, không auto-join. UI leader/admin đồng nhất backend poll-close; invite rotation làm mới token/QR.
- Upstream poll, group-call metadata/incoming call và direct/group TranslationNotes được giữ. Direct translation chỉ accepted-call, end/disconnect thu hồi; group query không xóa session direct.

Source: groupController/conversationController/messageController, conversationHelper/Message/Conversation, routes/socket, ChatInfo/GroupDetails/TreeQRCodeModal/TranslationNotes và call stores/modals. API và data contract: [Design](../design.md), [quyền nhóm](../group-roles.md).

## 2. Kết quả tree cuối đã chạy

| Check | Kết quả được parent xác nhận tại thời điểm viết | Giới hạn |
| --- | --- | --- |
| `npm --prefix server test` | PASS **20/20** (19 nhóm + 1 direct translation session); lượt trung gian16/16 là lịch sử | MongoDB tạm/cache dự án; gồm remove/delete/disconnect race khi join gọi và concurrent joins; không AI/media thật |
| `npm --prefix client test` | PASS **8/8** trên tree sau merge | Tracker, không Human perception/camera |
| `npm --prefix client run lint` | PASS **0 errors / 8 warnings**; lượt giữa4errors/9warnings đã được xử lý | Warnings còn lại; trước pull7warnings là lịch sử |
| `npm --prefix client run build` | PASS **18,68s / 3509 modules**; còn large chunk và mixed static/dynamic useAuthStore warnings | Bundle pass không là U/P |
| Manifest/lock root dependencies | PASS client và server; install --ignore-scripts client29 added/server1changed | Không chứng minh dependency security/AI runtime |
| Server syntax | PASS toàn bộ **39 JS files** | Syntax, không thay nghiệp vụ |
| Review scoped cuối | PASS frontend/backend, không còn blocker đã phát hiện | Không thay live AI/WebRTC/browser acceptance |
| Docs links/code paths | PASS **0 broken links / 0 missing paths**, tất cả <800lines | Chỉ nội dung tài liệu đã kiểm tra |
| Git index resolved | Parent đã `git add`19 conflictedfiles cùng fix liên quan; `git ls-files -u` và diff --diff-filter=U đều rỗng | Giữ stagedlocalchanges trước đó; không commit/push |
| Live AI/test:ai/camera/QR scan/WebRTC/network/production | Chưa chạy | Không claim dịch chính xác/latency hoặc cuộc gọi thật |

Kết quả do parent thực chạy trên tree sau sửa; giữ riêng kết quả trung gian/baseline để tránh đánh tráo snapshot. Các mốc U/P và Git marking resolved chỉ ghi khi có evidence tương ứng, không tự suy từ test pass.

## 3. Tài liệu đã đồng bộ

PRD thêm FR22/23, BR17–20, AC19–21; Kanban42tickets25Done17Backlog. Sửa role/invite/leave và thêm poll/translation/AI dependencies vào Design/Plan/Summary/AGENTS. Snapshot Repomix trước pull được gắn nhãn lịch sử; source upstream đọc trực tiếp.

## 4. Giới hạn và việc tiếp theo

Q01/Q02/Q03 tiếp tục theo dõi browser/device, poll caps/concurrency, dịch audio consent/retention/permissions/service readiness/timeout và call NAT. Policy whoCanMessage/block, post/profile privacy, account deletion và media gaps trước đây không được tự đánh dấu Done do merge. Không deploy/commit/push chỉ vì xử lý conflict.
