# Ngôn ngữ theo từng thành viên trong cuộc gọi nhóm

Ngày kiểm tra: 11/11/2026. Liên quan FR-23, BR-19/20, AC-21, QS-I13/I23; Q01/Q03 vẫn mở.

## Hành vi đã triển khai

- Mỗi thành viên chọn **Tôi nói ngôn ngữ…** ở thanh cuộc gọi, dùng được khi Note đóng. Join gửi khai báo `vi/en`; lựa chọn ban đầu theo ngôn ngữ UI, UI khác dùng `vi`.
- Mỗi viewer chọn **Tôi muốn đọc ngôn ngữ…** trong Note. Thay đích không đổi ngôn ngữ nói của mình hoặc người khác.
- ASR theo ngôn ngữ từng speaker; MT theo đích từng viewer. Nguồn trùng đích dùng `translate:false`, chỉ original, kể cả nguồn remote. Group cũng có thể dịch lời của chính viewer nếu khác đích; direct vẫn chỉ tự chép lời mình.
- Nhãn speaker lấy từ danh tính/track, không từ cờ `translate:false`. Nhiều track không được trộn thành một nguồn; hai thiết bị cùng tài khoản có khóa socket+attendance riêng.
- Đổi ngôn ngữ hoặc lượt tham gia đóng stream cũ, bỏ callback/kết quả đến muộn. Leave/disconnect thu hồi cả capture/peer/mic; hủy được join đang chờ lookup hoặc quyền micro.

## Quyền và vòng đời

`socket.js` lưu `spokenLanguage,languageRevision,attendanceId` trên participant theo socket. `groupCallSetLanguage` chỉ cập nhật chính socket đã xác thực với đúng callId/attendanceId; thay participant reference và tăng revision khi đổi ngôn ngữ.

Group `translation:start` thêm `speakerSocketId,speakerAttendanceId,speakerLanguageRevision,viewerAttendanceId`. Bridge đối chiếu hai attendance và nguồn khai báo, từ chối metadata cũ bằng409 trước khi mở AI, kiểm lại quyền sau lookup và trước mọi gói/event. Invalidation đóng upstream ngay khi đổi nguồn/leave/end; không đụng direct session.

Client cũ chưa gửi ngôn ngữ có `spokenLanguage:null`; không mở ASR cho nguồn chưa khai báo. Giới hạn hiện hữu giữ8streams/socket,64/process, tính cả nguồn local; không tuyên bố hỗ trợ số thành viên không giới hạn. Pipeline vẫn có thể chạy ASR riêng cho cùng một speaker ở nhiều viewer; chưa có chia sẻ kết quả ASR toàn phòng hoặc đo tải nhóm thực.

## Kiểm chứng

```powershell
node --test server/test/groupCallLanguages.test.js server/test/groupTranslation.test.js server/test/directCallSignaling.test.js server/test/directCall.test.js server/test/translationLanguages.test.js
node server/test/browser/groupLanguages.mjs
node server/test/browser/directCall.mjs
npm --prefix client run lint
npm --prefix client run build
git diff --check
```

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| Node regression | 18/18: nhóm3speaker, hai đích đọc, cùng ngôn ngữ không MT, nguồn giả, stale revision/attendance, lookup đang chờ, leave/rejoin, cùng tài khoản nhiều socket; hồi quy direct/mute/revision |
| Socket.IO localhost | JWT thật với key test riêng;4client,3member và1outsider; quyền đổi ngôn ngữ, metadata signaling server, immutable participant, rejoin/cancel pending join. User/Conversation/Message được mock, không dùng DB thật |
| Chrome nhóm | Real React StrictMode, group store/modal, MediaStream và AudioWorklet;3nguồn audio tổng hợp, peer/signaling/AI giả lập; đổi đích, đổi nguồn local/remote, remote rời, kết quả cũ, leave/rejoin/disconnect và permission đến muộn đều đạt |
| Chrome direct | Hồi quy real React/MediaStream/AudioWorklet với audio tổng hợp; một mic/peer, mute, đích độc lập ngôn ngữ nói, kết thúc/gọi lại đạt |
| Bố cục | Đã xem PNG1280×900 dark và390×844 light; Note một ô đích, ô ngôn ngữ nói ở dock; không tràn/chồng thanh điều khiển. Reduced motion được bật trong fixture |
| Lint/build | Lint0errors/warnings; Vite build đạt, còn cảnh báo chunk>500kB |
| Diff | Không có lỗi whitespace; Git có cảnh báo LF/CRLF ở các file đã có thay đổi trước phiên này |

Ảnh và JSON kết quả: [desktop](./assets/2026-11-11-group-language-routing/desktop-dark.png), [mobile](./assets/2026-11-11-group-language-routing/mobile-light.png), [browser result](./assets/2026-11-11-group-language-routing/browser-result.json). Packet count trong fixture tùy lịch chạy, không phải throughput/latency benchmark.

## Giới hạn và trạng thái

Không đổi checkpoint ASR/MT, VAD hoặc thêm TTS. Chưa chạy mic/tai nghe/WebRTC/NAT/TURN thật, đánh giá nghĩa dịch với bản chuẩn hoặc tải nhiều cuộc gọi. Người dùng chưa có bộ audio tham chiếu; không suy chất lượng ASR/MT từ cấu hình, unit tests hay audio tổng hợp. Chưa rebuild/recreate dịch vụ đang chạy, commit, push hoặc deploy.

Thay đổi chính: `useGroupCallStore.js`, `GroupCallModal.jsx`, `TranslationNotes.jsx`, `translationStream.js`, `translationNotesState.js`, `socket.js`, `translationPcm.js`, CSS và i18n; contract hiện hành ở [Design](../design.md).
