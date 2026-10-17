# Sửa lỗi build AI Docker — 2026-10-17

Phạm vi: lỗi Docker Compose trong log người dùng cung cấp; QS-I23 / FR-23,
phần build và runtime HTTP của AI service. Working tree ban đầu sạch;
không commit/push/deploy, không dùng .env thật trong container kiểm thử.

## Nguyên nhân và thay đổi

Build dừng tại `ai-service/Dockerfile`, bước pip install, với
`ResolutionImpossible`. Các ứng viên `uvicorn[standard]` đều cần `httptools`;
resolver không tìm được bộ phụ thuộc phù hợp trong lần build đó. Metadata
Uvicorn đã cài xác nhận httptools là optional dependency của extra standard.
Log không chứng minh đây là lỗi compiler hay CUDA.

AI app chỉ có HTTP REST. `ai-service/requirements.txt` dùng Uvicorn core,
giữ nguyên khoảng phiên bản và các dependency FastAPI/httpx/multipart.
`ai-service/Dockerfile` chạy `python -m pip install`, thêm `pip check`, và
khởi động `python -m uvicorn ... --http h11`.

Phát hiện thêm: `ai-service/whisper/start.sh` đang có24 dòng CRLF trong working
copy Windows. Khi copy/chmod rồi execute trong Linux, shebang `/bin/sh\r`
gây FileNotFoundError. Cả Dockerfile CPU và CUDA giờ chạy
`sed -i 's/\r$//' /usr/local/bin/start-whisper` trước chmod. Không đổi model,
GPU settings, runtime flags hoặc luồng dịch audio.

## Kiểm tra thực chạy

Docker Engine hiện phản hồi bình thường, version29.8.2. Đây là follow-up sau
lần [translation review](./2026-10-17-translation.md) gặp engine500.

| Check | Kết quả / phạm vi |
| --- | --- |
| `docker compose --progress plain build ai` | PASS, image `shrimple-ai:latest` được export/unpack thành công |
| `pip check` trong Docker build | PASS, `No broken requirements found`; không còn backtracking uvicorn[standard]/httptools |
| `docker run --rm ... shrimple-ai -m unittest -v test_app` | PASS **18/18** trong Python3.12 Linux của image mới, gồm2 tests FFmpeg thực; không skip |
| Default CMD HTTP smoke | PASS: h11 phục vụ HTTP khi httptools và uvloop đều không được cài;401 khi thiếu key,503/loading khi models chưa chạy |
| Whisper entrypoint kiểm tra trong Linux | Tái hiện CRLF gây FileNotFoundError; sau sed không còn CR và `sh -n` PASS |
| `docker compose config --quiet` | PASS |
| `git diff --check` và kiểm tra links/độ dài docs | PASS |

Image mới resolve Uvicorn0.54.0, h11 0.16.0, FastAPI0.143.3. Dependency ranges
vẫn mở như trước; đây là versions thực cài trong lần kiểm tra, không phải lockfile.
TestClient còn StarletteDeprecationWarning về httpx; không ảnh hưởng kết quả18 tests.

Tests mount `ai-service/test_app.py` readonly vào image; scripts HTTP/entrypoint
ở `.tmp/ai-build-fix/` (ignored). Container thử dùng `--network none`, không
publish port, khóa giả chỉ dùng test, không mount model volumes hay env thật.
HTTP smoke chạy CMD mặc định của image, không thay bằng server mock; model
chưa sẵn sàng là503 đúng contract. Các container thử được xóa sau khi kiểm tra.

## Giới hạn và bước tiếp theo

Chưa build toàn image Whisper CUDA/CPU hoặc chạy toàn stack/model inference.
Lỗi AI pip đã được xác nhận sửa bằng Docker build thực; entrypoint được kiểm
tra độc lập trên Linux, không coi là nghiệm thu CUDA/GPU/Whisper/Qwen. Không
chạy lại client/server suites vì không đổi JS, UI hay quyền/API.

Từ root chạy tiếp:

```powershell
docker compose up -d --build
```

Lệnh tận dụng AI image/layers vừa build. Build/download CUDA và model đầu tiên
vẫn cần thời gian và NVIDIA GPU theo Compose hiện có. Q01/Q02/Q03 về chất lượng
dịch, hiệu năng và thiết bị còn mở. Bốn file build và docs thay đổi chưa commit.
