# Sửa giải mã và kết quả nhận dạng lặp — 2026-10-18

QS-I23 / FR-23 / AC-21. Tiếp nối
[khảo sát model](./2026-10-18-translation-quality.md); yêu cầu lần này là sửa
giải mã và xử lý output lặp bất thường, giữ tốc độ/capture realtime hiện tại.

## Thay đổi

- `ai-service/app.py`: cho Whisper sinh timestamp tokens để có điểm kết thúc
  lời nói (`no_timestamps=false`), tắt căn chỉnh từng token. Nhánh bình thường
  giữ beam1, adaptive audio context và model đang chạy.
- `abnormal_recognition` kiểm tra output trước khi trả original: giới hạn8192chars;
  chuỗi tuần hoàn dài có mật độ từ/syllable vượt mức bảo thủ; segment lặp có
  thời gian chồng nhau/không đủ độ dài; segment sinh ngoài audio thực.
- Ngưỡng tuần hoàn: >max(16,ceil(duration*12)) từ/syllable; chu kỳ1–32,
  >=4lần lặp và span>=16tokens/>=nửa output. Kiểm tra timestamp bổ sung bắt
  segment nằm hoàn toàn ngoài audio hoặc đoạn đuôi dài bất hợp lý. Đây là
  heuristic, chưa có tỷ lệ false positive từ bộ audio Việt thực.
- Không cắt chuỗi thành một câu đoán. Partial bất thường không retry, không phát
  text đó, chỉ báo503/chờ snapshot mới. Final/HTTP được retry tối đa1lần với
  đúng audio/ngôn ngữ, full context (`audio_ctx=0`) + beam3 trong deadline cũ.
- Retry vẫn bất thường hoặc rỗng:422. PCM chỉ kết thúc utterance lỗi, giữ original
  hợp lệ trước đó, không gọi dịch cho text bị chặn, tiếp tục câu mới. Đóng stream
  ngăn retry mới; không nhả lock khi inference sync chưa kết thúc.
- Backend lọc nội dung lỗi422, UI hiện cảnh báo đoạn chưa rõ và cho người dùng
  nói lại, kể cả khi chưa có original. Đã cập nhật nhãn vi/en/zh.

Giữ model base/MarianMT/Qwen, cấu hình CPU/GPU, cổng, khóa, JWT/session/member
checks, packet128ms, VAD, giới hạn queue, quyền sở hữu track và revision protocol.
Không thêm thư viện, không sửa API DTO, không commit/push/deploy cloud.

## Kiểm tra source cuối

| Lệnh/kiểm tra | Kết quả thực |
| --- | --- |
| AI `python -m unittest discover -s . -p 'test_*.py'` trong image AI, bind source readonly, network none | **69/69 PASS**; Silero/FFmpeg thực, HTTP model mocks |
| `npm --prefix server test` | **74/74 PASS**; MongoDB tạm8.2.6, AI WebSocket giả lập |
| `npm --prefix client test` | **42/42 PASS**, gồm giữ partial hợp lệ khi422 và câu tiếp theo hoàn tất |
| `npm --prefix client run lint` | 0errors/3warnings tại CallModal/TreeQRCodeModal, ngoài source sửa |
| `npm --prefix client run build` | PASS,3512modules; dynamic/static import và chunk>500kB warnings |
| `node --check server/src/socket/translationPcm.js`, diff/link/JSON checks | PASS |
| `docker compose build ai backend frontend` | PASS |
| `docker compose up -d --no-deps ai backend frontend` | Đã recreate3container local; Whisper/Qwen không restart |

Regression mới kiểm tra: vòng lặp en/vi44lần; retry không reset ngân sách;
partial không retry; retry vẫn lỗi/rỗng không tạo guessed transcript; ngừng retry
khi stream đóng; lặp có chủ ý được giữ; segment overlap/đuôi ngoài audio;
HTTP JSON/NDJSON không chuyển text lặp sang dịch; PCM422 không dừng câu tiếp
theo; bridge lọc lỗi riêng tư và giữ audio; reducer không nhận lại kết quả cũ.

Môi trường ban đầu thiếu dev dependency server và `qrcode.react` client đã khai
báo. Đã dùng `npm ci --include=dev --ignore-scripts` ở server và
`npm ci --ignore-scripts` ở client theo lockfile; package/lock không đổi.
Lượt server đầu tải MongoDB gặp tranh chấp lock giữa các suite. Lượt thành công
chỉ định `MONGOMS_SYSTEM_BINARY=.tmp/mongodb-binaries/mongod-x64-win32-8.2.6.exe`
và `MONGOMS_RUNTIME_DOWNLOAD=false`; không dùng database thật. AI TestClient còn
Starlette/httpx deprecation warning. Không thay dependency để tắt warning.

## Kiểm tra model thực

Source sửa được bind readonly vào container thử cùng dependency image AI,
kết nối tới Whisper base CPU local đang chạy. FFmpeg flite/slt tổng hợp các câu
trong RAM,16kHz mono PCM16 và320ms silence đuôi; không audio người dùng.

| Mẫu | Kết quả | Thời gian HTTP/model local |
| --- | --- | --- |
| Can you hear me? nói1lần | Đúng1câu,1request beam1 |315ms |
| What is happening? nói1lần | Đúng1câu,1request beam1 |285ms |
| The meeting starts at eight tonight. | Guard chặn đuôi bất thường, retry full context/beam3; ra1câu nhưng vẫn nghe nhầm `8 to 9` |3295ms,2requests |
| Can you hear me. Can you hear me | Giữ đủ2lần có chủ ý,1request |379ms |

[Trace từng request](./assets/2026-10-18-translation-repetition-fix/live-direct.jsonl).
Các số là một lượt/mẫu, không SLA/p50/p95; retry làm câu khó chậm hơn.
Chống lặp không thay thế model có chất lượng nhận dạng/dịch tốt hơn.

Thử PCM/VAD thật theo nhịp128ms với mẫu công khai `ai-service/testdata/jfk-2s.wav`,
256ms silence đầu và silence đuôi. Original partial1162ms, partial tiếp1662ms,
final2212ms; cùng utterance/revision1→3, không error/lặp. Dùng `translate:false`
để đo riêng ASR; không thử mic/WebRTC/network hai thiết bị.
[Trace PCM](./assets/2026-10-18-translation-repetition-fix/live-pcm.jsonl),
[script](./assets/2026-10-18-translation-repetition-fix/live_check.py).

## Xác nhận sau khi áp dụng local

- Frontend5173 HTTP200; module TranslationNotes đang phục vụ handler422 mới.
- Backend5001 translation health chưa đăng nhập trả401 như thiết kế.
- AI8001 `/health?mode=pcm` có auth nội bộ trả200/ready; không in khóa.
- Hash `app.py`/`pcm_stream.py` bên trong container khớp source workspace.
- Endpoint AI `/translate` streaming với audio tổng hợp `Can you hear me?` trả
  HTTP200 trong536ms: transcript đúng1câu, sau đó translation
  `Anh có nghe tôi nói không?` qua model dịch thật.
- Các container ứng dụng Up; Whisper/Qwen healthy. Các container QtmShrimple
  khác giữ nguyên. Không còn container thử model từ đợt khảo sát.

[HTTP trace](./assets/2026-10-18-translation-repetition-fix/live-http.jsonl),
[checks và source hashes](./assets/2026-10-18-translation-repetition-fix/checks.json).

## Giới hạn và bước tiếp theo

Q01/Q03 còn mở: chưa có audio tiếng Việt thực/echo/noise, đo false positive hoặc
tải nhiều speaker, GPU benchmark và WebRTC hai thiết bị/browser thật. UI422 đã
kiểm tra reducer/transport và mã đang phục vụ; chưa visual walkthrough panel với
hai người gọi. Sai từ/ngữ nghĩa trong khảo sát model vẫn là gap riêng. Không
tuyên bố chữa mọi hallucination hoặc bản dịch sai. Sau recreate backend, reload
trang và bắt đầu cuộc gọi mới để thử; stream cũ không replay audio. Working tree
chưa commit.
