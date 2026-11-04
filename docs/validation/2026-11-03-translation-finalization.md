# Chốt cấu hình dịch và dọn file thử nghiệm

Ngày03/11/2026, Asia/Saigon. Người dùng xác nhận dịch ổn, yêu cầu giữ nguyên model,
cập nhật tài liệu và dọn file/test dư. Đã giữ pipeline segmented, gỡ nhánh
LocalAgreement không được chọn và cập nhật tài liệu kiến trúc Word cùng các docs.
Không fine-tune, tải thêm hoặc thay checkpoint phục vụ.

## Model và hành vi được giữ

| Nguồn | Model | Định dạng | Profile đã chốt |
| --- | --- | --- | --- |
| vi | VinAI PhoWhisper-base | GGML f16 | Full encoder context, text decoding, GPU |
| en | Whisper-base | GGML Q5_1 | Giữ context/timestamp decoder hiện hành, GPU |

Giữ Silero VAD, MarianMT CT2 en↔vi và Qwen fallback trên CPU; ngôn ngữ dịch chỉ
en→vi hoặc vi→en. Self PCM cùng ngôn ngữ với `translate:false` vẫn bỏ qua MT.
Không đổi auth, session/member checks, queues, revision, bounded retry hoặc
cảnh báo lỗi từng đoạn. Không dùng regex xóa lời lặp có chủ ý.

Checksum trong model đang mount được đối chiếu trước và sau dọn:

- PhoWhisper: `d2d55964ba390fdbd32642a36555961df7fe3a171c41c841e4257f46a157c367`.
- Whisper: `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898`.

Đầu phiên hai ASR đang được tạo bằng CPU image. Đã khôi phục profile GPU theo
yêu cầu còn hiệu lực bằng `ai-service/start-gpu.ps1 -SkipBuild`, tái dùng nguyên
image/model; hai ASR GPU/healthy và health AI PCM HTTP200/ready, mode segmented.
[Trạng thái/checksum](./assets/2026-11-03-translation-finalization/runtime-models.json).
Không build/redeploy source cleanup vào AI image trong đợt này; runtime có sẵn
đã dùng segmented nên việc gỡ nhánh không thay luồng đang phục vụ.

## Phần đã dọn

Đã bỏ bốn file không còn được chọn:

- `ai-service/pcm_agreement.py` và `ai-service/pcm_incremental.py`.
- `compose.localagreement.yaml`.
- `ai-service/tests/test_pcm_agreement.py`.

Gỡ import động, tham số `with_words`/hàm alignment, Docker COPY và cờ
LocalAgreement/DTW tương ứng khỏi app, PCM socket, startup và env sample.
Source chỉ còn khởi tạo `PcmPipeline`. Xóa thêm một test alignment trong bộ
language; tổng18tests chỉ phục vụ nhánh thử được bỏ. Không xóa test vì đang fail:
bộ30tests trước đó đã pass, nhánh bị loại do phép đo chất lượng kém hơn.

Đã dọn sáu thư mục cache/runner tạm: bản sao LocalAgreement, pack/probe runtime,
recipe image tạm, các vòng render Word cũ và runner stable-prefix/long-speech.
Những thư mục này chứa129file,29.668.930byte; thêm3file bytecode mồ côi được gỡ.
Trung gian render/authoring của chính đợt chốt này cũng được dọn sau visual QA;
danh mục thực tế ở [cleanup result](./assets/2026-11-03-translation-finalization/cleanup-result.json).
Mọi target recursive đã kiểm tra absolute path nằm trong workspace, không có
reparse point. Không xóa Docker images/volumes hoặc dữ liệu dự án QtmShrimple.

Giữ model mount `training/runs/phowhisper-base-trial/ggml`, dữ liệu nghiên cứu,
venv, Hugging Face/model cache, Mongo test binary và validation assets.
`prepare_phowhisper.py` phụ thuộc `trial_phowhisper.py`/`evidence.py`, nên giữ cả
ba; không suy script nghiên cứu là dư chỉ vì inference không import.
Các công cụ benchmark/training đã có tài liệu và test riêng cũng được giữ.

Giữ hai test file AI cho segmentation/ngôn ngữ và test JS cho UI/bridge.
Harness replay chuẩn còn lại giúp tái kiểm khi cần; bản sao/harness tạm bị dọn.
[Inventory trước dọn](./assets/2026-11-03-translation-finalization/cleanup-inventory.json).

## Tài liệu đã cập nhật

Word `Tai-Lieu-Kien-Truc-Ky-Thuat-He-Thong-Shrimple-GPU-CPU.docx`: ghi quyết định
giữ model/segmented, kết quả loại LocalAgreement và test suite còn lại; bỏ mô tả
alignment opt-in. Giữ10trang,9bảng,3sơ đồ,2comment, trang5–6ngang. Đã render bằng
Word ẩn xuất PDF rồi adapter gọi `render_docx.py` đóng gói ở144DPI và xem đủ10PNG.
Không có trang gần trống, chữ/bảng tràn hoặc chồng lấn. Bundled LibreOffice
không khả dụng; không dùng bản LibreOffice desktop bên ngoài runtime.
[DOCX SHA256 và QA](./assets/2026-11-03-translation-finalization/document-qa.json).

Đồng bộ Design/PRD/Plan/Kanban/codebase-summary và README research. Báo cáo
[LocalAgreement](./2026-11-03-localagreement-trial.md) được đánh dấu snapshot
lịch sử, gỡ hướng dẫn bật source đã xóa, giữ nguyên kết quả đo và hashes.
Bản Word không hậu tố GPU-CPU được giữ nguyên; các asset evidence cũ không xóa.

## Kiểm chứng và phạm vi

- **AI12/12pass**: segmentation/VAD, bảo toàn PCM120s, final/MT đúng revision,
  routing PhoWhisper/Whisper, HTTP/PCM chỉ en↔vi, self PCM và readiness hai ASR.
- **JS2/2pass**: cặp dịch UI và bridge từ chối ngôn ngữ ngoài scope trước DB/AI.
- PowerShell parser, shell syntax sau chuẩn hóa CRLF như Dockerfile,
  Compose GPU `config --quiet`, Python syntax và `git diff --check` pass.
- Scout lại source không còn import/cờ/entrypoint LocalAgreement, DTW hoặc
  alignment đã bỏ; Docker COPY chỉ trỏ file còn tồn tại. Links docs mới hợp lệ.

[Checks và hashes source](./assets/2026-11-03-translation-finalization/checks.json).

Không chạy lại toàn bộ client lint/build hoặc server DB suite vì không sửa
frontend, contract/quyền hoặc dependency trong đợt dọn. Không có phép đo chất
lượng ASR/MT mới; không lấy health/test pass thay nghiệm thu mic/WebRTC hoặc tải
nhiều người. Q01/Q03 và QS-AI01 giữ gate hiện có. Working tree chưa commit/stage;
không push/merge/deploy cloud, giữ các thay đổi có sẵn ngoài phạm vi.
