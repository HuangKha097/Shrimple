# PhoWhisper và phạm vi dịch Anh ↔ Việt

Ngày 2026-11-03, Asia/Saigon. Người dùng yêu cầu thử PhoWhisper và chỉ giữ
Anh → Việt / Việt → Anh. Sau khi xem kết quả tiếng Anh, người dùng xác nhận dùng
**PhoWhisper-base cho tiếng Việt, Whisper-base cho tiếng Anh**. Đây là quyết định
mới thay phương án một checkpoint chung trước đây; không có model tự train nào
được đưa vào serving trong đợt này.

## Kết quả thực đo

Đo ASR bằng Hugging Face fp32 trên CUDA, torch 2.6.0+cu124, transformers 4.57.1,
Python 3.12.14. Cả hai checkpoint dùng cùng audio/reference và greedy generation:
`task=transcribe`, ngôn ngữ khóa, `num_beams=1`, `do_sample=false`, tối đa 225 token.
Không huấn luyện, sửa nhãn hoặc mở reserved test.

Nguồn mô hình: [VinAI PhoWhisper](https://github.com/VinAIResearch/PhoWhisper),
[checkpoint chính thức](https://huggingface.co/vinai/PhoWhisper-base).

| Dữ liệu | Whisper-base WER / CER | PhoWhisper-base WER / CER |
| --- | ---: | ---: |
| ViMD validation: 90 đoạn, 90 speaker, 30 đoạn mỗi miền | 53.56% / 38.43% | 20.45% / 14.59% |
| Bắc | 45.87% / 32.83% | 15.45% / 11.44% |
| Trung | 64.98% / 46.17% | 22.90% / 15.14% |
| Nam | 50.59% / 36.74% | 22.68% / 16.87% |
| Tiếng Anh: 5 câu Windows SAPI tổng hợp, 38 từ tham chiếu | 7.89% / 2.31% | 136.84% / 81.50% |

WER là tỷ lệ edit trên từ tham chiếu, có thể vượt 100% khi chèn nhiều từ.
PhoWhisper giảm 33.11 điểm phần trăm WER trên mẫu ViMD này. Đây là dữ liệu đọc/tin
tức, chưa là mic cuộc gọi, giọng nặng hoặc nhiễu. Chưa biết độ trùng với dữ liệu
pretraining/fine-tuning upstream. Tiếng Anh chỉ là smoke test tổng hợp rất nhỏ,
đủ phát hiện vấn đề dùng PhoWhisper thay toàn bộ, chưa là benchmark tiếng Anh.

Giữ nguyên output chạm cap để tính điểm: Whisper-base 7/90, PhoWhisper-base 3/90.
Thời gian vòng inference ViMD lần lượt 112.48s / 111.00s, gồm xử lý feature,
generation và ghi predictions; không phải latency mỗi câu hoặc SLA cuộc gọi.
Base khớp kết quả diagnostic ViMD trước đây trên cùng manifest.

[Kết quả Việt](./assets/2026-11-03-phowhisper/vimd-summary.json),
[smoke Anh](./assets/2026-11-03-phowhisper/english-summary.json),
[model/export](./assets/2026-11-03-phowhisper/export.json),
[integrity](./assets/2026-11-03-phowhisper/integrity.json).
Audio/reference/predictions giữ trong ignored `ai-service/training/runs/` và data;
không đưa vào Git hoặc upload tới Hub. Tóm tắt public chỉ có metrics và hash.

## Hành vi và cấu hình mới

- `app.py`: nguồn `vi` → `PHOWHISPER_CPP_URL`, nguồn `en` → `WHISPER_CPP_URL`.
  Cả HTTP, PCM segmented và LocalAgreement dùng cùng hàm chọn ASR. Không fallback
  sang checkpoint khác khi lỗi; giữ bounded retry/422, lane/queue và timeout.
- Compose thêm `phowhisper`, dùng cùng image whisper.cpp v1.9.4 với service
  `whisper`. Checkpoint VinAI khóa revision
  `7ebdb9e88f5cc5271fb88f4d642c82ff9388650e`, export GGML f16 147,951,482 byte,
  SHA256 `d2d55964ba390fdbd32642a36555961df7fe3a171c41c841e4257f46a157c367`.
  Weights/checksum mount read-only. Script từ chối model thiếu hoặc checksum sai.
- `compose.gpu.yaml`: cả hai ASR dùng NVIDIA; ASR lane chung chỉ chạy một job mỗi
  lúc. VAD/MarianMT CT2/Qwen fallback giữ CPU. Chưa đo VRAM/latency cấu hình hai
  checkpoint GGML cùng nạp. Health yêu cầu cả hai ASR; Qwen vẫn phục vụ fallback
  en↔vi và health HTTP như trước.
- UI chỉ hai lựa chọn vi/en và đảo chiều; locale UI zh mặc định en→vi.
  HTTP/Socket.IO/AI từ chối zh/Auto, chỉ dịch en→vi hoặc vi→en.
  Self PCM vẫn nhận B/B với `translate:false`, bridge vẫn kiểm viewer=speaker.
  Quyền JWT/member/session, attendance pinning và cleanup không đổi.
- Giữ i18n vi/en/zh của toàn app. Không xóa asset/model cũ, dữ liệu train,
  checkpoint, volume cache hoặc các thay đổi có sẵn trong working tree.

## Chạy lại và áp dụng

Từ root repo, venv nghiên cứu cần torch >=2.6 và transformers; dependency inference
không bị thêm torch. Converter/mel filters chính thức có URL và SHA khóa trong
`training/prepare_phowhisper.py`; model output ghi `export.json` và sidecar checksum.

```powershell
& ai-service/training/.venv/Scripts/python.exe ai-service/training/prepare_phowhisper.py
& ai-service/training/.venv/Scripts/python.exe -u ai-service/training/trial_phowhisper.py --manifest ai-service/training/data/accent-vimd-valid-v3/benchmark.manifest.jsonl --output ai-service/training/runs/phowhisper-base-trial/new-vimd-run
docker compose -p shrimple -f compose.yaml -f compose.gpu.yaml config --quiet
.\ai-service\start-gpu.ps1
# CPU: docker compose -p shrimple up -d --build whisper phowhisper ai
# Sau khi xác minh AI, áp dụng frontend/backend đã đổi:
docker compose -p shrimple -f compose.yaml -f compose.gpu.yaml up -d --build --no-deps frontend backend
```

`start-gpu.ps1` kiểm checksum local rồi build ASR/AI mặc định để cập nhật startup
script trong image cũ. `-SkipBuild` chỉ dùng khi image đã có code mới.
Ngoài Docker, chạy hai whisper-server trên cổng8080 (en) và8082 (vi), cấu hình
`PHOWHISPER_CPP_URL` tương ứng; cả hai không cần mở cổng public trong Compose.

## Kiểm chứng và giới hạn

- Đã tải checkpoint, đo hai model trên90đoạn Việt +5câu Anh; export GGML thành công.
  Đã tính lại WER/CER từ toàn bộ predictions của cả hai lượt, khớp summary.
  Chưa thực chạy GGML whisper.cpp với PhoWhisper, chưa so fp32/f16/Q5 đầu ra.
- Client lint: 0 errors/warnings. Client build pass, 1863 modules; cảnh báo chunk
  >500kB còn tồn tại. Hai file backend sửa đều `node --check` pass.
- Regression JS: 2/2pass (UI/pair + bridge reject trước truy cập DB/AI).
- Regression AI mới: 5/5pass (routing vi/en, readiness hai model, HTTP/PCM reject,
  self PCM đi qua validation). [Log suite](./assets/2026-11-03-phowhisper/ai-tests.txt).
- Toàn suite AI cuối: **23/24pass**, một test có sẵn
  `test_capture_during_slow_asr_one_pending_and_stable_only_translation` thất bại:
  test đã thấy final transcript nhưng chưa thấy event translation khi assert.
  Test nằm trong phần LocalAgreement có sẵn trước phiên này, chưa sửa trong scope
  PhoWhisper. Không dùng kết quả này để tuyên bố toàn suite pass.
- Windows sandbox làm một số test thread/WebSocket treo và Git Bash bị chặn;
  đã dừng riêng tiến trình test tạo trong phiên, chạy lại có timeout ngoài sandbox.
  Môi trường CPU `.venv-check` được bổ sung dependency inference bằng uv. Shell
  syntax `start.sh`, PowerShell parser và CPU/GPU Compose config đều pass.
- Docker Desktop Linux Engine hiện không có named pipe; `docker compose ps`
  không kết nối được. **Chưa build/recreate hoặc đưa cấu hình mới lên runtime**.
  Chưa kiểm browser/mic/WebRTC thật, bản dịch MarianMT end-to-end hoặc nhiều speaker.
  Các tài liệu/Word cũ mô tả một model là snapshot lịch sử, chưa sửa lại DOCX.
- FR-23/AC-21, QS-I23 và QS-AI01 đã có source/config/evidence; QS-AI01 tiếp tục
  In Progress, Q01/Q03 chưa khép. Working tree chưa commit/push/deploy cloud.

Cập nhật sau phản hồi người dùng: [runtime fix cùng ngày](./2026-11-03-phowhisper-runtime-fix.md) phát hiện PhoWhisper đang chạy CPU và decoder profile khác benchmark HF. Phạm vi source/model ở trên là snapshot trước sửa; xem evidence mới để biết profile/GPU/replay hiện hành.
