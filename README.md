# Shrimple

Shrimple là ứng dụng mạng xã hội full-stack kết hợp nhắn tin thời gian thực, được xây dựng với React, Express, Socket.IO và MongoDB.

## Tài liệu dự án

Các tài liệu dưới đây được tái dựng từ code ngày 2026-10-08; trạng thái đã triển
khai và nghiệm thu được phân biệt rõ trong kanban.

| Tài liệu | Trách nhiệm |
| --- | --- |
| [PRD](docs/prd.md) | Mục tiêu, phạm vi, FR, BR và tiêu chí nghiệm thu |
| [Kanban](docs/kanban.md) | Ticket, dependency, trạng thái và bằng chứng |
| [Design](docs/design.md) | Màn hình, luồng UI, design token và khả năng truy cập |
| [Plan](docs/plan.md) | Kiến trúc, API, dữ liệu và kế hoạch hoàn thiện |
| [AGENTS.md](AGENTS.md) | Hướng dẫn agent làm việc trong repository |
| [Kết quả cleanup](docs/validation/codebase-cleanup.md) | Phần đã dọn và các kiểm tra thực tế |

## Điểm nổi bật

- **Xác thực:** đăng ký/đăng nhập bằng email và mật khẩu, xác minh email đăng ký bằng OTP, đăng nhập Google, quên mật khẩu bằng OTP.
- **Hồ sơ và quan hệ:** quản lý hồ sơ cá nhân, kết bạn và chặn người dùng.
- **Nhắn tin trực tiếp và nhóm:** gửi nội dung và media, reaction, thu hồi, xóa, ghim, chuyển tiếp, trạng thái đã đọc và trạng thái online.
- **Cuộc gọi:** gọi thoại/video ngang hàng bằng WebRTC; server chuyển tiếp tín hiệu thiết lập cuộc gọi qua Socket.IO.
- **Mic dịch thuật:** trong cuộc gọi 1–1 hoặc nhóm, người dùng có thể mở note dịch tiếng Anh/Việt theo tên người nói. Audio được chia thành clip ngắn, xử lý qua FastAPI và chỉ lưu note trong phiên giao diện hiện tại.
- **Nội dung xã hội:** bài đăng, bảng tin, bình luận, reaction, nội dung đã lưu và bảng tin video ngắn.
- **Cá nhân hóa:** giao diện sáng/tối và các thiết lập người dùng.
- **Anti-Peep:** ghi nhớ chủ nhân bằng 5 embedding, quét camera ở nhịp thấp và chỉ khóa khi cùng một người lạ nhìn vào màn hình liên tục 3 giây. Camera tự dừng khi tab bị ẩn.
- **Phân loại tin tiếng Việt tùy chọn:** mô hình TF-IDF/Random Forest đưa ra dự đoán mang tính heuristic. Kết quả không phải bằng chứng khẳng định một nội dung đúng hay sai và không thay thế việc kiểm chứng nguồn tin.

## Kiến trúc tổng quan

~~~text
React 19 + Vite
    │
    ├── REST qua Axios ───────────────┐
    ├── sự kiện thời gian thực ───────┤
    └── WebRTC media ngang hàng       │
                                      ▼
                         Node.js + Express 5 + Socket.IO
                              │          │
                              │          ├── Cloudinary / email
                              │          └── Python ML tùy chọn
                              ▼
                           MongoDB
~~~

Client gọi REST để xử lý dữ liệu nghiệp vụ và dùng Socket.IO cho trạng thái thời gian thực cũng như signaling WebRTC. Âm thanh/video cuộc gọi đi trực tiếp giữa các peer sau khi kết nối được thiết lập; server không phải media server.

Khi bật Mic dịch, trình duyệt tạo clip 6 giây riêng từ luồng mic của từng người tham gia, gửi tới Express qua REST có access token; Express kiểm tra người gửi và người nói thuộc phiên gọi trước khi chuyển clip sang FastAPI. FastAPI gửi audio tới `whisper-server` của whisper.cpp để nhận dạng giọng nói bằng model medium đa ngôn ngữ lượng tử hóa q5_0; sau đó Qwen3 1.7B dịch `en`/`vi` theo prompt chỉ trả về bản dịch, với chế độ suy luận đã tắt. Người dùng chọn ngôn ngữ đang nói để nhận chữ chính xác hơn; API vẫn hỗ trợ tự nhận diện. Model whisper được nạp một lần trong tiến trình riêng. Nếu xử lý chậm, hàng chờ giữ tối đa một clip chưa gửi cho mỗi người nói, bỏ clip cũ hơn và hiển thị cảnh báo để ghi chú không tụt lại quá xa. Clip và note không được lưu vào MongoDB.

### Chạy dịch thuật cục bộ

Khuyến nghị chạy bằng Docker Compose trên máy có NVIDIA GPU và Docker Desktop WSL2 GPU support: tạo `ai-service/.env` từ `ai-service/.env.example`, đặt cùng `TRANSLATION_AI_KEY` với `server/.env`, rồi chạy `docker compose up -d --build`. Service `whisper` biên dịch whisper.cpp v1.9.4 với CUDA, tải model `ggml-medium-q5_0.bin` (khoảng 539 MB), kiểm tra SHA-256 và giữ model trong volume `whisper-model-cache`. Service `qwen` chạy bản GGUF Q8_0 chính thức của Qwen3 1.7B bằng llama.cpp và giữ model trong volume `qwen-model-cache`; `ai` nối tới hai service này. Lần đầu cần mạng để tải model. Trên máy không có NVIDIA GPU, đổi `whisper.build.dockerfile` trong `compose.yaml` về `Dockerfile`, bỏ `whisper.deploy.resources.reservations.devices` và `whisper.image`; bản CPU chạy được nhưng medium thường không theo kịp clip 6 giây.

Nếu chạy ngoài Docker, cần Python 3.10+, `whisper-server` được build theo [hướng dẫn whisper.cpp](https://github.com/ggml-org/whisper.cpp), `llama-server` theo [hướng dẫn llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), model medium đa ngôn ngữ và FFmpeg trên PATH. Khởi động `whisper-server` trước với `--model <đường_dẫn_model> --host 127.0.0.1 --port 8080 --language auto --convert`; khởi động `llama-server` với `-hf Qwen/Qwen3-1.7B-GGUF:Q8_0 --host 127.0.0.1 --port 8081 -c 1024 -np 1 -t 4`, rồi chạy FastAPI từ thư mục `ai-service/`:

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:TRANSLATION_AI_KEY="replace_with_a_long_random_key"
$env:QWEN_URL="http://127.0.0.1:8081"
$env:WHISPER_CPP_URL="http://127.0.0.1:8080"
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001
~~~

Đặt cùng giá trị `TRANSLATION_AI_KEY` trong `server/.env`, và `TRANSLATION_AI_URL=http://127.0.0.1:8001` nếu chạy backend trực tiếp trên Windows.

Để thử riêng Qwen với câu mẫu trước khi mở cuộc gọi, chạy trong thư mục `ai-service/` sau khi `llama-server` sẵn sàng:

~~~powershell
.\.venv\Scripts\python.exe -c "from app import translate_text; print(translate_text('We should deploy the backend tonight.', 'en', 'vi'))"
~~~

Kết quả kỳ vọng là một câu tiếng Việt ngắn như `Chúng ta nên triển khai backend vào tối nay.`; cách diễn đạt có thể khác đôi chút giữa các lần chạy/model.

Compose tự nối backend đến `http://ai:8001`; không dùng `127.0.0.1` giữa hai container. Có thể kiểm tra `http://127.0.0.1:8001/health`: lúc tải model hoặc chờ whisper trả HTTP 503 với `status=loading`, sau đó trả `status=ready`. Nếu bật Mic dịch trong lúc khởi động, bảng note sẽ kiểm tra lại trạng thái tải model thay vì tự đóng ngay. Model Qwen mặc định là `Qwen/Qwen3-1.7B-GGUF:Q8_0`; liên kết `Qwen/Qwen3-0.6B-FP8` là model nhỏ hơn và không phải cấu hình mặc định này.

Chỉ hỗ trợ dịch Việt ↔ Anh. Đây là dịch theo clip khoảng 6 giây, nên vẫn có độ trễ ghi âm và xử lý, không bảo đảm độ chính xác tuyệt đối. Nếu nhiều người nói cùng lúc khiến medium + Qwen xử lý chậm hơn tốc độ ghi, app ưu tiên clip mới nhất và báo đã bỏ qua clip cũ. Chỉ bật Mic dịch khi người tham gia đồng ý gửi audio đến dịch vụ AI.

## Công nghệ

| Phần | Công nghệ chính |
|---|---|
| Client | React 19, Vite 7, React Router, Zustand, Axios, Socket.IO Client, simple-peer |
| Giao diện | Sass, Motion, GSAP, OGL, Lucide, Sonner |
| Form và xác thực client | React Hook Form, Zod, <code>@react-oauth/google</code> |
| Anti-Peep | <code>@vladmandic/human</code> (BlazeFace, FaceMesh, Iris, FaceRes) |
| Server | Node.js ESM, Express 5, Socket.IO 4 |
| Dữ liệu và media | Mongoose 8, MongoDB, Multer, Cloudinary |
| Xác thực và email | JWT, bcrypt, cookie-parser, Google Auth Library, Nodemailer |
| ML tùy chọn | Python, joblib, Pyvi, NumPy, scikit-learn; pandas/openpyxl phục vụ chủ yếu cho huấn luyện |

## Yêu cầu trước khi chạy

- Git.
- Phiên bản Node.js LTS hiện hành và npm.
- MongoDB có thể truy cập từ máy chạy backend.
- Tài khoản/cấu hình Cloudinary nếu sử dụng tải media.
- Google OAuth nếu sử dụng đăng nhập Google.
- Dịch vụ email hoặc SMTP nếu muốn gửi OTP qua email.
- Python và các gói ML nếu bật bộ phân loại tin tiếng Việt.

## Khởi động nhanh

Các lệnh dưới đây chạy từ thư mục gốc repository bằng PowerShell.

### 1. Cài dependency

~~~powershell
npm --prefix .\client install
npm --prefix .\server install
~~~

### 2. Tạo tệp môi trường cục bộ

~~~powershell
Copy-Item -LiteralPath ".\client\.env.example" -Destination ".\client\.env.development"
Copy-Item -LiteralPath ".\server\.env.example" -Destination ".\server\.env"
~~~

Mở hai tệp vừa tạo và thay placeholder bằng cấu hình của môi trường của bạn. Không chia sẻ hoặc commit giá trị thật.

Để gửi OTP khi đăng ký hoặc quên mật khẩu, cấu hình tài khoản email gửi trong `server/.env`. Với Gmail, hãy bật 2-Step Verification và tạo Google App Password; không dùng mật khẩu Gmail thông thường:

~~~env
EMAIL_SERVICE=gmail
EMAIL_USER=shrimple.sender@gmail.com
EMAIL_PASS=your_16_character_app_password
~~~

`EMAIL_USER` là email hệ thống dùng để gửi thư; OTP sẽ được gửi đến địa chỉ người dùng nhập. Sau khi thay đổi `server/.env`, cần khởi động lại backend. Nếu chưa cấu hình SMTP, server chỉ ghi OTP vào console để hỗ trợ development.

### 3. Chạy backend trong terminal riêng

~~~powershell
Set-Location .\server
npm run dev
~~~

Backend phải được chạy với <code>server/</code> là thư mục làm việc vì một số đường dẫn tương đối đến upload và model phụ thuộc vào thư mục hiện tại. Cổng mặc định là <http://localhost:5001>.

### 4. Chạy frontend trong terminal khác

~~~powershell
Set-Location .\client
npm run dev
~~~

Mở URL mà Vite in trong terminal. Cổng có thể đổi nếu cổng mặc định của Vite đang bận.

## Biến môi trường

### Client

Các khóa được khai báo mẫu trong <code>client/.env.example</code> và giá trị development nằm trong <code>client/.env.development</code>.

| Biến | Mục đích |
|---|---|
| <code>VITE_API_URL</code> | Base URL cho REST API |
| <code>VITE_SOCKET_URL</code> | URL kết nối Socket.IO |
| <code>VITE_ASSET_BASE_URL</code> | Base URL cho asset/media |
| <code>VITE_GOOGLE_CLIENT_ID</code> | Google Web Client ID dùng ở trình duyệt |

Vite đưa các biến <code>VITE_*</code> vào bundle trình duyệt, vì vậy người dùng có thể xem chúng. Google Client ID có thể công khai, nhưng client secret, MongoDB URI, khóa ký JWT, token và mật khẩu tuyệt đối không được đặt trong biến <code>VITE_*</code>.

### Server

Các khóa được khai báo trong <code>server/.env.example</code>; giá trị thật của máy cục bộ nằm trong <code>server/.env</code>.

| Biến | Bắt buộc | Mục đích |
|---|---|---|
| <code>PORT</code> | Không | Cổng backend; mặc định 5001 |
| <code>CLIENT_ORIGINS</code> | Có khi chạy khác origin | Danh sách origin client được CORS cho phép |
| <code>MONGODB_CONNECTIONSTRING</code> | Có | Chuỗi kết nối MongoDB |
| <code>MONGODB_DNS_SERVERS</code> | Không | Danh sách DNS phân cách bằng dấu phẩy cho truy vấn MongoDB SRV |
| <code>ACCESS_TOKEN_SECRET</code> | Có | Bí mật ký/xác minh access token |
| <code>CLOUDINARY_CLOUD_NAME</code> | Cho media Cloudinary | Tên cloud |
| <code>CLOUDINARY_API_KEY</code> | Cho media Cloudinary | API key |
| <code>CLOUDINARY_API_SECRET</code> | Cho media Cloudinary | API secret; chỉ giữ ở server |
| <code>GOOGLE_CLIENT_ID</code> | Cho Google Login | Audience mà backend chấp nhận khi xác minh ID token |
| <code>EMAIL_SERVICE</code> | Cho gửi email | Tên dịch vụ email được Nodemailer dùng |
| <code>EMAIL_USER</code> | Cho gửi email | Tài khoản gửi |
| <code>EMAIL_PASS</code> | Cho gửi email | Mật khẩu hoặc app password |
| <code>EMAIL_HOST</code> | Không | SMTP host tùy chỉnh |
| <code>EMAIL_PORT</code> | Không | SMTP port tùy chỉnh |
| <code>EMAIL_SECURE</code> | Không | Chế độ kết nối SMTP bảo mật |

Trong cấu hình một Google Web Client hiện tại, <code>VITE_GOOGLE_CLIENT_ID</code> và <code>GOOGLE_CLIENT_ID</code> phải khớp chính xác. Sau khi đổi env server, hãy khởi động lại backend; sau khi đổi env client, hãy khởi động lại Vite hoặc rebuild frontend.

Các tệp env thật được Git bỏ qua. Hai tệp <code>.env.example</code> chỉ chứa placeholder và được commit để mô tả cấu hình cần thiết.

## npm scripts

### Client

| Lệnh | Mục đích |
|---|---|
| <code>npm run dev</code> | Chạy Vite development server |
| <code>npm run build</code> | Tạo production build |
| <code>npm run lint</code> | Chạy ESLint |
| <code>npm test</code> | Chạy unit test cho bộ theo dõi Anti-Peep |
| <code>npm run preview</code> | Xem thử production build cục bộ |

### Server

| Lệnh | Mục đích |
|---|---|
| <code>npm run dev</code> | Chạy backend ở chế độ phát triển |
| <code>npm start</code> | Khởi động backend bằng Node.js |
| <code>npm test</code> | Kiểm tra xác thực socket và quyền tham gia phiên dịch của cuộc gọi 1–1 |
| <code>npm run test:ai</code> | Gửi clip WAV im lặng qua FastAPI để kiểm tra đường xử lý audio; cần AI service đang chạy và các biến `TRANSLATION_AI_URL`, `TRANSLATION_AI_KEY` |

Các script trên kiểm tra quyền tham gia phiên dịch và đường xử lý audio của dịch vụ AI.

## Cấu trúc chính

~~~text
.
├── client/
│   ├── public/                  # asset công khai và cấu hình redirect
│   ├── src/
│   │   ├── auth/               # bảo vệ route
│   │   ├── components/         # UI theo tính năng
│   │   ├── config/             # truy cập cấu hình client
│   │   ├── lib/                # hạ tầng client
│   │   ├── pages/              # màn hình ứng dụng
│   │   ├── services/           # lớp gọi API
│   │   └── stores/             # Zustand stores
│   └── .env.example
├── server/
│   ├── public/uploads/         # upload tạm ở runtime
│   ├── src/
│   │   ├── algorithms/         # bộ phân loại ML tùy chọn
│   │   ├── controllers/        # xử lý request
│   │   ├── libs/               # kết nối và tiện ích
│   │   ├── models/             # Mongoose models
│   │   └── routes/             # REST route groups
│   ├── server.js               # entrypoint
│   └── .env.example
└── docs/                       # tài liệu kỹ thuật
~~~

## Tổng quan API

Backend tổ chức REST API theo các nhóm sau:

| Nhóm | Phạm vi |
|---|---|
| <code>/api/auth</code> | Đăng ký, đăng nhập và khôi phục tài khoản |
| <code>/api/users</code> | Hồ sơ và dữ liệu người dùng |
| <code>/api/friends</code> | Quan hệ bạn bè và chặn người dùng |
| <code>/api/messages</code> | Tin nhắn và thao tác trên tin nhắn |
| <code>/api/conversations</code> | Hội thoại trực tiếp và nhóm |
| <code>/api/posts</code> | Bài đăng, feed và tương tác |
| <code>/api/notifications</code> | Thông báo trong app và đánh dấu đã đọc |

Các nhóm nghiệp vụ được bảo vệ bằng xác thực; nhóm auth là điểm vào công khai. Chi tiết payload và response nên được đối chiếu trực tiếp với route/controller tương ứng khi tích hợp.

## Anti-Peep

Anti-Peep chạy suy luận ngay trong trình duyệt bằng `@vladmandic/human`; khung hình camera không được gửi lên server. Khi thiết lập, ứng dụng lấy 5 embedding khuôn mặt của chủ nhân và lưu các mảng số này cùng phiên bản model trong hồ sơ người dùng. Người dùng có dữ liệu `face-api` cũ phải quét lại vì hai loại embedding không tương thích.

Khi bảo vệ được bật và tab đang hiển thị, camera dùng độ phân giải mục tiêu 320×240, khoảng 6 FPS và tối đa 10 FPS. Vòng quét nhẹ chỉ đếm khuôn mặt mỗi 1,5 giây. FaceMesh, Iris và FaceRes chỉ chạy khi phát hiện ít nhất hai khuôn mặt; cùng một khuôn mặt không phải chủ nhân phải vừa hướng mặt vừa nhìn về camera liên tục 3 giây mới khóa màn hình. Nhìn sang hướng khác đặt lại bộ đếm; mất nhận diện dưới 500 ms được bỏ qua để tránh khóa sai do một frame lỗi.

Camera dừng khi tắt bảo vệ, chuyển sang tab ẩn hoặc component bị hủy, rồi tự khởi động lại khi người dùng quay lại tab nếu Anti-Peep vẫn bật. Các model cần thiết được lưu tại `client/public/models/human/` và được tải từ cùng origin của frontend.

## ML tiếng Việt tùy chọn

Model nằm tại <code>server/src/algorithms/TF-IDF_RandomForest/</code>. Node.js gọi lệnh <code>python</code> từ <code>PATH</code>, vì vậy cần kiểm tra Python có thể được gọi bằng đúng tên này trong terminal chạy server.

~~~powershell
python -m pip install joblib pyvi numpy scikit-learn pandas openpyxl
~~~

<code>joblib</code>, <code>pyvi</code>, <code>numpy</code> và khả năng tương thích <code>scikit-learn</code> phục vụ inference. <code>pandas</code> và <code>openpyxl</code> chủ yếu cần cho quy trình huấn luyện/xử lý dữ liệu. Hãy giữ phiên bản thư viện tương thích với artifact model đã tạo.

## Build và triển khai

Kiểm tra frontend trước khi phát hành:

~~~powershell
Set-Location .\client
npm test
npm run lint
npm run build
~~~

<code>client/public/_redirects</code> cung cấp quy tắc proxy API và SPA fallback theo kiểu Netlify. Khi dùng nền tảng khác, cần chuyển các quy tắc tương đương sang cấu hình của nền tảng đó.

Khi triển khai backend:

- Cấu hình env bằng secret manager của nền tảng, không đưa tệp env thật vào image hoặc repository.
- Giới hạn <code>CLIENT_ORIGINS</code> về đúng domain frontend.
- Dùng HTTPS. Quyền camera/microphone, WebRTC và secure cookie cần secure context trong production.
- Bảo đảm thư mục làm việc và đường dẫn runtime cho upload/model phù hợp.
- Không có live deployment nào được tuyên bố trong tài liệu này.

## Bảo mật và mức độ sẵn sàng production

- Không commit env thật, token, credential, MongoDB URI hoặc secret.
- Giới hạn CORS và MongoDB Atlas IP allow-list theo hạ tầng thực tế.
- Ở môi trường thiếu SMTP, luồng hiện tại có thể ghi OTP ra console để hỗ trợ phát triển. Phải thay đổi hành vi này trước production.
- Rà soát xác thực, phân quyền, rate limiting và kiểm tra file upload trước khi mở hệ thống công khai.
- Thiết lập logging, giám sát, backup và quy trình rotate secret.
- Dự án vẫn cần production hardening; hãy thực hiện security review phù hợp trước khi xử lý dữ liệu thật.

## Đóng góp và quy trình phát triển

1. Tạo nhánh riêng cho thay đổi.
2. Giữ secret ngoài Git và cập nhật tệp <code>.env.example</code> nếu thêm biến cấu hình.
3. Chạy lint/build cho phần bị ảnh hưởng.
4. Kiểm tra thủ công các luồng thời gian thực, OAuth, upload hoặc WebRTC liên quan.
5. Cập nhật tài liệu khi hành vi, cấu hình hoặc API thay đổi.
6. Gửi thay đổi để review trước khi merge.
