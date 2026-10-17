# Chọn Whisper CPU cho máy local — 2026-10-17

Phạm vi QS-I23 / FR-23, phần cấu hình/build; Q03 về latency và thiết bị vẫn mở.
Không đổi model, REST/socket contracts, quyền, khóa nội bộ hoặc model volumes.

## Nguyên nhân build lâu

Ảnh người dùng và log BuildKit cho thấy hai lớp CUDA lớn: devel2.99GB và
runtime2.06GB. Sau khoảng687s mới tải481.30MB và314.57MB tương ứng; chưa tới
biên dịch Whisper. Build `auf8soc0cdvoiylj6fcpcrdgx` có trạng thái **Canceled**,
duration11m43s. Ba image frontend/backend/AI cùng lượt đã Completed khoảng11s.
Không coi build bị hủy là lỗi biên dịch.

`Win32_VideoController` trên máy chỉ trả `Intel(R) UHD Graphics`. Cấu hình
NVIDIA mặc định không phù hợp phần cứng đang được Windows nhận diện.

## Thay đổi

- `compose.yaml`: mặc định image `qtmshrimple-whisper-cpu`, build `Dockerfile`,
  không GPU reservation. Base Debian trong build này có lớp tải28.25MB;
  đây là kích thước lớp nền, không phải kích thước toàn image.
- `compose.gpu.yaml`: opt-in image CUDA, Dockerfile.cuda và NVIDIA reservation.
- Giữ whisper.cpp v1.9.4, medium multilingual q5_0, Qwen3, healthcheck và volumes.
  Không tự chuyển sang model nhỏ để giảm thời gian.
- README/Plan/Design/Codebase Summary cập nhật lựa chọn CPU/GPU. Không sửa các
  thay đổi giao diện TranslationNotes của công việc khác trong working tree.

## Kiểm tra

| Kiểm tra thực chạy | Kết quả / phạm vi |
| --- | --- |
| `docker compose config --quiet` và ghép compose.gpu.yaml | PASS; `config --images` xác nhận mặc định CPU, override CUDA |
| `docker compose --progress plain build whisper`, lượt đầu | PASS, build record `n7kymxj5u797zmq11dffpx206`, **7m42s**; gồm tải/cài packages, clone/compile và export image |
| Build lại cùng đầu vào | PASS, `28kngfxx8bn0thh0htzgpb0h7`, **1.4s theo BuildKit**; các bước cài package/clone/compile đều CACHED |
| Image đầu ra | `qtmshrimple-whisper-cpu:latest`, **772MB** theo Docker; không phải28MB toàn image |
| Container smoke `--network none`, không mount model/env | PASS: binary executable, `--help` có --model/--host, ldd không thiếu thư viện và không link CUDA/cuBLAS/cuDART |
| User, entrypoint và tools | PASS: uid10001, script không CRLF, sh -n hợp lệ; curl/ffmpeg chạy được |
| Docs links/line limits và diff whitespace | PASS trong phạm vi thay đổi |

Script smoke ở `.tmp/whisper-cpu-check/smoke.sh` (ignored), mount readonly;
container thử tự xóa bằng --rm. Không chạy inference hoặc tải model. GCC12
còn nhiều cảnh báo may-be-uninitialized trong AVX512 intrinsics của upstream;
không tắt cảnh báo, build/binary checks vẫn pass. Không coi đây là test model.

Không chạy lại client/server/FastAPI suites: thay đổi lượt này chỉ chọn CPU/GPU
và docs, không đổi logic ứng dụng. Các kết quả18 tests Linux của AI service là
evidence riêng trong [AI Docker build](./2026-10-17-ai-docker-build.md).

## Chạy

Mặc định CPU:

```powershell
docker compose up -d --build
```

Máy có NVIDIA GPU/WSL2 GPU support:

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml up -d --build
```

Lần khởi động đầu vẫn cần tải model Whisper/Qwen; khác bước tải image/build.
Medium trên CPU có thể không theo kịp clip6s. Queue giữ một clip chờ/source và
bỏ clip cũ theo contract hiện có; chưa đo tốc độ inference hoặc chất lượng dịch.
Agent không chạy app với DB thật, không xóa cache/volume, không commit/push/deploy.
Trong lúc thực hiện, cấu hình/source docs đã được commit từ công việc khác;
báo cáo này và cập nhật ticket bổ sung còn cần commit. Không revert thay đổi đó.
