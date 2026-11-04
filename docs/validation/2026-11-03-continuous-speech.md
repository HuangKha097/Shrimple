# Nói liên tục không nghỉ — sửa chia đoạn PCM (2026-11-03)

FR-23 / QS-I23. User báo nói dài không ngừng khiến lời dịch linh tinh.
Trạng thái: sửa source + regression pass; chưa cập nhật service đang phục vụ.

## Phát hiện và thay đổi

Code cũ chốt khi im lặng320ms hoặc đủ8giây. Không nghỉ thì chốt ngay frame ở mốc8s,
có thể giữa từ/cụm; mỗi mẩu được ASR/dịch riêng. Đây là nguyên nhân có thể đóng góp,
chưa có trace cuộc gọi để quy toàn bộ lỗi ngữ nghĩa cho việc chia đoạn. Buffer đã có
cap8s, không mô tả sai thành audio tích lũy vô hạn.

`pcm_vad.py` bổ sung:

- Sau4s, nghỉ VAD96ms có thể chốt cụm mà không cần chờ320ms.
- Chạm8s khi không có silence tail: chọn cuối khoảng96ms có năng lượng thấp nhất
  trong1,28s gần cuối. Năng lượng bằng nhau thì ưu tiên điểm muộn nhất.
- Giữ nguyên audio sau điểm cắt cho ID tiếp theo; không replay VAD state, không
  overlap lời nói hoặc regex xóa từ lặp. Snapshot vẫn≤8s.
- Giữ pre-roll256ms, normal end320ms cho đoạn ngắn, hysteresis0,35, queue/deadline/
  retry, contract transcript/revision/final/translation và model hiện tại.

Valley âm lượng không bảo đảm ranh giới từ/hết câu. MT cần ngữ cảnh vẫn có thể sai;
nếu inference chậm hơn tốc độ thu, queue vẫn có thể đầy và phải báo lỗi. Không tăng
queue vô hạn, không đưa bản fine-tune mới vào runtime trong sửa này.

## Kiểm chứng

7/7tests pass trong0,511s, `ai-service/tests/test_pcm_segmentation.py`:

1. PCM liên tục120,064s: mỗi final≤8s, ghép final+tail còn giữ khớp từng byte đầu vào,
   ID tăng liên tục; VAD giả lập nhận speech liên tục.
2. Valley tại frame227–229: final kết thúc ở frame230, giữ đúng22frame sau khi feed252.
3. Nghỉ96ms sau4s chốt sớm; nghỉ ngắn trước4s không chốt (hai tests).
4. Im lặng/normal end và pre-roll giữ bounded.
5. Silero ONNX thực khởi tạo và inference CPU/state đúng shape, giữ checksum pin.
6. Pipeline thật + ASR/MT giả lập: luồng12s có translation trước khi dừng đầu vào;
   hai final/translation đúng thứ tự utterance/revision, không error.

Kiểm trong tiến trình `python -` riêng của AI container có dependencies; source sửa
được compile/inject module **trong RAM**. Không sửa file/restart/rebuild Uvicorn.
Docker socket lúc đầu bị sandbox chặn; escalation cho read-only/test subprocess được
chấp thuận tự động. Không đọc `.env`/token, không thu/log audio cuộc gọi, không gọi
ASR/MT thật trong pipeline test. [Checks/source hashes](./assets/2026-11-03-continuous-speech/checks.json).

Command khi có dependencies, chạy từ root:

```powershell
$env:PYTHONPATH = 'ai-service'
python -m unittest discover -s ai-service/tests -p 'test_pcm_segmentation.py' -v
```

Container runner local ở ignored `.tmp/long-speech-check/run_container.py`, nhúng
source đã kiểm, không phải bản deploy. `git diff --check` pass. Không chạy JS suites
vì không sửa client/server/contracts.

## Phần chưa khép

Chưa rebuild/restart AI, replay audio dài có lời chép qua Whisper/MT thật hoặc kiểm
WebRTC hai người/điện thoại. Chưa xác nhận lời dịch cuộc gọi đã tốt hơn. Sau khi áp dụng
bản AI mới, cần nói liên tục30–60s, đối chiếu transcript trước rồi translation, theo dõi
queue/errors/latency và từ ở ranh giới. Nếu transcript đúng mà dịch sai, phân tích riêng
MT/ngữ cảnh. Giữ trạng thái acceptance QS-I23 hiện có, không nâng Done từ unit tests.
