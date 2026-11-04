# PhoWhisper chậm và nhận sai — kiểm tra runtime

Ngày 2026-11-03, Asia/Saigon. FR-23 / AC-21 / QS-I23 / Q01/Q03.
Người dùng gửi ảnh lời gốc tiếng Việt sai và cảnh báo gián đoạn sau khi chạy cấu hình
PhoWhisper. Báo cáo này bổ sung kiểm tra serving, không dùng benchmark HF của phiên
trước làm bằng chứng chất lượng gọi thật.

## Nguyên nhân đã xác minh

1. `shrimple-whisper-1` và `shrimple-phowhisper-1` đang dùng image CPU
   `qtmshrimple-whisper-cpu`, chỉ2thread; log `use gpu = 0` và AI `WHISPER_GPU=false`.
   Máy có GTX1650SUPER4GiB. QtmShrimple cũng có container riêng; không dừng/xóa nó.
2. PhoWhisper bị dùng lại decoder profile rút ngắn của Whisper tiếng Anh:
   `audio_ctx≈seconds+1`, timestamp tokens bật. Thử trực tiếp cùng6WAV có nhãn
   cho thấy profile này kém hơn full context/text. Đây là lỗi tích hợp serving
   đã bỏ sót khi phiên trước chỉ chạy HF fp32.
3. UI trước đây đánh dấu mất đoạn ngay khi partial nhận `status429/503`. Partial
   còn có thể được thay bằng cửa sổ audio mới và final thành công; đây là trạng
   thái đang chờ, chưa chứng minh mất lời nói.

## Phép đo trước sửa

Chọn cố định6validation rows đầu tiên trong manifest VIVOS development v2 có WAV
2–8s. Tổng133từ tham chiếu; hash manifest và output trong
[aggregate CPU](./assets/2026-11-03-phowhisper-runtime-fix/cpu-summary.json).
Chỉ diagnostic nhỏ để kiểm decoder; không là test độc lập mới hoặc acceptance.
Chưa biết overlap với corpus upstream của VinAI. Không thay references/trim lặp.

| Profile PhoWhisper CPU | WER | CER | Median inference HTTP |
| --- | ---: | ---: | ---: |
| Cửa sổ rút ngắn + timestamps (trước sửa) | 35.34% | 28.80% | 0.870s |
| Full context + timestamps | 9.77% | 8.16% | 2.308s |
| Full context + text (chọn) | 3.01% | 1.59% | 2.330s |

Cả18request không bị guard đánh dấu bất thường; guard lặp không phát hiện mọi
từ nghe sai. Full context trên CPU tốn thời gian hơn; cần kiểm GPU riêng để giải
đồng thời tốc độ và chất lượng. Thời gian trên là mỗi request inference; không
phải packet→note→translation, không gồm VAD/chờ câu hoặc WebRTC.

## Sau sửa — GPU và PCM thật

Đã áp dụng local cho `whisper`, `phowhisper`, `ai`, `frontend`.
Cả hai ASR có `use gpu=1`, model trên CUDA0 và `using CUDA0 backend`;
health PCM HTTP200/ready. Host GTX1650SUPER, driver617.14, VRAM dùng khoảng2669MiB
ngay sau nạp hai model, gồm tải hệ thống/dự án khác, không coi đó là VRAM riêng ASR.

| Profile cùng6WAV, GPU | WER | CER | Median / max inference HTTP |
| --- | ---: | ---: | ---: |
| Rút ngắn + timestamps | 8.27% | 4.54% | 0.198 / 0.663s |
| Full context + timestamps | 9.77% | 8.16% | 0.387 / 0.416s |
| Full context + text (đang dùng cho vi) | 3.01% | 1.59% | 0.336 / 0.458s |

So cấu hình cũ CPU với cấu hình mới GPU: median0.870→0.336s và WER35.34→3.01%
trên đúng mẫu này. Cùng profile full-text, CPU2.330s/GPU0.336s. Output profile rút
ngắn khác giữa CPU/GPU; không giả định kết quả số học mọi backend giống nhau.
Full-text có cùng WER/CER ở hai backend trong diagnostic này. Đây không là kết
luận mọi giọng Việt hoặc mọi latency đều cải thiện theo tỷ lệ trên.

Replay theo thời gian thực qua AI WebSocket, Silero, decoder đang phục vụ và
MarianMT thật. Hai clip mỗi hướng, cùng input trong lần đơn/đồng thời:

| Replay | Final / translation | Khớp revision | WER lời gốc | Status partial | Median final→translation |
| --- | ---: | --- | ---: | --- | ---: |
| vi→en riêng | 3/3 | Có | 2.04% (1/49 edits) | 0 | 0.076s |
| en→vi riêng, audio SAPI tổng hợp | 3/3 | Có | 0% (0/13) | 1×503 | 0.255s |
| vi→en khi hai nguồn đồng thời | 3/3 | Có | 2.04% | 1×429 | 0.391s |
| en→vi khi hai nguồn đồng thời | 3/3 | Có | 0% | 2×429 | 0.166s |

Không có event `error` hoặc mất translation câu cuối trong bốn replay. Các status
partial đã phục hồi khi final đến, xác nhận vì sao UI cần phân biệt chờ với lỗi
cuối câu. Không dùng việc có translation để khẳng định MT đúng nghĩa mọi câu.
Replay AI nội bộ chưa đi qua JWT/session bridge, mic/WebRTC hoặc thiết bị thật.

[GPU aggregate](./assets/2026-11-03-phowhisper-runtime-fix/gpu-summary.json),
[replay Việt](./assets/2026-11-03-phowhisper-runtime-fix/gpu-vi-en-pcm-summary.json),
[replay Anh](./assets/2026-11-03-phowhisper-runtime-fix/gpu-en-vi-pcm-summary.json),
[Việt đồng thời](./assets/2026-11-03-phowhisper-runtime-fix/gpu-dual-vi-en-pcm-summary.json),
[Anh đồng thời](./assets/2026-11-03-phowhisper-runtime-fix/gpu-dual-en-vi-pcm-summary.json),
[source/prediction hashes và image provenance](./assets/2026-11-03-phowhisper-runtime-fix/integrity.json).

## Thay đổi

- `app.transcribe_audio`: nguồn vi dùng full context `audio_ctx=0` và text decoding
  `no_timestamps=true`; nguồn en giữ profile cũ. Nhánh LocalAgreement cần word
  alignment dùng timestamps với full context cho vi; vẫn là thử nghiệm opt-in.
  Giữ checksum model, routing hai checkpoint, lane/queue, auth và bounded retry.
- `TranslationNotes.jsx` / `i18n.js`: status chờ partial hiển thị trạng thái đang
  xử lý, phục hồi khi nhận transcript; theo dõi riêng từng nguồn để một speaker
  không xóa trạng thái chờ của speaker khác. Lỗi thật của utterance/stream vẫn
  đánh dấu gián đoạn; không tự xóa cảnh báo mất đoạn đã xảy ra.
- Test LocalAgreement trước đây chờ `backend.translated` (lời gọi sync) rồi assert
  event async ngay. Sửa test chờ event translation thật. Không đổi production
  LocalAgreement để làm test pass.
- Có `training/probe_asr_runtime.py` để so decoder trên cùng pack và
  `training/replay_pcm_runtime.py` phát PCM16kHz/gói2048samples theo thời gian thực
  qua WebSocket AI, VAD/ASR/MT thật, auth nội bộ từ runtime; không in khóa hoặc lời
  nói ra stdout. Audio/predictions giữ trong ignored `.cache/translation-runtime-probe`.

## Checks và runtime gate

- AI regression **25/25pass**, gồm cấu hình vi/en, timestamps/full context,
  cancellation, segmentation, revision và lanes.
- JS regression **2/2pass**; client lint0errors/warnings; build pass1863modules,
  cảnh báo chunk>500kB còn tồn tại.
- Đã build/recreate frontend local với sửa trạng thái chờ, xác minh code có trong
  container. AI build thành công, hash `/app/app.py` khớp workspace. ASR GPU, health
  và replay đã kiểm như trên; backend hiện có được giữ, không đổi dữ liệu DB.
- Build lại toàn bộ CUDA bị cache miss và tốn khoảng20phút; đã chủ động dừng build
  client riêng của phiên, không ghi là build pass. Sau khi kiểm binary CUDA sẵn có
  chứa phiên bản1.9.4 và Docker nhận GPU, tái dùng image base
  `bf8809ca39c3ba2857c2898410f6f55e6d85b893b4572d3a9a0f1e092207bef4`, build lớp
  startup mới từ `start.sh`. Recipe tạm ở ignored `.cache/translation-runtime-image`.
  Không rebuild hoặc thay binary ASR trong artifact runtime này; CUDA/VAD/ASR/MT
  đã kiểm bằng inference thật. Dockerfile.cuda trong source không bị thay.
- Khởi động lại khi image không đổi: `.\ai-service\start-gpu.ps1 -SkipBuild`.
  Luôn giữ GPU override khi thao tác services; `compose.yaml` đơn lẻ là cấu hình
  CPU portable và có thể chuyển runtime trở lại CPU. Các cổng vẫn5173/5001/8001.
- Chưa kiểm đúng audio trong ảnh, mic/thiết bị/WebRTC hai browser hoặc concurrency
  nhiều người. Giữ Q01/Q03 mở; không suy mọi giọng Việt đã được sửa từ6câu.
- Không commit/push/deploy cloud; giữ các thay đổi có sẵn của working tree.
