# Chia sẻ màn hình cho người vào phòng muộn

Ngày kiểm tra: 11/11/2026, Asia/Saigon. FR-13, AC-10, QS-I13; QS-Q01/Q03 giữ mở cho thiết bị và mạng thật.

## Lỗi và thay đổi

Peer mới trước đây chỉ nhận `localStream` chứa mic/camera. Màn hình được add/replace trên các peer đã có nhưng không nằm trong stream dùng tạo peer sau đó. Người vào muộn có cờ `isScreenSharing` mà không có video màn hình. Khi start share sát thời điểm người khác đang join, peer chưa được tạo cũng bỏ sót track. Luồng stop cũ còn suy track đang gửi từ `peer.streams[0]`, nên có thể chọn nhầm track khi khôi phục camera.

`useGroupCallStore.js` hiện giữ stream gửi ổn định với mic gốc và một nguồn video hiện tại, ưu tiên màn hình. Cả hai phía initiator/answerer dùng stream này khi tạo peer. Add/replace/remove dùng đúng track và stream đã gửi; stop trở về camera còn bật hoặc bỏ video. Camera bật/tắt trong lúc share không ghi đè màn hình. `track` event cập nhật UI cho video thêm sau audio; media flags từ signaling dùng metadata participant của server khi chưa có snapshot. Leave/disconnect hủy capture đang chờ và dừng track trả về muộn; click lặp không mở thêm capture.

Không thay server signaling, ngôn ngữ nhóm, nguồn PCM dịch hoặc model AI. Mic trong stream gửi là cùng đối tượng track với mic dùng cho Note và mute.

## Kiểm chứng

```powershell
node server/test/browser/groupScreenShare.mjs
node server/test/browser/groupLanguages.mjs
node --test server/test/groupCallLanguages.test.js server/test/groupTranslation.test.js server/test/directCallSignaling.test.js server/test/directCall.test.js server/test/translationLanguages.test.js
npm --prefix client run lint
npm --prefix client run build
node --check client/src/stores/useGroupCallStore.js
git diff --check
```

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| Chrome + WebRTC | 10 tình huống đạt với 3 participant: người cũ/người vào muộn camera off, stop rồi bật camera, rejoin khi camera on, đổi camera lúc share, callback screen ended khôi phục camera, share nhiều lần, mic sender/mute, rời khi chờ screen/camera |
| Media thật trong browser | Dùng simple-peer và RTCPeerConnection thật; đọc pixel từ video DOM để phân biệt màn hình xanh và camera đỏ. Không chỉ kiểm cờ UI hoặc fake peer |
| Signaling | Socket.IO/JWT localhost thật; User/Conversation/Message là fixture, không kết nối DB thật. ICE chỉ host, không STUN/TURN bên ngoài |
| Capture | Mic oscillator, camera/màn hình canvas; screen `ended` được phát trong fixture. Chưa mở trình chọn cửa sổ native hoặc dùng mic/camera thật |
| Ngôn ngữ nhóm | Browser regression đạt, 3 nguồn/11 lần mở stream và PCM AudioWorklet thật; signaling/AI của fixture này vẫn giả lập |
| Node regression | 18/18 đạt: direct/mute, session quyền, group language/attendance/revision và routing |
| Lint/build/syntax | Lint 0 errors/warnings, build đạt với cảnh báo chunk >500 kB, `node --check` đạt |
| Diff | Không lỗi whitespace; các file đã có từ trước còn cảnh báo chuẩn hóa LF/CRLF của Git |

Trước sửa, fixture WebRTC ghi nhận cờ share=true nhưng remote stream không có video khi start share sát lúc join. Sau sửa, 10 tình huống trên đạt. [JSON](./assets/2026-11-11-group-screen-share/result.json), [ảnh người vào muộn](./assets/2026-11-11-group-screen-share/late-join.png), [hồi quy ngôn ngữ](./assets/2026-11-11-group-screen-share/language-regression.json).

## Runtime local

Đã chạy `docker compose up -d --build --no-deps frontend` để áp dụng code vào frontend local. Container frontend mới `86f3f087d8c8`; backend/AI/Whisper/PhoWhisper/Qwen giữ container cũ. Module `/src/stores/useGroupCallStore.js` tại localhost:5173 trả HTTP 200 và có helper mới. SHA256 source trong container khớp workspace: `c706115428cd58f31897ed8e5c4bd915f9151d1b698ae940794882c76ce54e6c`.

Trình duyệt đang mở bản trước cần tải lại trang và vào lại phòng. Không commit/push hoặc deploy cloud. Chưa nghiệm thu share cửa sổ thật giữa các máy, NAT/TURN, tải đông người hay chất lượng ASR/MT; không suy các kết quả đó từ pixel canvas hoặc build pass.
