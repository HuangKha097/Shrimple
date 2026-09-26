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
- Hỗ trợ đa ngôn ngữ giao diện (Tiếng Việt và Tiếng Anh).

---

## Kiến Trúc Hệ Thống (System Architecture)

Shrimple được triển khai theo mô hình microservices, đóng gói đồng bộ bằng Docker:

```text
┌────────────────┐      ┌─────────────────────────┐      ┌────────────────────────────────┐
│ React Frontend │ ───> │ Express Backend Gateway │ ───> │      FastAPI AI Service        │
│   (Vite + UI)  │ <─── │   (Socket.io / Auth)    │      │ (Whisper.cpp + Qwen llama.cpp) │
└────────────────┘      └───────────┬─────────────┘      └────────────────────────────────┘
                                    │
                             ┌──────┴──────┐
                             │   MongoDB   │
                             └─────────────┘
```

- **Frontend (`/client`):** React 19, Vite, Zustand, Socket.io Client, Simple-Peer (WebRTC), Tailwind/SASS, Lucide.
- **Backend Gateway (`/server`):** Node.js, Express 5, MongoDB, Mongoose, Socket.io, JWT, Multer, Cloudinary.
- **AI Core Service (`/ai-service`):**
  - **FastAPI:** Quản lý pipeline nhận file âm thanh, điều phối STT và dịch thuật.
  - **Whisper.cpp:** Trích xuất lời nói từ audio với hiệu năng cao.
  - **llama.cpp (Qwen3):** Dịch ngữ nghĩa tự nhiên và chính xác.

---

## Yêu Cầu Môi Trường

- Docker & Docker Compose
- *(Tùy chọn tăng tốc AI)*: NVIDIA GPU & NVIDIA Container Toolkit (hỗ trợ CUDA)
- Node.js >= 18.x (khi chạy local không qua Docker)
- Python >= 3.10 (khi chạy local AI service)

---

## Hướng Dẫn Cài Đặt & Khởi Chạy Bằng Docker

### 1. Clone mã nguồn
```bash
git clone https://github.com/HuangKha097/Shrimple.git
cd Shrimple
```

### 2. Thiết lập Biến Môi Trường

Tạo các file cấu hình tương ứng từ các file mẫu:
- **Server:**
  ```bash
  cp server/.env.example server/.env
  ```
  *(Cấu hình `MONGODB_CONNECTIONSTRING`, `ACCESS_TOKEN_SECRET`, `CLOUDINARY_*` và chuỗi bí mật `TRANSLATION_AI_KEY`)*

- **AI Service:**
  ```bash
  cp ai-service/.env.example ai-service/.env
  ```
  *(Đặt `TRANSLATION_AI_KEY` khớp với Server)*

- **Client:**
  ```bash
  cp client/.env.example client/.env.development
  ```

### 3. Khởi Chạy Toàn Bộ Hệ Thống

Chạy toàn bộ hệ thống gồm Frontend, Backend, AI Service, Whisper và Qwen trong nền:

```bash
docker compose up -d --build
```

> **Lưu ý ở lần chạy đầu tiên:** Docker sẽ kéo mô hình `Qwen3-1.7B` từ Hugging Face và build Whisper CUDA nên sẽ cần vài phút tùy tốc độ mạng. Sau đó các mô hình được lưu vào volume để tái sử dụng ngay lập tức cho các lần khởi động tiếp theo.

### 4. Địa Chỉ Truy Cập Mặc Định

| Dịch vụ | URL | Mô tả |
| :--- | :--- | :--- |
| **Frontend** | `http://localhost:5173` | Giao diện web chính |
| **Backend API** | `http://localhost:5001` | Express REST API & Socket.io |
| **AI Translation Service** | `http://localhost:8001` | FastAPI điều phối dịch thuật |

---

## Bảng Lệnh Docker Hữu Ích

### Kiểm tra trạng thái hoạt động
```bash
docker compose ps
```

### Theo dõi Log dịch vụ
```bash
# Xem log toàn bộ hệ thống thời gian thực
docker compose logs -f

# Xem log riêng dịch vụ AI / Dịch thuật
docker compose logs -f ai
docker compose logs -f whisper
docker compose logs -f qwen

# Xem log Backend & Frontend
docker compose logs -f backend
docker compose logs -f frontend
```

### Quản lý vòng đời dịch vụ
```bash
# Tạm dừng các container (giữ nguyên dữ liệu)
docker compose stop

# Khởi động lại các container đã tạm dừng
docker compose start

# Khởi động lại riêng 1 service sau khi sửa code (ví dụ backend)
docker compose restart backend

# Build lại riêng 1 service
docker compose up -d --build backend

# Dừng và gỡ bỏ toàn bộ container
docker compose down

# Dừng và xóa cả Docker Volume (cache model Qwen & Whisper)
docker compose down -v
```

---

## Chạy Thủ Công (Không Dùng Docker - Local Development)

Nếu muốn phát triển và kiểm thử từng service độc lập trên máy:

- **Frontend:**
  ```bash
  cd client
  npm install
  npm run dev
  ```

- **Backend:**
  ```bash
  cd server
  npm install
  npm run dev
  ```

- **AI Service:**
  ```bash
  cd ai-service
  python -m venv venv
  # Kích hoạt venv: .\venv\Scripts\activate (Windows) hoặc source venv/bin/activate (Linux/macOS)
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 8001 --reload
  ```

---

## Cấu Trúc Thư Mục Dự Án

```text
Shrimple/
├── client/                 # Ứng dụng Frontend (React 19 + Vite)
│   ├── src/
│   │   ├── components/     # UI components (Chat, Call, Post, Video, ...)
│   │   ├── pages/          # Các trang chính
│   │   ├── stores/         # Quản lý state với Zustand
│   │   └── services/       # Xử lý API & kết nối socket
├── server/                 # Backend API (Node.js + Express + Socket.io)
│   ├── src/
│   │   ├── controllers/    # Xử lý logic
│   │   ├── models/         # Schema MongoDB
│   │   ├── routes/         # Định tuyến REST API
│   │   └── socket/         # Tín hiệu WebRTC & sự kiện socket
├── ai-service/             # Dịch vụ AI dịch thuật (Python FastAPI)
│   ├── app.py              # Pipeline tích hợp Whisper & Qwen
│   └── whisper/            # Cấu hình Whisper.cpp CUDA
├── compose.yaml            # Cấu hình Docker Compose toàn hệ thống
└── README.md               # Tài liệu tổng quan dự án
```
