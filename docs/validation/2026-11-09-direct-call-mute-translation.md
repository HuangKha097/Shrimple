# Gọi trực tiếp: mute, nguồn âm thanh và ngôn ngữ từng người

Ngày 09/11/2026, Asia/Saigon. Phạm vi FR-12/FR-23, QS-I12/QS-I23;
Q01/Q03 vẫn mở cho mic/WebRTC và chất lượng dịch thực tế.

## Lỗi và bản sửa

- `CallModal` trước đây xin media theo `isCallIncoming/isCallActive`. Accept đổi
  hai cờ này và xin stream mới, trong khi peer giữ stream trước đó. Toggle mute
  thao tác state stream mới; stream cũ có thể vẫn gửi tiếng và không được dọn.
  Answer nhanh còn có thể cạnh tranh với lần xin media trong effect.
- `directCallSession.js` sở hữu một stream/peer/listener theo local callId.
  Incoming chỉ xin mic khi trả lời; double answer dùng chung một lần xin quyền;
  accept không đổi identity/stream. Mute/camera tác động đúng stream gắn peer.
  End/error/disconnect/unmount dừng track và dọn listener; media trả về sau end
  cũng bị stop. Reset mute/camera/remote state khi bắt đầu call mới.
- Direct trước đây luôn đưa `muted:false` cho source đối phương. Nay relay
  `callMediaState` chỉ trong session accepted, identity lấy từ JWT; chỉ nhận
  event đúng peer. Mute dừng source PCM của đúng người, bỏ kết quả trễ;
  unmute bắt đầu stream nhận dạng mới, không xin thêm mic hoặc replay buffer.
- Capture và source selector kiểm tra track live/enabled/muted. Browser track
  mute/unmute/ended được subscribe/unsubscribe để reconcile nguồn. Pending self
  original cũng bị đánh dấu interrupted khi stop, tránh trạng thái tạm treo.
- UI cũ lấy B trong A→B làm ngôn ngữ mic viewer. Hai người cùng nói Việt và
  chọn Việt→Anh khiến self bị ép nhận dạng tiếng Anh. Direct nay có **Bạn nói C**
  độc lập: remote A→B, self C→C với `translate:false`. Chọn/đảo A/B không đổi C;
  C mặc định theo UI en/vi. Group giữ cấu hình self B→B hiện hữu.
- Nguồn local và remote giữ track/streamId/speakerId riêng; cùng utteranceId
  giữa hai stream không gộp note hoặc gắn bản dịch sang người khác. Đổi ngôn ngữ,
  mute/end loại kết quả stream cũ. Không suy diarization từ câu nhận dạng.
- Mic constraints bật echoCancellation/noiseSuppression/autoGainControl.
  Đây là yêu cầu gửi browser, không chứng minh đã loại hết âm loa lọt vào mic.
- Mobile đặt controls dưới bảng note để vẫn bấm được mute/end; bổ sung nhãn
  i18n và focus-visible. `endCall` chỉ relay nếu cặp user có call tồn tại.

Không thay checkpoint ASR/MT, decoder hoặc thuật toán dịch. Chưa có bằng chứng
model thật dịch đúng mọi nghĩa; các bản dịch trong fixture là dữ liệu giả định.

## Kiểm chứng đã chạy

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| `npm --prefix client run lint` | Pass, 0 lỗi/cảnh báo |
| `npm --prefix client run build` | Pass; còn cảnh báo bundle >500 kB |
| `node --test server/test/directCall.test.js server/test/directCallSignaling.test.js server/test/translationLanguages.test.js` | 12/12 pass: ownership/mute/pending media/cleanup, cặp ngôn ngữ, xen kẽ speaker, JWT/accepted/end/disconnect bằng Socket.IO localhost |
| Từ `ai-service/`: `training/.venv-check/Scripts/python.exe -m unittest discover -s tests -p 'test_*.py' -v` | 22/22 pass: ONNX Silero thực, phân đoạn, formatting và model/HTTP mocks. Có Starlette/httpx deprecation warning |
| `node server/test/browser/directCall.mjs` | Pass trên Chrome headless; React StrictMode, MediaStream và AudioWorklet thực, audio tổng hợp; peer/signaling/AI giả lập |
| `git diff --check`, `node --check` cho session/backend | Pass |

Manifest hiện tại chưa có `client test`, `server test` hoặc `server test:ai`
scripts như một số tài liệu lịch sử. Các commands trực tiếp ở trên là commands
đã chạy; không khẳng định đã chạy lại bộ integration nhóm cũ không có trong tree.

Socket.IO test dùng User lookup giả và key test, trỏ dotenv tới file không tồn
tại; không đọc env thật, không dùng DB thật. Lượt sandbox không kết nối được
localhost/treo TestClient đã dừng; các lượt có quyền chạy cục bộ sau đó đều pass.

Browser kiểm tra: ringing không mở mic; accept chỉ tạo một stream/peer; PCM từ
cả hai nguồn; đổi Việt→Anh giữ mic self ở Việt; original của hai người và bản dịch
đúng dòng; mute từng người dừng upload; unmute không xin lại mic; remote end dọn
track/peer; gọi lại cùng user có stream mới và mic enabled.
Fixture chờ mount idle của app trước khi giao incoming event, tránh tương tác
giữa các lượt mount giả lập StrictMode của fixture.

Desktop dark 1280×900 và mobile light/custom accent 390×844 có đủ ba select,
không tràn ngang; mobile controls nằm dưới panel. Đã xem ảnh render; giảm motion
được bật trong fixture. Artifact aggregate và ảnh dùng dữ liệu test:

- [Kết quả browser](./assets/2026-11-09-direct-call/result.json).
- [Desktop dark](./assets/2026-11-09-direct-call/desktop-dark.png).
- [Mobile light](./assets/2026-11-09-direct-call/mobile-light.png).

## Đồng bộ contract và giới hạn

Design ghi ownership/media relay và C độc lập; PRD FR-23/AC-21 được đồng bộ.
Cụm AC-21 cũ “không ghi mic viewer” mâu thuẫn với self transcript đã có ở
Design/code trước đợt này. Nay AC ghi rõ viewer chỉ nhận dạng lời gốc khi mở Note,
không dịch và tôn trọng mute. Không mở thêm quyền self ở backend; ngoại lệ
viewer=speaker/source=target/translate=false đã tồn tại và vẫn giữ nguyên.

Chưa thử hai trình duyệt với RTCPeerConnection, mic/camera/loa thật, nói chồng,
NAT/TURN/reconnect hoặc model ASR/MT đang phục vụ. Tại lúc kiểm tra không có
dịch vụ app/AI nghe trên các cổng local đã dò. Cần chạy lại backend và tải lại
cả hai phía để dùng event mới, rồi đối chiếu câu gốc/bản dịch với audio thật.

Các thay đổi training/CSS/tài liệu không liên quan đã có trong working tree
được giữ. Chưa commit/push/deploy.
