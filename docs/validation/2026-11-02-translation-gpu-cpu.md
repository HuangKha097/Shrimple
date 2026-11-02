# Whisper CUDA và CPU VAD/MT chạy song song

Ngày 2026-11-02, QS-I23 / FR-23. Thực hiện theo yêu cầu dùng GPU kết hợp CPU; giữ model base-q5_1 và khóa A ⇒ B. QS-Q01/Q03 tiếp tục mở.

## Cấu hình và thay đổi

Máy hiện tại: Intel Core i3-10105F, 4 core/8 logical CPU, khoảng 16 GB RAM; NVIDIA GTX 1650 SUPER 4096 MiB, driver 617.14. Thông tin Intel UHD trong validation ngày 17/10 là snapshot cũ trên máy khi đó, không mô tả máy hiện tại.

- `compose.gpu.yaml`: Whisper dùng image riêng `shrimple-whisper-cuda`, GPU reservation NVIDIA; AI đặt WHISPER_GPU=true. Giữ project `shrimple`, model cache và các service frontend/backend/Qwen. Không thay các container `qtmshrimple`.
- `Dockerfile.cuda`: cấu hình source vẫn pin v1.9.4, CUDA 12.8.1 và kiến trúc 75 cho Turing; đồng bộ default base-q5_1 và 2 thread CPU điều phối. Full build ngày này bị hủy khi phiên bị ngắt ở khoảng 61%, không phải build pass. Để hoàn tất runtime, tái sử dụng binary CUDA có sẵn, xác nhận whisper.cpp 1.9.4-dev, SHA-256 binary `71ea71669f4c82a9dd00e5fab028dbaeb4b5b660285e647a948f3adf407d18da`; source image ID `30c98589acd12c1b6fbe55e432eb1d8090a02d8e0d68f102081e54cedd1d779c`. Build lớp startup/default mới thành image riêng shrimple-whisper-cuda thành công. Không dùng image CPU làm bằng chứng GPU. Dockerfile recovery và build source được ghi riêng trong output.
- `ai-service/start-gpu.ps1`: luôn ghép hai file Compose, kiểm tra config và start riêng Whisper/AI. Mặc định dùng CUDA image local nếu đã có, build Whisper khi thiếu hoặc truyền -Rebuild; build AI trừ khi -SkipBuild. Các service khác phải được khởi động theo README trước. Plain Compose mặc định vẫn là CPU để chạy được trên máy không có NVIDIA; dùng script GPU cho máy hiện tại.
- Production PcmPipeline đã có hai worker và hai model lock độc lập. Không cần sửa logic ASR/MT để chạy song song; thay đổi lần này kích hoạt đúng thiết bị. VAD/PCM, CT2 INT8 và Qwen chạy CPU; Whisper dùng CUDA. Không diễn giải các trường share=0.5 trong compute_profile như phần trăm tải thực đo.

```powershell
.\ai-service\start-gpu.ps1
# Lần sau, khi image đã có và source không đổi:
.\ai-service\start-gpu.ps1 -SkipBuild
```

Không đổi sang small/medium hoặc model ASR khác. Phần tự chẩn đoán sai từ/nghĩa vẫn cần audio Việt/Trung thật và chỉnh chất lượng riêng.

## Kiểm chứng

Sau khi hoàn tất kiểm tra, theo yêu cầu người dùng đã dọn các file test mới và script probe/harness tạm. Các kết quả dưới đây là bằng chứng đã chạy trước cleanup; giữ JSON/timeline và sơ đồ trong assets, không còn giữ test suite để chạy lại trong source.

- Host nvidia-smi và container CUDA nhận đúng GTX 1650 SUPER. Runtime Whisper nạp base-q5_1 trên CUDA0; command không có --no-gpu, device request là NVIDIA GPU. Model checksum giữ nguyên giá trị đã kiểm chứng khi rollback base.
- Compose GPU config --quiet và PowerShell parser pass. Build lớp startup trên CUDA binary có sẵn pass; full compile bị hủy như ghi trên. Đã áp dụng local profile GPU/CPU; AI health mode=pcm ready. Regression khóa nguồn AI: 5/5 pass.
- CT2 probe trả device=cpu; Silero trả CPUExecutionProvider. Qwen giữ nguyên service CPU không có GPU reservation.
- Probe WebSocket PCM live: Auto bị từ chối; nguồn en/vi/zh cụ thể và self B/B được chấp nhận; mẫu Anh→Việt nhận final + bản dịch, không lỗi. Đây là transport AI nội bộ, không phải cuộc gọi WebRTC.
- Probe production PcmPipeline nạp hai final tổng hợp vào queue, dùng Whisper HTTP thật và CT2 thật. Nhận hai transcript và hai bản dịch; các khoảng thực thi ASR/MT chồng nhau **46.24 ms** trên hai thread khác nhau. Không chèn sleep giả vào model để tạo overlap.

## Đo ASR CPU/GPU có kiểm soát

Ba câu tiếng Anh tổng hợp FFmpeg flite, language=en, cùng base-q5_1, cùng decoder và HTTP wrapper, bao gồm guard/retry nếu có. Mỗi thiết bị được warm-up một lượt trước đo. CPU comparison là container tạm chạy cùng binary CUDA với --no-gpu, 2 thread; GPU dùng service chính. Container CPU được cấp driver library qua --gpus all vì binary liên kết libcuda, nhưng use gpu=0 và ASR chạy CPU. Hai chế độ được gọi luân phiên trên từng mẫu sau khi build đã kết thúc. Container so sánh chỉ mount cache model readonly và được dọn sau kiểm tra.

| Mẫu tổng hợp | ASR CPU (ms) | ASR GPU (ms) |
| --- | --- | --- |
| Can you hear me | 206 | 43 |
| The meeting starts at eight tonight | 2479 | 460 |
| Please send the report to me after the meeting | 2586 | 502 |

Trung vị ba mẫu: CPU **2479 ms**, GPU **460 ms**. Đây là thời gian gọi ASR HTTP, không gồm capture/VAD/dịch/WebRTC, không phải benchmark đa ngôn ngữ hoặc SLA. [Kết quả và timeline đầy đủ](./assets/2026-11-02-gpu-cpu/probe-result.json).

## Tài liệu

[Word GPU/CPU](../Tai-Lieu-Kien-Truc-Ky-Thuat-He-Thong-Shrimple-GPU-CPU.docx) cập nhật phân công thiết bị, sequence par/loop, kết quả và lệnh chạy. Bản Word trước đang mở/khóa nên được giữ nguyên; bản GPU/CPU lưu riêng. [Sơ đồ kiến trúc](./assets/2026-11-02-gpu-cpu/architecture.svg), [sequence khởi tạo](./assets/2026-11-02-gpu-cpu/sequence-setup.svg), [sequence xử lý](./assets/2026-11-02-gpu-cpu/sequence-runtime.svg).

## Giới hạn

Mẫu thứ hai vẫn nhận `eight tonight` thành `8 to 9` ở cả CPU và GPU; bản dịch trong probe còn sai mốc thời gian thành `8 giờ sáng`. Kết quả này xác nhận tăng tốc không sửa lỗi nhận dạng/dịch nghĩa. Chưa nghiệm thu browser/mic/WebRTC thật, Việt vùng miền, tiếng Trung, nhiễu, số speaker đồng thời hoặc độ trễ end-to-end. Không chạy lại toàn bộ client/server/DB suites cho thay đổi profile. Chưa commit/push/deploy cloud. Không xóa dữ liệu/model volume, không đổi driver hoặc project QtmShrimple.

## QA tài liệu và kết nối

Đã xem đủ 10 trang Word GPU/CPU, gồm hai trang ngang 5–6; 9 bảng, 3 sơ đồ, tất cả ảnh render thang xám. LibreOffice hiện thiếu executable và bộ MSI admin layout thiếu payload; dùng một instance Microsoft Word riêng, ẩn, chỉ đọc để xuất PDF, sau đó rasterize bằng helper Documents. Không sửa bản Word người dùng đang mở. SHA-256 bản giao: `e46be75dbe3c424010ab23a0b17b69336007b006544d5c4b89461bafdab8736b`. Backend→AI health mode=pcm trả 200/ready; frontend HTTP200. Bằng chứng [CUDA](./assets/2026-11-02-gpu-cpu/gpu-runtime.txt), [thiết bị](./assets/2026-11-02-gpu-cpu/device-assignments.json), [PCM WebSocket](./assets/2026-11-02-gpu-cpu/live-websocket.jsonl).
