# Cập nhật tài liệu kiến trúc dịch trực tiếp

Snapshot lần cập nhật trước khi chốt cleanup. Bản Word hiện hành đã được cập
nhật tiếp theo yêu cầu giữ model và dọn file; xem
[báo cáo chốt](./2026-11-03-translation-finalization.md) cùng SHA256/QA mới ở đó.

Ngày 03/11/2026, Asia/Saigon. Người dùng xác nhận dịch ổn sau sửa runtime và yêu
cầu cập nhật tài liệu kiến trúc trước. Đã cập nhật trực tiếp bản mới nhất
`docs/Tai-Lieu-Kien-Truc-Ky-Thuat-He-Thong-Shrimple-GPU-CPU.docx`.

- Đồng bộ phạm vi chỉ Anh ↔ Việt; nguồn vi dùng PhoWhisper-base, en dùng
  Whisper-base, cả hai ASR trên GPU; VAD/MarianMT/Qwen fallback trên CPU.
- Sửa bảng decoder, health hai ASR, HTTP không nhận Auto/zh, phân đoạn pause/valley
  và phân biệt status partial chờ với event error cuối câu.
- Cập nhật cả3sơ đồ, bảng diagnostic và evidence replay; ghi phản hồi người dùng
  riêng với số đo HF,6WAV serving và replay AI nội bộ. Không nâng thành nghiệm thu
  toàn app/production hoặc chuẩn hóa chất lượng cuộc gọi.
- Giữ bố cục A4, Times New Roman,10trang,9bảng,3sơ đồ; trang5–6ngang. Có2comment
  tại quyết định checkpoint và phương pháp đo để hỗ trợ review.
- LibreOffice executable không khả dụng. Đã thử renderer đóng gói, xác định lỗi,
  dùng Microsoft Word ẩn xuất PDF rồi adapter cục bộ gọi `render_docx.py` để tạo
  PNG144DPI. Đã xem toàn bộ10trang; vòng cuối xem lại4/9/10,7trang còn lại khớp
  pixel với bản đã xem. Không có chữ/bảng/sơ đồ tràn hoặc chồng lấn.
- Đã rà nội dung cũ về một ASR chung, en/vi/zh, HTTP Auto và số đo GPU02/11;
  các mô tả đó được thay bằng cấu hình hiện hành và phạm vi kiểm chứng phù hợp.
- Bản tài liệu không hậu tố GPU-CPU và các assets02/11 được giữ nguyên. Bản trước
  khi sửa cùng các PDF/PNG QA nằm trong ignored `.cache/architecture-doc-update`.
  Chỉ bàn giao DOCX; không cần đưa các trung gian QA vào Git.

[QA metadata và SHA256](./assets/2026-11-03-architecture-doc/document-qa.json).
[Evidence runtime](./2026-11-03-phowhisper-runtime-fix.md).
Chưa commit/push; không thay source hoặc runtime trong phiên cập nhật tài liệu.
