# QS-AI01 — triển khai công cụ fine-tune và chuẩn bị dữ liệu

Snapshot triển khai ban đầu và các lần nhập nhãn bên dưới được giữ làm lịch sử.
**Kết quả mới nhất:**13/13nhãn đã xác nhận, pilotCUDA đã chạy; xem
[pilot VIVOS](./2026-11-02-whisper-vivos-pilot.md) để biết trạng thái/metrics hiện tại.

Ngày: 2026-11-02 (Asia/Saigon). Liên quan FR-23/AC-21, Q01/Q03.
**Trạng thái: In Progress.** Công cụ đã kiểm chứng phạm vi dưới đây; chưa train bằng
giọng người dùng, chưa nghiệm thu chất lượng/GPU/GGML/cuộc gọi hay triển khai model mới.

## Yêu cầu và quyết định

Người dùng yêu cầu triển khai fine-tune từ model đang dùng, giữ bằng chứng để viết báo cáo
và cập nhật tài liệu; cung cấp `DEMO VERCEL.mp3`, xác nhận giọng của chính mình, tiếng Việt,
chưa có lời chép và cần giữ thuật ngữ như Vercel/commit.

Repo mặc định `base-q5_1` qua whisper.cpp. Huấn luyện dùng checkpoint đa ngôn ngữ
`openai/whisper-base`, LoRA r8/alpha16/dropout0.05; không sửa trực tiếp file GGML.
Chi tiết workflow/schema/metrics/export gate ở [protocol](../whisper-finetuning.md).

Không đưa lời Whisper tự nhận dạng thành nhãn đúng. Một bản thu một người chưa đủ
protocol tách người nói độc lập; không chia cùng giọng thành ba ID để vượt audit.

## Triển khai

- `ai-service/training/evidence.py`: audit manifest, WAV monoPCM16/16kHz, nguồn/quyền,
  checksum file/PCM, speaker/audio leakage và corpus WER/CER với normalization đã khai báo.
- `finetune.py`, `config.base-lora.json`: audit → baseline → train LoRA → merge →
  đánh giá; mỗi run có config, source snapshot/hash, packages/GPU/git, revision model,
  labels/audio snapshot private, loss, metrics/predictions, checkpoints và trạng thái lỗi.
- `prepare_audio.py`: decode MP3 local, downmix/resample, chia audio để rà nhãn;
  converter CSV→JSONL từ chối nhãn thiếu/draft chưa reviewed và không ghi đè.
- `draft_transcript.py`: tạo draft local bằng Whisper base, giữ cột `text` trống.
- `test_evidence.py`, `smoke_training.py`: regression và một bước LoRA trên âm tổng hợp.
- `.gitignore`: bỏ data/runs/venv; không đổi inference dependencies/Compose/model runtime.

## Môi trường và dữ liệu thực tế

- `nvidia-smi`: GTX1650SUPER, 4096MiB; snapshot trước chạy còn2701MiB trống.
  Đây không phải peak VRAM của train. Docker Engine không kết nối được trong lượt này;
  không khởi động lại hoặc recreate service để làm kiểm chứng offline.
- Python bundled3.12.14; môi trường kiểm chứng riêng `training/.venv-check`:
  torch2.6.0+cpu, transformers4.57.1, peft0.17.1, accelerate1.10.1,
  numpy2.5.4, soundfile0.13.1, scipy1.18.1. Run lưu đủ packages thực cài.
- File nguồn4,165,323bytes, stereo44100Hz, **257.973696s**, chuyển thành13clip
  monoPCM16/16kHz, cửa sổ20s (đoạn cuối ngắn hơn); không ghi đè file gốc.
- Draft tiếng Việt tạo local13/13đoạn, **0 đoạn được người dùng xác nhận**.
  Revision model: `e37978b90ca9030d5170a5c07aadb050351a65bb`.
- `training/data/demo-vercel-unlabelled/` giữ `preparation.json` (checksum nguồn/clip),
  annotations gốc, annotations.owner.csv có nguồn/quyền người dùng khai báo,
  `annotations.draft.v2.csv`, provenance và `REVIEW-TRANSCRIPT.md` để nghe/rà.
  V1 giữ lịch sử; V2 thêm attention_mask rõ ràng. Không public raw transcript.
- Cửa sổ cố định có thể cắt giữa câu, cần rà/cắt lại trước gán nhãn.

## Commands và kết quả

Các lệnh dưới đây chạy tại root, `$checkPython` là
`ai-service/training/.venv-check/Scripts/python.exe`.

| Check thực chạy | Kết quả / phạm vi |
| --- | --- |
| `& $checkPython -m unittest discover -s ai-service/training -p 'test_*.py' -v` | **14/14 pass**, leakage/duplicate PCM, metrics, dữ liệu thiếu, draft gate, chống overwrite và failed-run evidence |
| `& $checkPython ai-service/training/prepare_audio.py audio <MP3 người dùng> ai-service/training/data/demo-vercel-unlabelled` | exit0,13clip; chưa có nhãn chuẩn |
| `& $checkPython ai-service/training/draft_transcript.py ai-service/training/data/demo-vercel-unlabelled/annotations.owner.csv --language vi --output ai-service/training/data/demo-vercel-unlabelled/annotations.draft.v2.csv` | exit0,13/13draft, source audio local |
| `& $checkPython ai-service/training/smoke_training.py` | exit0, checkpoint base thật, một bước CPU LoRA trên3tone tổng hợp; lưu adapter, merge và đánh giá trước/sau |
| `python -m compileall -q <6 script training>` | pass syntax, không thay kiểm chứng GPU |
| `git diff --check` | pass; không xác nhận training quality |
| `git check-ignore <data CSV> <runs> <venv python>` | cả3được ignore |

Model đã cache trước kiểm chứng cuối; chạy smoke/draftV2 với `HF_HUB_OFFLINE=1`,
HF_HOME trong `.cache/huggingface`, không cần gửi audio ra ngoài. Train không push Hub,
report_to=[]; credential/env thật không đọc hoặc lưu vào evidence.

Raw output kiểm tra (không chứa transcript người dùng):

- [Regression output](./assets/2026-11-02-whisper-finetune/unit-tests.txt).
- [CPU smoke cuối](./assets/2026-11-02-whisper-finetune/cpu-smoke-current.txt).
- [Integrity/model reload](./assets/2026-11-02-whisper-finetune/smoke-integrity.json).

Run smoke cuối `20261102T112141Z-e2c93419`, purpose=smoke. Các WER/CER từ tone và
nhãn giả chỉ kiểm tra đường tính metrics; **không dùng làm kết quả nhận dạng đồ án**.
Thời gian train một bước trên tone không dùng để dự báo thời gian train bộ thật.

## Lỗi/giới hạn giữ lại

- Lượt unit đầu bị Windows sandbox chặn thư mục temp mặc định. Tests chuyển scratch
  sang `training/runs` trong workspace;14/14pass sau sửa. Không phải lỗi thuật toán.
- Cài dependency lần đầu bị DNS trong sandbox; cài vào venv kiểm chứng riêng qua quyền
  network được cho phép. Không dùng môi trường CPU này làm bằng chứng CUDA.
- Lượt offline đầu gọi model_info cần mạng: fail, status/error evidence giữ tại
  `runs/20261102T111840Z-1e398257`. Đã đổi sang snapshot_download để resolve revision
  từ cache; smoke/draft offline sau sửa exit0.
- Bổ sung attention_mask và truyền suppress_tokens/begin_suppress_tokens rõ ràng
  cho cả baseline/tuned, tránh thay cấu hình giải mã khi save/merge.
- PEFT cảnh báo không tìm config gốc qua Hub ở offline, giả định vocabulary không đổi;
  vocabulary thực tế không được mở rộng. Transformers cảnh báo chuyển các generation
  fields khi save; các trường suppression dùng trong phép so sánh được truyền tường minh.
- Chưa xác nhận phiên bản converter/GGML export, giảm lỗi thuật ngữ, chất lượng dịch,
  chất lượng Việt/Anh/Trung, peak VRAM train hay mic/WebRTC. Không chạy lại client/server
  suites vì không sửa source/UI/API inference.
- Data/runs ignored **chưa được sao lưu ra nơi khác**. Giữ run private và backup có
  kiểm soát; Git không lưu các file này.

## Việc tiếp theo

1. Người dùng nghe13đoạn, sửa `text`, đánh reviewed; kiểm tra từ kỹ thuật và cắt câu.
2. Bổ sung bản thu/người nói cho validation/test độc lập; chốt phạm vi nghiên cứu.
3. Audit, chuẩn bị torchCUDA tương thích và chạy pilot đo VRAM trước train thật.
4. Train/so sánh có dữ liệu chuẩn, phân tích lỗi và lập bảng/biểu đồ từ số đo thực.
5. Export/quantize đối chứng cùngQ5_1 và kiểm chứng serving/cuộc gọi trước đổi runtime.

Working tree chưa commit/push/deploy. File Word lock đã bị xóa từ trước lượt làm việc
được giữ nguyên trạng thái; không chỉnh sửa các Word/PDF người dùng cung cấp.

## Bổ sung — nhận lời chép người dùng chỉnh sửa, 2026-11-02

Người dùng thông báo đã sửa lời chép trong `REVIEW-TRANSCRIPT.md`. Đã nhập cả13đoạn
sang CSV mới `annotations.corrected.20261102T124121Z-40bc95.csv` trong thư mục data
private;13/13khác draftV2. Không sửa Markdown, CSV nháp hoặc audio nguồn.

Đã lưu snapshot Markdown và CSV gốc cùng checksum/provenance vào
`data/demo-vercel-unlabelled/review-imports/20261102T124121Z-40bc95/`.
ID/thời gian cả13đoạn khớp CSV, đủ audio, giữ một speaker và split trống.
`latest-corrections.json` chỉ tới bản nhập mới nhất.

Các checkbox nghe/rà vẫn0/13;8đoạn còn dấu `...`/`…`, một đoạn có cách viết
`Vercek` cần đối chiếu. Dấu ba chấm không tự là lỗi: có thể là lời bị cắt cuối clip;
cần nghe để xác định nhãn khớp audio, không tự thêm/bỏ lời hoặc đổi thuật ngữ hàng loạt.
Vì vậy status CSV là `edited_pending_clip_review`, không tự nâng thành reviewed.

Chưa tạo manifest hoặc train bằng các nhãn này. Tiếp theo: rà khớp từng đoạn, thống nhất
thuật ngữ theo lời nói, sau đó bổ sung dữ liệu/tập đánh giá độc lập theo protocol.
Nếu chọn mục tiêu cá nhân hóa một giọng, cần chốt protocol phiên thu độc lập thay vì
khẳng định đánh giá người nói mới. Đây là lựa chọn thiết kế nghiên cứu, không phải
yêu cầu chung mọi phương pháp fine-tune phải có nhiều người nói.

[Thống kê import đã loại transcript](./assets/2026-11-02-whisper-finetune/corrections-import.json).
