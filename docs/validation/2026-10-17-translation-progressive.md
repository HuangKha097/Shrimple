# Note gốc trước bản dịch, chỉ audio đối phương — 2026-10-17

QS-I23 / FR-23, BR-19/20, AC-21. Phạm vi: sửa ngữ nghĩa nguồn audio,
chiều Anh↔Việt và hiển thị hai bước. [Số đo trước sửa](./2026-10-17-translation-speed.md)
dùng clip6s; không dùng số đo đó làm latency của bản progressive.

## Lý do và hành vi

Trước sửa, modal đưa cả mic viewer và audio remote vào TranslationNotes;
client chờ JSON chứa cả nhận dạng lẫn dịch mới tạo note. Chiều mặc định
Việt→Anh dễ khiến người đọc tiếng Việt chọn ngược ngôn ngữ của đối phương.

- CallModal/GroupCallModal chỉ cung cấp nguồn remote; TranslationNotes còn
  loại id của viewer trước khi tạo recorder. Mỗi viewer chỉ thấy note đối phương.
- Clip mục tiêu2s thay6s; original xuất hiện sau khi STT hoàn tất, translation
  được cập nhật phía dưới cùng note. Lỗi dịch giữ original đã nhận.
- Anh→Việt nghĩa là đối phương nói Anh, viewer đọc Việt; Việt→Anh ngược lại.
  UI vi/zh mặc định Anh→Việt, UI en mặc định Việt→Anh.
- Đổi chiều hủy recorder/mọi request và xóa note cũ; giữ tối đa50notes.
  Coordinator giới hạn hai request mở/source, chỉ một request đang chờ STT
  và một clip mới nhất chờ; backlog đầy bỏ clip chờ cũ. Khi nhận transcript,
  gửi clip tiếp theo mà không chờ bản dịch cũ, trong giới hạn hai request.
- Hidden tab, đóng bảng, hết phiên, logout/unmount dọn recorder/request;
  đổi/kết thúc phiên và logout xóa notes. Đóng rồi mở lại cùng phiên giữ note.
  Note đang chờ dịch bị dừng được đánh dấu gián đoạn; lỗi có nút thử lại.

Nguồn client đã đối chiếu: `client/src/components/chat/TranslationNotes.jsx`,
`translationStream.js`, `CallModal.jsx`, `GroupCallModal.jsx`; helper stream
lọc self/muted/track đã kết thúc và kiểm tra speaker/chiều khi nhận event;
`translationQueue.js` điều phối giới hạn request/clip theo nguồn audio.

## Hợp đồng hiện hành

`server/src/routes/translationRoute.js` thêm POST `/api/translation/chunk-stream`
sau JWT. Multipart giống `/chunk`: audio, kind, sessionId, speakerId,
targetLanguage(en/vi), sourceLanguage(en/vi/auto). Giữ max2MiB,
webm/mp4/wav, kiểm tra viewer/speaker trong accepted direct session hoặc
active group room. `/chunk` vẫn trả JSON để giữ consumer cũ.

GET `/api/translation/health` và FastAPI `/health` thêm mode=transcribe:
chỉ kiểm tra Whisper, không đòi Qwen sẵn sàng. Mặc định vẫn kiểm tra cả hai;
mode không hợp lệ400. Bảng note dùng mode=transcribe để lỗi dịch văn bản
không chặn bắt đầu nhận chữ gốc.

Response thành công có Content-Type application/x-ndjson, no-store,
X-Accel-Buffering=no. Mỗi event JSON trên một dòng kết thúc newline:

| Event | Fields |
| --- | --- |
| transcript | type, speakerId, speakerName, original, sourceLanguage, targetLanguage |
| translation | type, translated |
| error | type, status, message |

Transcript đến trước translation; error có thể kết thúc thay translation.
EOF kết thúc response, không có event done. Lỗi trước khi mở stream trả
JSON với HTTP status phù hợp; lỗi sau transcript là terminal error trong
stream đã mở, không đổi HTTP status. Proxy giới hạn64KiB/event từ AI, kiểm tra
UTF-8/JSON/schema/thứ tự/newline và chỉ chốt translation khi upstream EOF hợp lệ.
Client parser giới hạn128KiB/event để nhận thêm metadata người nói/chiều dịch,
giới hạn384KiB toàn stream; không thay cap của proxy upstream.
Lỗi trả client được lọc, không đưa chi tiết clip/note/upstream vào message.

Cả `/chunk` JSON và `/chunk-stream` giữ reference phiên và attendance
viewer/speaker trong group. JSON kiểm tra lại trước inference và trả kết quả;
stream kiểm tra trước từng event. End/disconnect/leave rồi rejoin không nhận
note từ công việc cũ. Thu hồi chỉ trả lỗi an toàn, không thêm nội dung note.
Client disconnect hủy fetch/reader; decoder reader luôn được cleanup.

`ai-service/app.py`: POST `/translate` thêm Form stream mặc định false.
stream=true trả transcript(type,original,source_language), sau đó
translation(type,translated) hoặc error(type,status,message), EOF, không done.
Giữ khóa backend, decode WAV mono16kHz, audio<=15s, silence bypass và ngân sách80s.
Tách stt_slot và text_translation_slot, mỗi slot một job/tiến trình,
acquire không chờ; không tạo hàng chờ inference. Streaming nhả STT trước khi
trả transcript, cho phép STT đoạn sau chạy trong lúc dịch đoạn trước.
STT bận trả429 trước original; text slot bận trả terminal error429 sau
original, nên note giữ chữ gốc và bỏ bản dịch của đoạn đó. JSON legacy lấy
cả hai slot trước STT. Release cả lỗi/disconnect; model inference đã chạy
có thể tiếp tục tới timeout, không hứa dừng tính toán tức thì khi abort.
Whisper/Qwen, model cache, CPU mặc định và NVIDIA Compose opt-in không đổi.

## Kiểm tra tree cuối

Kết quả sau follow-up tách STT/dịch, health mode=transcribe và coordinator
hai request; model HTTP giả lập trừ các phần được nêu rõ là thực.

| Lệnh / môi trường | Kết quả / phạm vi |
| --- | --- |
| Root: `npm --prefix server test` | PASS42/42,16.07s; groups/poll/friend, translation session và REST, sau health follow-up. MongoDB tạm với cache workspace/runtime download=false; không DB ứng dụng |
| cwd `server/`: `node --test tests/translationRoute.test.js`; MONGOMS_DOWNLOAD_DIR trỏ node_modules/.cache/mongodb-memory-server, MONGOMS_RUNTIME_DOWNLOAD=false | PASS21/21; JWT/session/audio, JSON cũ, HTTP stream trả original khi dịch còn chờ, health mode, hai chiều/silence, lỗi đã lọc, end/đổi phiên/group leave-rejoin, malformed/oversized/thừa event/EOF thiếu và cancel reader |
| cwd `ai-service/`: `./.venv/Scripts/python.exe -m unittest -v test_app`; PATH thêm ../.tmp/translation-check/tools để tìm FFmpeg | PASS31/31; FFmpeg thực và hai HTTP stream localhost thực với Qwen mock bị giữ chờ: original tiếp theo vẫn tới, slot dịch bận trả429 sau original. Whisper/Qwen mock, không chấm chất lượng model thật |
| Root: `node --test client/src/components/chat/translationStream.test.js client/src/components/chat/translationQueue.test.js` | PASS17/17; parser/nguồn/chiều và coordinator bounded, không dùng mic/WebRTC thật |
| `npm --prefix client test` | PASS8/8; Anti-Peep tracker, không xác nhận dịch/audio |
| `npm --prefix client run lint` | PASS0errors/3warnings có sẵn |
| `npm --prefix client run build` | PASS3509modules; còn mixed static/dynamic import và chunk-size warnings |
| Browser fixture với TranslationNotes thật | PASS concurrency/nguồn/chiều/lifecycle bên dưới; MediaRecorder, sources và API giả lập |

TestClient còn deprecation warning có sẵn. Review độc lập ban đầu phát hiện
STT còn chờ dịch cũ; đã tách slot và bổ sung hồi quy. Lượt review độc lập cuối
không hoàn tất do usage limit; parent đã review source và chạy checks trên.

Kiểm tra tài liệu: links local/LOC/diff được kiểm tra; không doc nào vượt800dòng.
Validator có warning MONGOMS_DOWNLOAD_DIR là biến test-only ngoài env sample,
không phải cấu hình sản phẩm.

## Browser fixture

Alice là viewer, Bob/Carol là nguồn remote giả; không cấp quyền microphone.

- Chỉ Bob được ghi ban đầu, không upload mic Alice. Original2 hiện khi
  translation1 còn chờ; dịch đến sau cập nhật đúng entry đã có.
- Hai stream/source và một clip chờ được giữ giới hạn: bob3/bob4 bị bỏ,
  request tiếp theo là bob5. Không tích lũy thêm request khi dịch chậm.
- Đổi chiều bằng Enter hủy bob2/bob5 và xóa notes; payload Anh→Việt và
  Việt→Anh đúng ngôn ngữ đối phương→viewer. Lỗi504 giữ original.
- Thêm Carol không hủy Bob. Hidden tab hủy Bob+Carol, recorder0/pending0;
  hiện tab tiếp tục. Lỗi403 dừng mọi nguồn và giữ original đã nhận.
- Đổi phiên đóng bảng/xóa notes; logout hủy request, recorder0/pending0,
  fixture kết thúc errors=[].

[Original mới khi dịch cũ còn chờ](./assets/2026-10-17-translation-progressive/originals-while-translation-pending.png)
· [Snapshot concurrent originals](./assets/2026-10-17-translation-progressive/concurrent-originals.txt)
· [Timeout giữ original](./assets/2026-10-17-translation-progressive/timeout-keeps-original.png)
· [Hidden cleanup](./assets/2026-10-17-translation-progressive/hidden-cleanup.txt)
· [Snapshot cuối](./assets/2026-10-17-translation-progressive/browser-checks.txt).
Đã quan sát panel ở viewport desktop1280×900 và mobile390×844, dark/light;
các nhãn/nguyên văn/bản dịch nằm trong panel.
[Dark](./assets/2026-10-17-translation-progressive/final-dark.png) ·
[Light](./assets/2026-10-17-translation-progressive/final-light.png) ·
[Mobile](./assets/2026-10-17-translation-progressive/final-mobile.png).
Đây là fixture chức năng và spot-check layout, chưa là ma trận theme/mobile đầy đủ
hoặc thiết bị thật. Tab fixture và Vite5177 đã đóng/dừng; files thử ở `.tmp/`
ngoài source sản phẩm. Viewport override đã reset sau kiểm tra.

## Giới hạn và nghiệm thu tiếp

Đây vẫn là ASR theo clip, không nhận dạng từng từ trong lúc clip đang ghi.
Độ trễ chữ gốc gồm chờ clip và STT; bản dịch cần thêm thời gian Qwen.
Chưa có cam kết1–2s hoặc benchmark p50/p95 trên bản này. Clip2s có thể giảm
ngữ cảnh; chưa đo độ chính xác tiếng Việt/tên riêng hoặc nhiều người nói.
Khi quá tải/timeout client bỏ clip, không hứa transcript đầy đủ.
Tách slot cho phép STT/dịch chồng thời gian nhưng vẫn là ASR từng clip độc lập;
nhiều nguồn vẫn cạnh tranh một slot/model, bản dịch có thể bị bỏ khi slot bận.

`docker compose ps` ở mốc kiểm tra cuối lỗi thiếu pipe dockerDesktopLinuxEngine;
không rebuild/apply runtime hoặc chạy model smoke mới. Các kết quả code/fixture
trên không chứng minh Compose đang chạy bản mới, mic/WebRTC thật, GPU hoặc1–2s.

Audio đối phương vẫn đi tới backend/AI; không persist clip/note MongoDB.
Consent/retention/logging, WebRTC hai thiết bị, GPU và tải nhiều nguồn vẫn
thuộc QS-Q01/Q02/Q03; các gate đó chưa Done. Không commit/push/deploy.
