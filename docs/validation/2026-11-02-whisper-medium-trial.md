# Thử nghiệm Whisper medium ngày 2026-11-02


> Lịch sử thử nghiệm: medium đã được rollback về base-q5_1 theo phản hồi tốc độ cùng ngày. Khóa A ⇒ B được giữ. Xem [trạng thái hiện tại và kiểm chứng](./2026-11-02-translation-language-lock.md).

QS-I23 / FR-23; chất lượng và hiệu năng tiếp tục thuộc QS-Q01/Q03.
Yêu cầu: thử `medium-q5_0` làm model ASR thống nhất en/vi/zh và cập nhật Word.
Đây là cấu hình thử nghiệm local, chưa nghiệm thu chất lượng tiếng Việt/Trung.

## Thay đổi

- `compose.yaml`, `compose.gpu.yaml`, `ai-service/whisper/start.sh`:
  mặc định `WHISPER_MODEL=medium-q5_0`; vẫn cho phép override để đối chiếu.
- Một model Whisper đa ngữ cho ASR. Qwen, CT2, VAD, tham số decoder,
  timestamp/guard/retry, protocol PCM, queue/deadline và UI không thay đổi trong đợt này.
- Đồng bộ mô tả hiện tại tại Design/Plan/Kanban. Evidence tháng 10 giữ nguyên
  như snapshot lịch sử, không đổi kết quả cũ thành kết quả medium mới.
- Word cập nhật model ở bảng và sơ đồ, thêm cấu hình chạy, kết quả và giới hạn.
  Bản gốc được sao lưu tại `output/whisper-medium-2026-11-02/original.docx`.
  Bản gốc đang bị khóa khi lưu; bản hoàn chỉnh được lưu riêng tại
  [Word medium](../Tai-Lieu-Tinh-Nang-Translate-Shrimple-medium-q5_0.docx).
  Đã render bằng LibreOffice cài trên máy theo ngoại lệ người dùng cho phép,
  kiểm tra đủ 10 trang, giữ 4 bảng và 2 sơ đồ; sửa ngắt hàng và tiêu đề lẻ.
  SHA-256 bản Word đã giao:
  `e17ba9b70533075a775d35b0509a2e9494d630b6e28bb4979dd8c5ccf1fd27d8`.

## Áp dụng và kiểm tra

Docker Desktop ban đầu chưa chạy. Sau khi khởi động, xác nhận project `shrimple`
dùng CPU; chỉ recreate service `whisper` của project này. Không recreate hoặc
đổi model của `qtmshrimple`. Không xóa image/volume/model cache.

```powershell
$env:WHISPER_MODEL="medium-q5_0"
docker compose -p shrimple up -d --no-deps whisper
docker compose config --quiet
docker compose -f compose.yaml -f compose.gpu.yaml config --quiet
```

- Hai profile Compose validate thành công.
- Script `start.sh` qua `sh -n` sau chuẩn hóa LF như bước `sed` trong Dockerfile.
- File model đã có trong cache; SHA-256 kiểm tra thực tế:
  `19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f`.
- Tiến trình thực tế: `--model /models/ggml-medium-q5_0.bin --language auto
  --threads 2 --max-context 0 --no-fallback --beam-size 1 --best-of 1 --no-gpu`.
- `shrimple-whisper-1`: running/healthy; Whisper `/health`: HTTP 200.
- AI `/health?mode=pcm` có xác thực: HTTP 200, `status=ready`.
  Khóa chỉ được dùng trong tiến trình container, không đưa vào output/evidence.
- Dùng image CPU sẵn có; không rebuild toàn app. Compose truyền model tường minh;
  fallback mới trong source `start.sh` có hiệu lực trong những lần build sau.

## Nhận dạng và PCM

[Script thử](./assets/2026-11-02-whisper-medium/smoke.py) chạy qua stdin trong
`shrimple-ai-1`, dùng FFmpeg flite/slt tạo audio tổng hợp trong RAM, mono 16 kHz.
Đầu vào ASR dùng `language=auto`, kèm 320 ms im lặng ở cuối.
[Kết quả đã ghi](./assets/2026-11-02-whisper-medium/smoke.json).

| Mẫu tổng hợp | Audio | Thời gian ASR | Kết quả |
| --- | --- | --- | --- |
| Can you hear me | 1.720 s | 26.157 s | Can you veer me? — sai từ hear |
| The meeting starts at eight tonight | 2.415 s | 4.735 s | The meeting starts at 8 tonight. |
| Can you hear me. Can you hear me | 2.735 s | 5.274 s | Can you hear me? Can you hear me? — giữ lặp chủ ý |

Cả ba trả ngôn ngữ `en`. Mẫu đầu tiên là lượt đầu sau nạp model; chưa tách được
chi phí warm-up, decoder retry hoặc tranh chấp tài nguyên. Không quy toàn bộ
26.157 s cho một nguyên nhân chưa đo. Script chỉ assert kết quả không rỗng và
nhãn ngôn ngữ đúng, không assert mọi từ đúng.

Pipeline `PcmPipeline`, nguồn `auto`, `translate=false`, audio tổng hợp:
nhận final `Can you hear me?`, revision 2, không error; thời gian từ bắt đầu
feed đến close 9.257 s, gồm cả thời gian phát gói. Đây là AI/PCM nội bộ,
không phải độ trễ WebRTC hoặc kiểm thử bản dịch end-to-end.

## Giới hạn và bước nghiệm thu tiếp theo

Chưa chạy audio Việt Bắc–Trung–Nam, tiếng Trung, code-switching, nhiễu,
mic/WebRTC, nhiều speaker hoặc GPU. Không kết luận medium cải thiện chất lượng
Việt/Trung hoặc đạt realtime từ ba câu tiếng Anh. Ngay cả tiếng Anh vẫn có lỗi.
Guard chống lặp không xác minh đúng nghĩa/từng từ; ASR sai có thể kéo theo dịch sai.

Không chạy lại toàn bộ lint/build/unit suites vì đợt này đổi cấu hình model và
tài liệu, không sửa JS/Python nghiệp vụ. Health, ASR và PCM ở trên là kiểm tra mới;
không tái sử dụng số test pass tháng 10 như bằng chứng hiện tại.

Tiếp theo: đo lời gốc, sai nghĩa và độ trễ trên cùng bộ audio Việt/Trung thực tế,
rồi kiểm tra cuộc gọi và tải đồng thời trước khi chốt cấu hình đồ án.
QS-Q01/Q03 giữ trạng thái mở; chưa commit/push/deploy cloud.

## Quay lại base để đối chiếu

```powershell
$env:WHISPER_MODEL="base-q5_1"
docker compose -p shrimple up -d --no-deps whisper
```

Không cần xóa cache. Sau rollback, bỏ override khỏi terminal dùng mặc định base-q5_1.
Nếu đang dùng GPU, giữ cả `-f compose.yaml -f compose.gpu.yaml` khi đổi model.

## Định dạng lại báo cáo kiến trúc

Theo yêu cầu tiếp theo, [bản báo cáo đen trắng](../Tai-Lieu-Kien-Truc-Ky-Thuat-He-Thong-Shrimple.docx)
được biên tập lại từ Word medium: A4, Times New Roman 13 cho thân bài, cấp tiêu đề
thống nhất, bảng nền trắng và đầu bảng xám nhạt, đánh số trang. Hai sơ đồ được dựng
lại từ mô tả kỹ thuật bằng vector đơn sắc, nhúng ảnh rõ nét vào Word.
Nội dung được chia theo kiến trúc, model, luồng xử lý, bảo mật, trạng thái,
thử nghiệm và phụ lục mã nguồn; kết quả đo và giới hạn kiểm chứng giữ nguyên.

Đã render và xem đủ 9 trang; kiểm tra tự động xác nhận mọi ảnh trang là thang xám,
9 bảng và 2 sơ đồ, cấu trúc DOCX hợp lệ. Kiểm tra bằng LibreOffice theo ngoại lệ
người dùng đã cho phép. Bản Word trước đó được giữ; không đổi code hoặc runtime
model trong lần định dạng này. File dựng, SVG và ảnh QA nằm trong
`output/translate-report-clean-2026-11-02/`.

## Cập nhật sau phản hồi tốc độ

Đã quay lại `base-q5_1` ở Compose CPU/GPU, start.sh và runtime local. Các số đo medium ở trên được giữ như lịch sử, không phải cấu hình đang chạy. Báo cáo kiến trúc hiện tại cũng đã cập nhật model base, hướng dịch A ⇒ B và thay sequence cũ bằng hai sơ đồ chi tiết trên trang ngang. [Kiểm chứng mới](./2026-11-02-translation-language-lock.md).
