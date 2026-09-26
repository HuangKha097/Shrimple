# Shrimple - Nền Tảng Mạng Xã Hội & Trò Chuyện Tích Hợp AI Dịch Thuật Trực Tiếp
> **Shrimple** là nền tảng mạng xã hội và liên lạc thời gian thực, nổi bật với hệ thống AI dịch thuật giọng nói hai chiều trực tiếp trong các cuộc gọi 1-1 và gọi nhóm. Ứng dụng kết hợp mạng xã hội chia sẻ bài viết, video ngắn cùng trải nghiệm nhắn tin, gọi thoại chất lượng cao.
---
## Tính Năng Trọng Tâm: AI Dịch Thuật Giọng Nói Trực Tiếp (Real-time AI Translation)
Điểm cốt lõi của Shrimple là khả năng dịch thuật giọng nói song ngữ (Việt ⇄ Anh) theo thời gian thực ngay trong cuộc gọi:
- **Nhận diện giọng nói siêu tốc (STT - Speech-to-Text):** Tích hợp nhân xử lý Whisper.cpp (hỗ trợ tăng tốc GPU CUDA) giúp chuyển đổi giọng nói thành văn bản với độ trễ thấp.
- **Dịch thuật ngữ cảnh thông minh (LLM Translation):** Ứng dụng mô hình Qwen qua llama.cpp, bảo toàn ngữ cảnh hội thoại, danh từ riêng, thuật ngữ chuyên ngành và các mốc thời gian.
- **Xử lý âm thanh thông minh (Audio Chunking & VAD):**
  - Tích hợp FFmpeg lọc và phân tích RMS âm thanh để tự động phát hiện và bỏ qua các khoảng lặng (silence detection), tối ưu hóa tải máy chủ.
  - Phân tích và dịch liên tục theo các đoạn âm thanh ngắn (audio chunks), đảm bảo cuộc trò chuyện diễn ra tự nhiên.
- **Bảng ghi chú dịch thuật trực quan (Translation Notes Widget):**
  - Hiển thị song song bản gốc và bản dịch của từng thành viên trong cuộc gọi.
  - Hỗ trợ đổi chiều dịch linh hoạt (Việt ⇄ Anh).
  - Tự động nhận diện danh tính người nói và hiển thị trạng thái xử lý của AI.
---
## Các Tính Năng Khác
### 1. Nhắn Tin & Gọi Thoại Thời Gian Thực
- **Chat trực tiếp & Nhóm:** Nhắn tin tức thời, gửi emoji, hình ảnh và tệp đính kèm qua Socket.io.
- **Gọi thoại & Video (WebRTC):** Hỗ trợ gọi 1-1 và phòng thoại nhóm nhiều người tham gia.
- **Trạng thái & Thông báo:** Quản lý trạng thái online/offline và thông báo đẩy theo thời gian thực.
### 2. Mạng Xã Hội & Chia Sẻ Video Ngắn
- **Bản tin (Newsfeed):** Đăng tải bài viết, hình ảnh, video kèm tương tác (thích, bình luận, lưu bài viết).
- **Video Feed:** Xem video ngắn dạng cuộn dọc, tối ưu hiển thị trên nhiều kích thước màn hình.
- **Kết nối bạn bè:** Tìm kiếm người dùng, gửi/nhận lời mời kết bạn và quản lý trang cá nhân.
### 3. Giao Diện & Trải Nghiệm
- Giao diện xây dựng trên React 19 hiện đại, mượt mà.
- Hỗ trợ chế độ Sáng / Tối (Light / Dark mode).
- Hỗ trợ đa ngôn ngữ giao diện (Tiếng Việt và Tiếng Anh).
---
