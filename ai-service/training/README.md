# Whisper base LoRA — local research tooling

Hướng dẫn chính, schema dữ liệu, cách chạy và bằng chứng:
[docs/whisper-finetuning.md](../../docs/whisper-finetuning.md).

`data/`, `runs/`, `.venv/`, `.venv-check/` là dữ liệu riêng tư được Git bỏ qua.
Không upload audio/transcript/model. Không dùng bản chép nháp làm nhãn đã kiểm chứng.
`requirements.txt` này không thuộc inference container.

Model phục vụ đã chốt ngày03/11/2026: PhoWhisper-base cho vi và Whisper-base cho en;
các bản LoRA trong thư mục này không được tự đưa vào runtime. Giữ
`prepare_phowhisper.py`, `trial_phowhisper.py` và `evidence.py` cùng nhau vì script
chuẩn bị model dùng revision/checksum từ các module đó. Công cụ benchmark và test
nghiên cứu được giữ để tái lập evidence; không chạy training khi khởi động dịch vụ.
