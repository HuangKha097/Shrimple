# Sửa quá tải dịch local — 2026-10-17

QS-I23 / FR-23; đo local trên Docker Desktop x86_64, 4 vCPU, CPU host i3-1115G4.
Không coi đây là nghiệm thu realtime nhiều người, chất lượng dịch hoặc WebRTC.

## Nguyên nhân và lựa chọn

Hai model ban đầu đều healthy, không restart nhưng có POST /translate trả504.
Chỉ lấy metadata thời gian/status từ log, không đọc chữ nhận dạng hoặc note
cuộc gọi. Whisper medium q5_0 trên CPU xử lý chậm hơn nhịp clip6s; Qwen1.7B
cũng chậm khi có tải. Mỗi browser giữ hàng chờ nhỏ nhưng nhiều browser/source
vẫn có thể đẩy nhiều request vào model server. UI trước đó đóng cả bảng sau
một lỗi timeout, dù có thể tiếp tục với clip mới.

Người dùng đã chọn model nhỏ để ưu tiên tốc độ local. Đã áp dụng:

- `compose.yaml`: Whisper base-q5_1 đa ngôn ngữ, Qwen3-0.6B-GGUF Q8_0;
  WHISPER_MODEL/QWEN_MODEL cho phép chọn lại medium-q5_0/1.7B. Không xóa cache cũ.
- `start.sh`: allowlist base/medium, SHA-256 theo model và URL revision cố định.
  Base59,707,625bytes, SHA256
  `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898`;
  đã đối chiếu metadata kho chính thức và hash file tải thực. Qwen mới639,446,688bytes.
- CPU mặc định2 thread/model, Qwen batch2 và --poll0; có thể override
  WHISPER_THREADS/QWEN_THREADS. GPU Compose và CUDA image giữ medium/4threads;
  chưa build/chạy GPU trong lượt này.
- FastAPI tính audio_ctx theo WAV duration+1s đệm, min128/max1500;
  giữ beam3. Không xử lý cửa sổ30s cho mọi clip ngắn. Clip15s vẫn giữ toàn bộ
  WAV và đủ context, decoder/MIME/size/deadline/key không thay contract cũ.
- FastAPI một slot inference/tiến trình, acquire không chờ; đang bận trả429
  `detail.status=busy`, release trong finally kể cả timeout. Silence bypass giữ
  trước inference. Uvicorn hiện chạy một process theo CMD hiện có.
- Express giữ429 thành JSON `{status:"busy", message:...}` sau JWT/session/
  viewer/speaker checks. Không trả nội dung lỗi inference riêng tư.
- TranslationNotes bỏ clip429/504/client timeout, giữ bảng và notes, tiếp tục
  clip mới nhất. 401/403 vẫn dừng theo flow cũ; queue tối đa1 pending/source,
  cleanup và tối đa50 notes giữ nguyên. Không che cảnh báo đã bỏ clip.

Đã rebuild/recreate các service local có thay đổi; không đổi khóa, không ghi
clip/note vào DB, không xóa volume. README/Design/Plan/PRD/Summary/ticket đồng bộ.

## Số đo thực

Audio thử là 6 giây đầu [jfk.wav của whisper.cpp v1.9.4](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/samples/jfk.wav),
chuẩn hóa trong RAM; không dùng audio cuộc gọi. Các lượt khác thời điểm/tải nền,
không phải thống kê p95 hoặc SLA. Thời gian HTTP dưới đây chưa tính 6 giây ghi âm.

| Cấu hình / bước | Kết quả lượt đo |
| --- | --- |
| Medium, full context, beam3, 4threads — chỉ STT | 45.92s, HTTP200, nhận dạng được mẫu |
| Medium, context350, beam3 — thử chẩn đoán | 10.49s, HTTP200; không chuyển mặc định sang greedy |
| Base, full context — chỉ STT | 8.16s |
| Base, context theo duration, 4threads — chỉ STT | 3.91s |
| Model nhỏ nhưng chưa admission/tune threads — toàn HTTP | 60.92s HTTP200 trong một lượt có tải; lời gọi text tiếp theo timeout, không coi chọn model nhỏ là đã đủ |
| Bản cuối, hai request HTTP đồng thời | Một HTTP200 trong10.96s; một429/busy trong0.18s, không xếp hàng model |
| Bản cuối, audio en → vi đã làm nóng | HTTP200 trong6.67s, original55chars/translated62chars |
| Bản cuối, audio en → en (bypass Qwen) | HTTP200 trong3.02s |
| Bản cuối, câu text vi → en | 1.50s; “Tối nay chúng ta họp lúc tám giờ.” → “Tonight we meet at eight o'clock.” |

Lượt HTTP200 đầu của bản cuối trả283chars dịch; lượt sau62chars. Chỉ xác nhận
pipeline trả kết quả, chưa chấm độ chính xác/độ bám sát câu với model nhỏ.
[JSON số đo cuối](./assets/2026-10-17-translation-speed/final-results.jsonl).

## Kiểm tra

| Kiểm tra thực chạy | Kết quả / giới hạn |
| --- | --- |
| FastAPI/FFmpeg `python -m unittest -v test_app` trong Linux, network none, source readonly | 20/20 PASS; thêm audio context không cắt clip15s, busy không gọi model và slot dùng lại sau timeout; đa số model được mock |
| `node --test server/tests/translationRoute.test.js` với MongoMemoryServer cache, runtime download=false | 9/9 PASS; JWT, accepted direct/group viewer+speaker, stale session, abort, 429 JSON và không lộ upstream detail |
| ESLint riêng TranslationNotes + node --check route | PASS |
| Client production build sau sửa cuối | PASS,3507modules,49.77s; còn dynamic/static import và chunk>500kB warnings |
| Compose config CPU và ghép GPU --quiet | PASS; chỉ parse GPU, không chạy GPU |
| Image CPU/AI/backend/frontend build và local up | PASS; compile/install cũ CACHED; cả5service Up, Whisper/Qwen healthy ở lần xác nhận cuối |
| Startup WHISPER_MODEL không hỗ trợ, network none | Exit1 trước network/model load; đúng mong đợi |
| Browser fixture trên component thật, HTTP/MediaRecorder giả lập | PASS: Alice1→Alice3 bỏ2 khi backlog đầy; note sau504 tiếp tục;429 rồi504 vẫn trả note clip tiếp; 403 dừng recorder; hidden abort, đổi phiên đóng/reset;0 fresh console errors |
| Fixture cleanup | Server riêng5174 đã dừng; file thử được archive dưới .tmp ngoài client, không có fixture trong frontend image |

Fixture đầu và fixture cuối là các lượt riêng. Không gọi fixture là test mic,
WebRTC hai thiết bị hoặc test độ chính xác model. [Timeout proof](./assets/2026-10-17-translation-speed/timeout-recovery.png),
[busy+timeout proof](./assets/2026-10-17-translation-speed/busy-recovery.png),
[AX snapshot cuối](./assets/2026-10-17-translation-speed/browser-checks.txt).
Scripts benchmark/fixture ở `.tmp/translation-latency/` (ignored).

FastAPI TestClient còn deprecation warning từ Starlette/httpx. Không đổi
dependency ngoài phạm vi để tắt warning. Có lệnh kiểm tra ban đầu chạy sai cwd
và đã chạy lại đúng root; không tính các lỗi đường dẫn là lỗi ứng dụng.

## Giới hạn và cách dùng

Mở lại localhost:5173, reload và bắt đầu cuộc gọi mới sau khi backend được
recreate. Model nhỏ giảm độ chính xác; chưa thử STT tiếng Việt với audio thật,
chưa đo nhiều browser/người nói. Clip6s cộng6.67s xử lý vẫn có độ trễ; CPU local
không đảm bảo theo kịp mọi clip. Khi bận hoặc timeout, app bỏ đoạn và tiếp tục,
không hứa transcript đầy đủ. Cảnh báo này có thể vẫn xuất hiện đúng thiết kế.

Giữ quyền JWT/session/member/creator, key backend và chính sách không lưu DB.
QS-Q01/Q02/Q03 chưa Done. Các thay đổi chưa commit/push/deploy.
