# Rà soát dịch audio — 2026-10-17

Ngày: 2026-10-17, Asia/Saigon. Phạm vi QS-I23 / FR-23, BR-19/20, AC-21;
liên quan phần QA của QS-Q01/Q02/Q03. Working tree ban đầu sạch. Không
commit/push/merge/deploy, không dùng DB ứng dụng hoặc audio của người dùng.

## Luồng được giữ

Browser tách clip6s theo từng nguồn mic local/remote → REST/JWT Express →
kiểm tra viewer + speaker trong phiên đã accepted/phòng gọi → FastAPI →
WAV mono16kHz trong RAM → whisper.cpp medium multilingual q5_0 → text gốc →
Qwen3-1.7B GGUF Q8_0, enable_thinking=false → text dịch en/vi. Cấu hình này
chưa dùng Qwen3.5. UI chọn chiều vi/en, API hỗ trợ source=auto.

Whisper chạy tiến trình riêng, model-cache volume giữ model; không load model
mỗi clip. Qwen model cũng ở service riêng. Mỗi nguồn có một request đang chạy
và tối đa một clip chờ; khi đầy bỏ clip chờ cũ, không bỏ người nói khác.
Không có Mongoose write cho clip/note: notes tối đa50 entries ở state client.

Đối chiếu API với [source whisper-server v1.9.4](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/examples/server/server.cpp)
và [model card Qwen3 GGUF chính thức](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF).
Đây là đối chiếu contract; chưa chứng minh output từ model thực tế.

## Lỗi và thay đổi

| Vấn đề | Sửa / source |
| --- | --- |
| Compose bắt buộc ai-service/.env nhưng file chưa có | Thêm `ai-service/init-env.ps1` tạo khóa32byte ngẫu nhiên, không in/ghi đè. Compose nạp ai-service/.env vào cả backend/ai, sau server/.env; đã tạo file local ignored và kiểm tra idempotent |
| Thiếu khóa FastAPI lại mở truy cập | `app.py` trả503 khi thiếu cấu hình,401 khi sai/thiếu header; constant-time key comparison |
| Caller tự emit answerCall để mở quyền dịch | `socket.js` lưu initiatorId và chỉ người nhận có thể accept. Regression trước sửa nhận200, sau sửa403 |
| Clip đang xử lý được trả sau khi end, hoặc lọt sang call mới cùng peer | Proxy giữ reference phiên nội bộ; kiểm tra lại trước khi forward và khi trả kết quả. Regression đổi call cùng peer trước sửa200, sau sửa403 |
| MIME chưa được kiểm tra; lỗi Multer chưa trả JSON; request không body gây500 | Proxy giới hạn webm/mp4/wav, giữ max2MiB; invalid/thiếu body400, oversize413 JSON; AI kiểm tra bytes qua FFmpeg và thời lượng <=15s. Regression request không body trước sửa500, sau sửa400 |
| FFmpeg giải mã chỉ để đo silence rồi Whisper lại convert file | Decode một lần, dựng WAV trong RAM; Whisper không bật --convert. Compose AI `/tmp` là tmpfs cho multipart tạm |
| STT70s + Qwen65s có thể vượt proxy90s; output64tokens dễ bị cắt | Hai bước dùng thời gian còn lại trong ngân sách80s, giới hạn connect/write/pool; proxy90s và client95s giữ nguyên. Qwen max256tokens và từ chối finish_reason=length; timeout504 |
| Đóng kết nối browser nhưng proxy vẫn chờ AI | Response close abort fetch tới FastAPI; request đã hủy không tiếp tục trả lỗi lên connection đóng |
| Notes còn khi props đổi phiên; lỗi403 bị gọi là hết đăng nhập | Component reset theo kind/session/user/active; giữ401 riêng. Tab hidden dừng recorder/hủy request, hiện tab tiếp tục nếu còn mở |

Proxy abort đóng HTTP request; FastAPI hiện dùng sync worker, nên inference đã
vào worker có thể tiếp tục tới timeout của nó. Không hứa hủy tính toán GPU ngay
lập tức. Tất cả clip/note vẫn không persist DB. Giới hạn15s server cho phép
độ lệch lịch recorder của browser; clip mục tiêu vẫn6s.

## Kiểm tra thực chạy

| Check | Kết quả | Giới hạn |
| --- | --- | --- |
| `ai-service/init-env.ps1`, chạy lại lần2 | PASS: tạo mới rồi giữ nguyên file đã có | Không đọc/in giá trị khóa; file local ignored |
| `docker compose config --quiet` | PASS | Chỉ parse/validate Compose, không kiểm tra engine/GPU/model |
| `npm --prefix server test` | PASS **30/30** | 20 groups/poll/friend +9 translation REST +1 translation session; MongoMemoryServer cache; AI HTTP giả lập |
| Python unittest discover trong ai-service | PASS **18/18**, không skip trong lần cuối | 16 tests FastAPI/contracts +2 FFmpeg thực; Whisper/Qwen HTTP mocks |
| `npm --prefix client run lint` | PASS **0 errors /3 warnings** | Warnings có sẵn ở CallModal và TreeQRCodeModal |
| `npm --prefix client run build` | PASS **3507 modules** | Còn mixed authStore import và chunk >500kB |
| `node --check` route/socket đã sửa | PASS | Syntax, không thay test quyền |
| `git diff --check` | PASS | Có cảnh báo chuyển LF→CRLF, không có whitespace error |
| Browser fixture với component thật | PASS các tình huống dưới đây | Streams/MediaRecorder/timer/AI giả lập; không mic/WebRTC thật |

Server test dùng MONGOMS_DOWNLOAD_DIR trỏ
`server/node_modules/.cache/mongodb-memory-server`, MONGOMS_RUNTIME_DOWNLOAD=false.
Không cần MongoDB thật. Test proxy dùng AI HTTP server chỉ trên máy kiểm thử.

Python: tạo `ai-service/.venv`, cài requirements hiện có; chạy:

```powershell
.\ai-service\.venv\Scripts\python.exe -m unittest discover -s ai-service -p 'test_*.py' -v
```

Hai tests FFmpeg được skip nếu máy không có FFmpeg trên PATH. Lần kiểm tra này
dùng binary FFmpeg của imageio-ffmpeg0.6.0 cài riêng trong venv, đưa bản sao vào
`.tmp/translation-check/tools/ffmpeg.exe` và thêm thư mục đó vào PATH của process
test. Không thêm dependency sản phẩm. Đã decode WAV6s thật và từ chối bytes giả
audio; chưa dùng bản ghi giọng nói. TestClient có StarletteDeprecationWarning
với httpx; tests vẫn pass, không sửa dependency ngoài phạm vi.

## Browser fixture

Dùng component `TranslationNotes` thật trên Vite port5176; api.get/post,
MediaStream, MediaRecorder và timer6s được giả lập. Không xin quyền microphone.
Hai user giả alice/bob, không gọi API ứng dụng thật. Fixture đã chuyển ra
`.tmp/translation-check/browser/` và dừng Vite sau khi thử để không ảnh hưởng lint.

- Mở Mic dịch tạo hai recorder độc lập.
- Gửi alice-1/bob-1 song song; thêm alice-2 rồi alice-3 khi alice-1 đang chạy.
  Cảnh báo bỏ clip hiện; hoàn tất alice-1 chỉ gửi tiếp alice-3.
- Hiện note kèm tên người nói, original và translated từ response giả.
- Hide tab: recorder0, abort alice-3, không còn request; Show tab tạo lại hai recorder.
- Đổi session đóng bảng; mở lại hiển thị danh sách note trống, không note phiên trước.
- Response403 hiện đúng “Bạn không còn tham gia cuộc gọi này”, không báo hết đăng nhập.
- Logout: recorder0 và request0, bảng đóng. Fixture stats cuối errors=[];
  log trước explicit reload có một cảnh báo duplicate createRoot do HMR sửa harness.

[Ảnh hàng chờ](./assets/2026-10-17-translation/queue.png) ·
[Kết quả browser](./assets/2026-10-17-translation/browser-checks.json).
Không xác nhận light/dark/mobile đầy đủ chỉ bằng fixture này; CSS hiện hữu
không đổi. Screenshot là dữ liệu giả, không phải bằng chứng dịch giọng nói thật.

## Chưa kiểm chứng / việc tiếp theo

Docker CLI/Compose có sẵn nhưng `docker info` và `docker ps` ngoài sandbox trả
**500 Internal Server Error** từ Docker Desktop Linux Engine. Không chạy
`compose up --build`, không tải model, không chạy live `test:ai`. Không tìm thấy
nvidia-smi trên PATH; không kết luận máy có/không GPU chỉ từ kết quả này.

Sau khi Docker Desktop Linux Engine hoạt động, chạy hướng dẫn trong
[README](../../README.md#chạy-dịch-thuật-cục-bộ). Compose mặc định cần NVIDIA GPU;
máy CPU dùng hướng dẫn đổi Dockerfile/reservation trong README. Sau đó mới
kiểm tra readiness, `test:ai`, audio en/vi/auto có giọng nói thực, độ trễ khi nhiều
người nói và WebRTC giữa hai browser. Chất lượng model, consent/retention/logging
và QA thiết bị của Q01/Q02/Q03 vẫn mở; không đánh dấu production/release Done.

Tài liệu đồng bộ: README, PRD, Design, Plan, Kanban và Codebase Summary. Source,
tests và evidence còn trong working tree **chưa commit**.
