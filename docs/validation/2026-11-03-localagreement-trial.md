# Thử cửa sổ trượt và LocalAgreement — 2026-11-03

**Snapshot lịch sử đã kết thúc.** Sau khi người dùng chốt giữ model và dọn file,
source nhánh thử/overlay/test riêng đã được gỡ. Nội dung triển khai và30tests
bên dưới mô tả lúc đo, không phải chức năng hoặc test suite còn bật.
[Trạng thái source và tài liệu hiện hành](./2026-11-03-translation-finalization.md).

FR-23 / QS-I23 / QS-AI01 / Q01/Q03. Theo yêu cầu người dùng, đã chạy thử
LocalAgreement-2 qua AI WebSocket với VAD, PhoWhisper và MarianMT thật.
**Chưa chọn làm mặc định**: tổng sáu đoạn Việt dài có WER24,37%, cao hơn
segmented23,78%; CER cũng cao hơn. Giữ PhoWhisper-base cho vi, Whisper-base cho en
và luồng segmented đang dùng. Không thêm checkpoint ASR thứ ba hoặc fine-tune.

## Cách triển khai thử

- `pcm_agreement.py`: ring audio có giới hạn, cửa sổ Việt tối đa12s, Anh tối đa6s;
  bắt đầu giải mã từ3s, nhịp mục tiêu640ms. Capture tiếp tục trong khi ASR chạy,
  các lần cập nhật được gộp thay vì tạo một công việc cho mỗi packet.
- `Agreement`: chỉ chốt tiền tố trùng giữa hai giả thuyết liên tiếp có audio mới,
  đối chiếu cả nội dung và mốc âm thanh. Giữ đuôi chưa chắc chắn và phần âm thanh
  làm ngữ cảnh khi trượt. Không xóa từ lặp bằng regex hoặc chỉ dựa vào text.
- PhoWhisper trả decoder timestamps không phù hợp trên một số cửa sổ ngắn:
  segment có thể kết thúc ở30s dù audio6s. Parser từ chối mốc ngoài audio; không
  clamp hoặc tự phân phối thời gian theo số chữ.
- Nhánh Việt thử thêm DTW `base`, tắt flash attention, giữ full encoder context.
  Đây là preset alignment thử nghiệm trên cùng weights PhoWhisper. `t_dtw` dùng
  đơn vị10ms; xem [whisper.cpp v1.9.4](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/include/whisper.h).
  Mốc hợp lệ không tự chứng minh alignment đúng từng từ.
- Nhóm BPE thành đơn vị từ nhất quán giữa các lần giải mã; không chốt một phần
  nhóm từ chung mốc DTW. Nhận diện phần context đã chốt bằng nhiều từ và vị trí
  âm thanh; giữ nguyên câu/từ được nói lặp lại ở thời điểm sau.
- `pcm_incremental.py`: chỉ đưa phần đã ổn định sang MT; gom tới dấu kết câu,
  khoảng4s lời đã xác nhận hoặc khi quiet đã được đồng thuận. Đuôi chưa ổn định
  chỉ làm preview. Revision/utterance, lane, deadline, queue và cancellation giữ
  contract hiện có; overflow báo lỗi recoverable, không âm thầm bỏ chữ.
- Nghỉ800ms là tín hiệu hỗ trợ, không tự xác nhận một giả thuyết. Ring Việt18s,
  Anh12s; không tích âm thanh vô hạn khi ASR không tiến triển.

## Đối chiếu tiếng Việt dài

Sáu audio ViMD **validation** có sẵn, mỗi đoạn20–30s, tổng151,052s tiếng nói,
513 đơn vị tham chiếu. Mỗi nhóm có Bắc/Trung/Nam. Nhóm đầu dùng kiểm lỗi và điều
chỉnh thuật toán; nhóm sau chọn mẫu hợp lệ tiếp theo, khác speaker của nhóm đầu.
Đây không phải held-out test hoặc bản ghi cuộc gọi người dùng.

Phát PCM16kHz mono theo thời gian thực, cùng thứ tự/audio và khoảng nghỉ cho hai
phương án. Baseline: full-context text + segmented trên GPU. Candidate v4:
full-context timestamps + DTW + cửa sổ12s + LA-2 trên GPU. So sánh cả pipeline;
không quy riêng mọi thay đổi WER cho thuật toán LA vì profile alignment cũng đổi.

| Bộ mẫu | Phương án | WER | CER | Final / MT | Error / status |
| --- | --- | ---: | ---: | ---: | ---: |
| Ba đoạn đầu | Segmented | 20,74% | 15,33% | 22/22 | 0/0 |
| Ba đoạn đầu | LocalAgreement v4 | 20,37% | 17,47% | 14/14 | 0/0 |
| Ba đoạn mới | Segmented | 27,16% | 20,72% | 16/16 | 0/0 |
| Ba đoạn mới | LocalAgreement v4 | 28,81% | 22,93% | 12/12 | 0/3 |
| Tổng sáu đoạn | Segmented | **23,78%** | **17,90%** | 38/38 | 0/0 |
| Tổng sáu đoạn | LocalAgreement v4 | 24,37% | 20,08% | 26/26 | 0/3 |

Ba status503 của v4 là chờ giả thuyết ổn định, sau đó có final/translation;
không có event error429 hoặc mất cặp revision trong hai replay v4. Ít final hơn
phản ánh gom cụm lớn hơn, không tự chứng minh dịch đúng nghĩa hơn. Không chấm MT
bằng bộ tham chiếu dịch hoặc người nghe trong phép thử này.

Các bản bị loại trên ba mẫu đầu: decoder timestamps/cửa sổ6s WER97,04% và
10error429; DTW v2/6s WER61,11% và4error429; DTW v3/12s WER30,00% và1error429.
v4 hết overflow trên các mẫu đã đo nhưng chưa cải thiện độ chính xác tổng thể.
Không lấy việc unit tests pass để chọn bản có WER/CER kém hơn.

Chuẩn hóa NFC, casefold, punctuation→space, gộp whitespace; CER bỏ khoảng trắng.
WER/CER tổng là tổng edit chia tổng reference, không trung bình các phần trăm.
[Số liệu](./assets/2026-11-03-localagreement-trial/benchmark-summary.json) và
[hash audio/source, cấu hình](./assets/2026-11-03-localagreement-trial/integrity.json).
Không export audio, reference text, transcript hoặc event chứa lời nói vào docs.

## Kiểm chứng và runtime

- AI regression **30/30 pass**, gồm từ lặp thật, timestamp jitter, DTW invalid,
  không chốt nửa nhóm cùng mốc, input tiếp tục khi ASR bận, cancellation và
  self-transcription không dịch. Không sửa client/server/socket contract.
  [Checks](./assets/2026-11-03-localagreement-trial/checks.json).
- Compose overlay `config --quiet`, PowerShell parser, shell `sh -n` sau chuẩn
  hóa CRLF như Dockerfile và `git diff --check` pass. Text pipe PowerShell thô
  ban đầu gây lỗi CRLF ở shell; kiểm lại đúng dạng image build đã pass.
- LocalAgreement Anh→Việt: hai câu SAPI tổng hợp,8,32s PCM gồm silence, WER/CER0%,
  2final/2translation, revision khớp, không error/status. Chỉ là smoke test ngắn.
- Thử nghiệm chạy ở cổng nội bộ riêng trong AI container và ASR DTW container
  tạm. Không bật `stable_prefix` cho luồng chính. Đã dừng các tiến trình/container
  thử sau khi đo. Không build lại toàn bộ CUDA binary hoặc thay weights.
- Trong lúc đo, AI bị dừng và hai ASR bị tạo lại bằng CPU image; chưa xác định
  nguồn thao tác. Theo xác nhận người dùng, đã chạy
  `.\ai-service\start-gpu.ps1 -SkipBuild`, khôi phục hai ASR GPU/healthy và AI
  HTTP200/ready. AI không có Docker healthcheck; kiểm qua HTTP thật.
  Không dùng lần replay Anh thất bại readiness503 lúc này làm kết quả ASR.
- Sau khôi phục, replay hai chiều **đồng thời** trên luồng chính: mỗi chiều đủ
  3final/3translation, revision khớp, không event error. Việt WER2,04% trên hai
  mẫu VIVOS ngắn; Anh WER0% trên hai câu tổng hợp. Có status429 partial đã phục
  hồi: Việt1, Anh2. [Runtime đã khôi phục](./assets/2026-11-03-localagreement-trial/runtime-restored.json).

Harness `training/replay_pcm_runtime.py` có `--url` để so cổng thử với8001;
tắt WebSocket compression giống bridge backend. Mặc định chỉ lưu summary,
`--save-events` mới ghi event của dataset vào cache riêng. Không dùng cờ đó để
ghi cuộc gọi thật. Một lần thu gom JSON rộng bị auto-review chặn; chỉ export
allowlist số liệu tổng hợp, không tiếp tục đọc/copy event riêng tư.

## Trạng thái sau khi chốt

Đã gỡ overlay, cờ LocalAgreement/DTW và hai module thử khỏi source theo yêu cầu
dọn file. Không còn lệnh bật nhánh này. Phép đo lịch sử dùng ASR DTW chạy trực tiếp
với cùng binary v1.9.4 và source tạm; full Compose activation chưa từng được kiểm.
Giữ toàn bộ số liệu/hashes ở assets để đối chiếu quyết định chọn segmented.

Kiểm unit từ root khi đã có dependencies:

```powershell
$env:PYTHONPATH = 'ai-service'
python -m unittest discover -s ai-service/tests -v
```

Giữ segmented và hai model hiện tại; không tiếp tục đổi/train model trong scope
đã chốt. Chưa nghiệm thu mic/WebRTC/thiết bị,
nói nhiều phút hoặc tải nhiều người; Q01/Q03 và QS-AI01 giữ trạng thái hiện có.
Working tree chưa commit, không push/deploy cloud. Tài liệu Word cập nhật quyết
định giữ segmented và kết quả loại nhánh thử, không mô tả nó là runtime chính.
