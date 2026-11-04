# Fine-tune Whisper base và lưu bằng chứng đồ án

Cập nhật 2026-11-02. Ticket **QS-AI01**, liên quan FR-23/AC-21.
Trạng thái: bộ công cụ local; chưa có model fine-tune được nghiệm thu hoặc triển khai.

**Cập nhật tiếp 2026-11-02:** người dùng chốt mục tiêu nhiều người dùng, xác nhận13/13nhãn.
Đã chuẩn bị pilot VIVOS tách người nói và chạy40bước LoRA trên CUDA; xem
[kết quả pilot](./validation/2026-11-02-whisper-vivos-pilot.md). Đây chưa là nghiệm thu
model phục vụ ứng dụng; các phần thiếu dữ liệu ở dưới mô tả gate chung/lịch sử.

**Sau phân tích train/validation:** đã có developmentv2 (train2,150câu/43người,
validation60câu giữ nguyên), bốn `config.dev-*.json` và scope không đọc test.
[Phân tích, cách chạy và giới hạn](./validation/2026-11-02-whisper-train-validation-analysis.md).
Chưa chạy vòng nghiên cứu600steps; không gọi việc chuẩn bị này là cải thiện chất lượng.

**Thực thi2026-11-03:** đã hoàn thành4/4config,600steps/lượt; xem
[report/kết quả](./validation/2026-11-03-whisper-development.md). Lowercase WER29.82%
tốt nhất trong fine-tune nhưng vẫn kém base27.92%, giữ runtime, chưa mở test cuối.
Các mô tả "chưa chạy" ngày2026-11-02 ở trên là trạng thái lịch sử.

**Nghiên cứu dữ liệu/vùng giọng2026-11-03:** đã có [catalog và benchmark protocol](./vietnamese-accent-benchmark.md),
baseline VietMed và mẫu ViMD valid ba vùng. Chưa mở test cuối, chưa train nguồn mới;
dữ liệu lớn không tự bảo đảm cải thiện. [Evidence](./validation/2026-11-03-accent-benchmark.md).

**Theo yêu cầu train tiếp cùng ngày:** đã tách official ViMD train ba vùng + VIVOS
replay,576train/284người, giữ150validation/93người; đã hoàn thành600steps từ base gốc.
Không tái dùng validation làm train. [Vòng accent training](./validation/2026-11-03-whisper-accent-training.md)
là trạng thái mới; câu "chưa train nguồn mới" phía trên mô tả vòng benchmark trước đó.
ViMD WER53,56→46,86%, VIVOS27,92→28,68%; chưa thay serving vì kết quả còn khác nhau
theo corpus và các gate GGML/ngôn ngữ/cuộc gọi chưa khép.

## 1. Mục tiêu và ranh giới

- Tinh chỉnh **`openai/whisper-base` đa ngôn ngữ**, dùng LoRA q_proj/v_proj.
- Mục tiêu nghiên cứu: đo thay đổi lỗi nhận dạng tiếng Việt trong hội thoại kỹ thuật,
  đặc biệt tên sản phẩm/thuật ngữ như Vercel, commit. Không tự dịch các từ trong nhãn ASR.
- Whisper nhận dạng; MarianMT/Qwen vẫn dịch văn bản. Train ASR không train bước dịch.
- `ggml-base-q5_1.bin` hiện dùng để inference không phải checkpoint đầu vào train.
- Không thay runtime, API, quyền phiên gọi hoặc Compose khi chưa có model và kiểm chứng.
- Không gọi LoRA/kết hợp model là thuật toán mới do nhóm phát minh. Đóng góp phải
  mô tả đúng dữ liệu, cách thực nghiệm, lựa chọn cấu hình và kết quả thực đo.

## 2. Môi trường tách biệt

Nguồn code: `ai-service/training/`. `requirements.txt` ở đây độc lập với inference.
Python 3.12; cài torch tương thích driver/CUDA theo hướng dẫn PyTorch, rồi các dependency
đã pin Transformers/PEFT/Accelerate. Chạy từ root repo, ví dụ khi có Python trên PATH:

```powershell
python -m venv ai-service/training/.venv
$trainPython = '.\ai-service\training\.venv\Scripts\python.exe'
# Cài torch theo lựa chọn CUDA trên pytorch.org trước lệnh bên dưới.
& $trainPython -m pip install -r ai-service/training/requirements.txt
& $trainPython -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

`training/.venv-check` dùng riêng cho kiểm chứng CPU tại máy này; không phải môi trường
CUDA sẵn sàng train. Không dùng Python alias WindowsApps bị lỗi. Có thể dùng executable
Python đã cài thực tế để tạo venv. Không cài torch vào image FastAPI/Whisper đang chạy.

GTX1650SUPER 4GiB/RAM16GiB: LoRA fp32, batch1, accumulation8 và gradient checkpointing
là **cấu hình thử**, không bảo đảm vừa VRAM hoặc có chất lượng tốt. Mặc định100steps chỉ
là pilot, không phải số bước tối ưu. Chưa có kết quả GPU train để ước lượng thời gian.

## 3. Chuẩn bị dữ liệu và lời chép

```powershell
& $trainPython ai-service/training/prepare_audio.py audio 'C:\duong-dan\audio.mp3' ai-service/training/data/bo-du-lieu
& $trainPython ai-service/training/draft_transcript.py ai-service/training/data/bo-du-lieu/annotations.csv --language vi
```

- `prepare_audio.py` downmix, resample polyphase và xuất WAV monoPCM16/16kHz;
  chia cửa sổ20s không overlap. Giữ file gốc; từ chối ghi đè thư mục output.
- `preparation.json` ghi checksum nguồn/clip, thông số và phiên bản thư viện.
- `annotations.csv` để trống nhãn. `annotations.draft.csv` có `draft_text`, nhưng
  `text` vẫn trống và `review_status=unreviewed`; draft **không phải ground truth**.
- Nghe từng clip, sửa `draft_text` và điền lời chép đúng vào `text`; nếu chuyển từ file
  draft, đặt `review_status=reviewed` cho từng dòng đã nghe/sửa. Giữ Vercel/commit
  theo ngữ cảnh thực nói; không sửa câu thành nội dung người nói không nói.
- Rà clip bị cắt giữa câu, im lặng, lời của nhiều người; cắt/gán lại hoặc loại bỏ.
  Không lấy đoạn20s bị cắt từ làm nhãn sai để tăng số mẫu.
- Điền `speaker_id` ổn định, `language`, `source`, `permission`, `split`.
  Dùng mã người nói, không cần họ tên thật. Xác nhận quyền sử dụng các giọng khác nếu có.
- `source`/`permission` là khai báo, công cụ không xác minh tính pháp lý.
- Không chuyển bản nháp chưa rà sang manifest; không dùng chính model gán nhãn rồi
  coi kết quả train trên nhãn đó là bằng chứng mô hình nghe đúng hơn.

Mỗi dòng manifest JSONL bắt buộc có các chuỗi không rỗng:

```json
{"id":"sample-001","audio":"clip-0000.wav","text":"Tôi sẽ commit lên Vercel.","speaker_id":"speaker-001","split":"train","language":"vi","source":"nguồn dữ liệu đã xác định","permission":"quyền sử dụng đã xác nhận"}
```

Đây là ví dụ schema, không phải lời chép thực tế của file người dùng.

```powershell
& $trainPython ai-service/training/prepare_audio.py manifest ai-service/training/data/bo-du-lieu/annotations.csv ai-service/training/data/bo-du-lieu/manifest.jsonl
& $trainPython ai-service/training/finetune.py audit --manifest ai-service/training/data/bo-du-lieu/manifest.jsonl
```

Manifest đặt cạnh CSV để giữ đường dẫn tương đối. Audit bắt buộc có train/validation/test,
không trùng speaker_id giữa các tập, không trùng bytes file hoặc PCM, WAV đúng chuẩn,
0<duration<=30s. Không phát hiện cùng người bị đổi ID hoặc audio gần trùng.
**Không đổi mã cùng một người để vượt gate.** Một giọng trong một bản thu chưa đủ cho
protocol đánh giá người nói độc lập này. Nếu chọn nghiên cứu cá nhân hóa giọng, phải
thiết kế protocol theo phiên thu riêng và ghi rõ mục tiêu trước khi thay gate.

## 4. Chạy thí nghiệm

```powershell
& $trainPython ai-service/training/finetune.py train --manifest ai-service/training/data/bo-du-lieu/manifest.jsonl --config ai-service/training/config.base-lora.json
```

Mặc định yêu cầu CUDA; `--device cpu` dành cho kiểm chứng hoặc chạy CPU chủ động.
`--purpose smoke` đánh dấu kiểm chứng đường chạy, không phải nghiên cứu chất lượng.
Model tải từ Hugging Face; audio và nhãn được xử lý local, không upload Hub/W&B.

Quy trình: audit → chốt revision model thành commitSHA → baseline test/validation →
train LoRA, theo dõi validation loss → lưu adapter → merge → tuned validation/test.
Không dùng test để chọn checkpoint; bản cuối sau số bước đã khai báo được đánh giá.
Không tiếp tục chỉnh cấu hình dựa vào test nhiều lần rồi coi test đó vẫn độc lập.
Muốn tái lập, dùng resolved_revision từ model-source.json thay cho `main`.

WER/CER là tổng edit-distance / tổng số đơn vị tham chiếu, phần trăm có thể >100.
Chuẩn hóa NFC, casefold, đổi dấu câu thành khoảng trắng, gộp whitespace; CER bỏ spaces.
WER tiếng Việt ở đây tính trên đơn vị tách bằng khoảng trắng, không dùng bộ tách từ.
Giữ cả prediction thô để phân tích lỗi; điểm tổng hợp không thay đánh giá thuật ngữ.
Kết quả theo từng ngôn ngữ nằm trong metrics; nếu dữ liệu chỉ có vi, chưa kết luận en/zh.
Thời gian generate không gồm feature extraction/network/WebRTC và chưa loại warmup.
Seed được lưu nhưng không bảo đảm bitwise deterministic trên mọi GPU/phiên bản.

Kiểm chứng công cụ với checkpoint thật và âm tổng hợp (không phải nghiên cứu):

```powershell
& $trainPython -m unittest discover -s ai-service/training -p 'test_*.py' -v
& $trainPython ai-service/training/smoke_training.py
```

Smoke chạy CPU một bước, tạo dữ liệu riêng được đánh dấu `synthetic`/`purpose=smoke`.
Không trộn các metrics này vào bảng kết quả nhận dạng tiếng nói của đồ án.

## 5. Bằng chứng phải giữ

Mỗi lần chạy có thư mục `training/runs/<UTC>-<random>/`, không ghi đè lần trước:

| Artifact | Dùng trong báo cáo |
| --- | --- |
| status.json | phân biệt audit_passed/failed/interrupted/experiment_completed và purpose |
| environment.json, source-sha256.json | Python/packages, GPU/driver, git HEAD+dirty state, checksum scripts |
| config.json, model-source.json, generation.json | hyperparameters, revision model, giải mã |
| dataset-summary.json, dataset-snapshot.private.json | thống kê tập, checksum audio, phiên bản nhãn/nguồn/quyền |
| trainer-events.jsonl, train-metrics.json, checkpoints/trainer_state.json | loss theo step, train/eval và trạng thái checkpoint |
| baseline/tuned-*-metrics.json | WER/CER tổng và từng ngôn ngữ, thời gian inference |
| *-predictions.private.json | câu tham chiếu/dự đoán để phân tích lỗi; không public nguyên văn |
| comparison.json | chênh lệch WER theo điểm phần trăm, VRAM peak, giới hạn |
| adapter/, merged/ | adapter và checkpoint đã merge để xuất model |
| error.private.txt, artifacts-sha256.json | lỗi lần chạy và checksum artifacts kể cả khi thất bại |

Data/runs/venv được `.gitignore`; **Git ignore không phải backup**. Sao lưu riêng các
run cần giữ vào nơi riêng tư có kiểm soát truy cập. Chỉ sao chép số liệu/biểu đồ và
ví dụ đã rà quyền riêng tư sang `docs/validation/`; không commit audio, raw transcript,
model hay môi trường chứa secrets. Không tự động đọc/lưu `.env` hoặc token.
Tránh dùng `--runs` ngoài thư mục ignored, trừ khi đã bố trí lưu trữ riêng tư tương đương.

## 6. Tích hợp lại whisper.cpp: gate chưa khép

1. Giữ bản base làm đối chứng và bản fine-tune riêng. Không ghi đè cache base hiện tại.
2. Dùng converter của whisper.cpp phù hợp phiên bản để đổi `merged/` sang GGML;
   nếu dùng LoRA phải merge trước, không đưa trực tiếp adapter vào whisper-server.
3. Quantize cả đối chứng và fine-tune cùng Q5_1; lưu version converter, commands,
   checksum và kết quả. Chạy đối chiếu qua chính whisper-server.
4. Đánh giá lại Việt/Anh/Trung, thuật ngữ và cuộc gọi thật để phát hiện suy giảm.
5. Chỉ thêm custom model path/checksum vào loader và bật model mới sau gate này.
   `start.sh` hiện chỉ chấp nhận hai model chính thức cùng checksum, chưa nhận custom.

Không suy kết quả GGML/Q5/WebRTC từ phép so sánh HF fp32. Không gắn Done cho model
fine-tune chỉ vì train kết thúc hoặc tests công cụ pass.

## 7. Nguồn phương pháp

### Pilot nhiều người dùng đã chốt

`prepare_vivos.py` tải archive chính thức VIVOS (hoặc mirror chính chủ AILAB), so MD5
Zenodo, lưu SHA256, không chạy loading script từ dataset. Chỉ đọc metadata và WAV,
không extractall/path tùy ý. Chia seed42:8người train,3người validation lấy từ original
train;3người test lấy từ original test. Mỗi người tối đa20câu hợp lệ đầu tiên theo
thứ tự archive. Audit lại sau tạo manifest; đây là pilot nhỏ, không đại diện toàn bộ VIVOS.

```powershell
& $trainPython ai-service/training/prepare_vivos.py --archive ai-service/training/data/vivos-source/vivos.tar.gz --output ai-service/training/data/vivos-pilot-v1 --download --mirror
& $trainPython ai-service/training/finetune.py train --manifest ai-service/training/data/vivos-pilot-v1/manifest.jsonl --config ai-service/training/config.pilot-vivos.json --device cuda
```

Output đã tồn tại thì không ghi đè. Với mô hình sau train, `evaluate_reviewed.py` so
base/tuned trên CSV reviewed riêng, chặn trùng speaker/audio với train. Bản thu người
dùng nằm ngoài train VIVOS; đây vẫn chỉ là diagnostic một người, không thay tập test.
`plot_pilot.py` xuất biểu đồ từ run/diagnostic JSON thực tế; cần matplotlib (đã cài trong
`.venv-check` để tạo báo cáo, không thêm vào inference container).

VIVOS do AILAB công bố cho học thuật, giấy phép CC BY-NC-SA4.0; giữ attribution,
nguồn và điều kiện khi dùng/chia sẻ. Pilot/model này chưa được duyệt triển khai thương mại.
VIVOS là giọng đọc câu trong môi trường yên tĩnh; chưa thay đánh giá hội thoại, vùng miền
hoặc âm thanh nhiễu. Chưa xác định trùng dữ liệu pretraining của Whisper.

- [VIVOS chính thức — Zenodo, nguồn/giấy phép/citation](https://zenodo.org/records/7068130).
- [Kho của tác giả AILAB–VNUHCM](https://huggingface.co/datasets/AILAB-VNUHCM/vivos).

- [Whisper base model card](https://huggingface.co/openai/whisper-base).
- [Whisper Transformers 4.57.1](https://huggingface.co/docs/transformers/v4.57.1/en/model_doc/whisper).
- [PEFT / LoRA](https://huggingface.co/docs/peft/index).
- [Converter Hugging Face → GGML](https://github.com/ggml-org/whisper.cpp/blob/master/models/convert-h5-to-ggml.py).
- [PyTorch installation](https://pytorch.org/get-started/locally/).
- [Bằng chứng triển khai](./validation/2026-11-02-whisper-finetuning.md).
