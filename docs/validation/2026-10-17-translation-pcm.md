# Audio PCM liên tục và Silero VAD — 2026-10-17

QS-I23 / FR-23; tiếp nối [progressive HTTP](./2026-10-17-translation-progressive.md).
Phạm vi yêu cầu: PCM mono16kHz qua socket theo gói100–200ms, nhận dạng lời
đối phương lên note trước, placeholder `Translating...`, dịch phía dưới đến sau;
Silero VAD có đệm đầu câu. Kế hoạch: [PCM streaming](../../plans/261017-pcm-streaming/plan.md).

## Mốc kiểm chứng ban đầu

- Working tree có sẵn thay đổi progressive HTTP, model nhỏ và Compose; được giữ.
- Tải model Silero ONNX v6.2 từ commit chính thức
  `be95df9152c0d7618fa1edfeb296fc3dae32376f`, đường dẫn upstream
  `src/silero_vad/data/silero_vad.onnx`; bundle tại
  `ai-service/models/silero-vad-v6.2.onnx` cùng MIT license.
- Model2,327,524bytes; SHA256
  `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`.
- ONNX CPU smoke thực: input float32[1,576], gồm context64+frame512;
  state float32[2,1,128], sr int64scalar16000. Output state đúng shape.
- Venv kiểm thử cài NumPy2.5.4, ONNX Runtime1.31.0, websockets15.0.1;
  không cài Torch. Không đọc/in giá trị `.env` hoặc dùng audio cuộc gọi.

## VAD CPU trên mẫu công khai

Nguồn: [jfk.wav của whisper.cpp v1.9.4](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/samples/jfk.wav),
352,078bytes, mono16kHz PCM16. Script/probe trong `.tmp/pcm-streaming/`,
không phải source sản phẩm; session CPU có intra/inter-op threads1.

| Mẫu / phép đo | Kết quả lượt đo |
| --- | --- |
| Im lặng2s | 62khung512samples; 0khung có xác suất>=0.5; max0.00891 |
| Audio công khai | 343khung; 233khung có xác suất>=0.5; max0.999963 |
| VAD inference trên audio mẫu | p50≈0.151ms, p95≈0.338ms/khung32ms |

Đây chỉ là lượt đo VAD, không phải benchmark ASR/dịch hay phân loại chính xác
toàn bộ giọng nói/ngôn ngữ. Không cộng/trừ các số này để tuyên bố latency1–2s.

## Triển khai và kiểm tra

Contract hiện hành ở [Design](../design.md#note-dịch-pcm-hiện-tại).
Source chính: `TranslationNotes.jsx`, `translationPcmWorklet.js`,
`translationPcmCapture.js`, `translationPcmSocket.js`, `translationNotesState.js`;
`server/src/socket/translationPcm.js`; `ai-service/pcm_stream.py`, `pcm_vad.py`.

| Kiểm tra | Kết quả / phạm vi |
| --- | --- |
| `npm --prefix client test` | 41/41: tracker8, legacy17, PCM/capture/socket/reducer/self-speech16 |
| `npm --prefix client run lint` | 0errors,3warnings có sẵn: CallModal2, TreeQR1 |
| `npm --prefix client run build` | PASS; worklet xuất thành asset; còn mixed import/chunk warnings |
| `npm --prefix server test` | 73/73 trên source cuối (gồm self-speech `translate:false`); MongoDB tạm, AI WebSocket giả lập |
| `python -m unittest discover -s ai-service -p test_*.py -v` | 58/58: HTTP/CT2/compute_profile33 + PCM/VAD/self-speech25; ONNX thực |
| Python `pip check`, syntax/import | PASS |
| `docker compose up -d --build whisper ai backend frontend` | PASS, gồm pip check, Silero VAD và CTranslate2 INT8 MarianMT (`en-vi`, `vi-en`) |
| Review độc lập | Hai P2 đã sửa, reviewer kiểm lại không còn finding trong hai bản sửa |

Server dùng cache `server/node_modules/.cache/mongodb-memory-server`,
`MONGOMS_RUNTIME_DOWNLOAD=false`; không dùng DB ứng dụng. Một lượt thử ban đầu
dùng sai cache đã dừng; lượt cuối không tải lại khi cache đã sẵn. Test fixture PCM dùng
startup timeout60s vì dưới tải CPU default10s từng hết hạn; production timeout
không đổi. Python test dùng shim FFmpeg tại `.tmp/translation-check/tools` cho
các test HTTP cũ; PCM regression chặn decoder để chứng minh không gọi FFmpeg.

Review bắt được: partial đã nhận dạng xong bị bỏ khi final vừa vào hàng chờ;
sửa cho partial hiện trước khi final inference hoàn tất. Regression barrier
kiểm tra thứ tự revision1→final2→translation2. Lỗi thứ hai là thay stream có
thể bỏ đếm Mongo lookup chưa xong; reservation nay giữ đến resolve/reject dù
stop/replace/disconnect. Với capacity1,100start lặp chỉ tạo1lookup.

## Trình duyệt và audio graph thực

Fixture local dùng component sản phẩm, AudioContext48kHz và oscillator thành
remote MediaStream; không xin mic và không dùng audio cuộc gọi. Socket/health/
transcript/translation được giả lập ở lớp giao tiếp; đây là bằng chứng UI/audio
graph, không phải nhận dạng giọng nói trong trình duyệt.

- `conversationTranslationSources` thu nhận cả luồng của người dùng (`isSelf=true`, gửi `translate:false`, chỉ hiển thị văn bản gốc) và luồng của đối phương (`isSelf=false`, hiển thị văn bản gốc + `Translating...` cho tới khi bản dịch về).
- AudioWorklet thực gửi2048samples/4096bytes,128ms; quan sát1820gói,0lỗi seq,
  không lỗi console do fixture ghi nhận. Unit test thêm44.1kHz/48kHz.
- Partial→final sửa cùng note; `Translating...` giữ đến bản dịch đúng revision.
  Gói PCM tiếp tục tăng trong lúc placeholder đang hiện.
- Hai hướng en→vi/vi→en cho đúng nhãn và payload; sự kiện stream cũ bị bỏ.
- Hidden dọn capture/event listener; visible/reconnect mở ID mới. Disconnect
  dừng audio, đổi session đóng panel/xóa note, logout dọn toàn bộ listener.
- Fake socket không mô phỏng server tự xóa stream khi disconnect nên một ID
  còn trong sổ fixture; không còn gói gửi/listener. Server cleanup disconnect
  được kiểm riêng bằng Socket.IO thực trong suite73bài.

Bằng chứng: [chữ gốc chờ dịch](./assets/2026-10-17-translation-pcm/partial-translating.png),
[Anh→Việt](./assets/2026-10-17-translation-pcm/translated-en-vi.png),
[Việt→Anh](./assets/2026-10-17-translation-pcm/translated-vi-en.png),
[cleanup](./assets/2026-10-17-translation-pcm/cleanup.png),
[thống kê fixture](./assets/2026-10-17-translation-pcm/browser-stats.json).
Tab/Vite fixture được dọn sau kiểm tra; không thay phiên đăng nhập của người dùng.

## Live PCM với model local (trước và sau tối ưu Whisper greedy + CTranslate2 INT8 MarianMT)

Docker CPU mặc định trên máy `i3-1115G4` (2 cores / 4 threads, không có NVIDIA CUDA, `compute_profile` = `cpu_only_50_50` chia 2 threads ASR / 2 threads VAD+MT): Whisper `base-q5_1` (`--max-context 0 --no-fallback --beam-size 1 --best-of 1`, `temperature=0.0`, `temperature_inc=0.0`), dịch hai chiều bằng CTranslate2 INT8 MarianMT (`dekthedev/opus-mt-en-vi-ct2-int8` và `dekthedev/opus-mt-vi-en-ct2-int8` tại `/models/ct2`, kiểm tra SHA-256), Silero ONNX CPU 1 thread. Mẫu công khai 2s tại `ai-service/testdata/jfk-2s.wav`, thêm 256ms silence đầu và silence đuôi; gửi đúng nhịp 128ms.

| Sự kiện, tính từ lúc bắt đầu gửi PCM | Trước tối ưu (Whisper beam3 + Qwen3-0.6B) | Sau tối ưu (Whisper greedy + CTranslate2 INT8) | Luồng tự nói (`translate: false`) |
| --- | --- | --- | --- |
| Original partial 1 (tại ~768ms audio) | 4467ms | **1092ms** (+324ms sau gói audio) | **1100ms** |
| Original partial 2 (tại ~1280ms audio) | — | **1659ms** (+379ms sau gói audio) | **1631ms** |
| Original final (tại ~1792ms endpoint) | 7437ms | **2179ms** (+387ms sau endpoint) | **2182ms** (kết thúc, không dịch) |
| Bản dịch (`en -> vi`) | 16779ms (+9342ms sau final) | **2252ms** (**+73ms** sau final) | Không gọi dịch |

Thời gian dịch văn bản độc lập với CTranslate2 INT8 MarianMT trên CPU sau khi warm: ~35–135ms/câu cho cả hai chiều `en -> vi` và `vi -> en`.

## Giới hạn còn mở

Chưa đo trực tiếp trên phần cứng NVIDIA/CUDA thật (nhánh `cpu_gpu_50_50` được kiểm bằng unit test và `compose.gpu.yaml`), chưa đo p50/p95 nhiều speaker đồng thời, memory/load dài hạn hoặc WebRTC hai thiết bị thật. HTTP upload cũ được giữ để tương thích. Consent/retention/logging và QA model thuộc QS-Q01/Q02/Q03; không coi lần này là nghiệm thu production. Working tree chưa commit.
