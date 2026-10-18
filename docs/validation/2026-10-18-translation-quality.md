# Kiểm tra model và lặp câu phiên dịch — 2026-10-18

QS-I23 / FR-23; quality gaps thuộc QS-Q01/Q03. Yêu cầu: kiểm tra model có quá
nhỏ khi phản hồi realtime đã ổn nhưng lời gốc/bản dịch sai hoặc lặp dài.
Đây là chẩn đoán model local, không thay cấu hình app hay nghiệm thu chất lượng.

Snapshot trước sửa; decoder/guard đã được xử lý tiếp trong
[bản sửa chống lặp](./2026-10-18-translation-repetition-fix.md). Các số đo dưới
đây giữ nguyên để so sánh, không mô tả cấu hình decoder sau bản sửa.

## Cấu hình xác nhận trực tiếp

- Host: Intel i3-10105F, 4 cores/8 threads; GTX 1650 SUPER 4096 MiB. Docker
  báo giới hạn khoảng 7.668 GiB RAM; GPU còn 1831 MiB tại thời điểm đọc.
- `shrimple-whisper-1`: `base-q5_1`, CPU, 2 threads, `--no-gpu`,
  `--max-context 0 --no-fallback --beam-size 1 --best-of 1`.
- `app.transcribe_audio`: audio context theo duration+1s, min128/max1500;
  request `no_timestamps=true`, temperature0, temperature_inc0, beam1.
- Dịch chính: CTranslate2 INT8 MarianMT en-vi/vi-en; fallback Qwen3-0.6B Q8_0,
  context1024, 2 threads. Cache đã có Whisper medium-q5_0 và Qwen3-1.7B Q8_0.
- Whisper base có 74M tham số, medium769M theo
  [tài liệu model](https://github.com/openai/whisper#available-models-and-languages).
  Số tham số là kiến trúc; file lượng tử hóa có kích thước khác nhau.

Không đọc/in `.env`, khóa API, nội dung log cuộc gọi hoặc audio riêng tư.

## Phép thử

Script: [probe.py](./assets/2026-10-18-translation-quality/probe.py).
Ba câu tiếng Anh được tổng hợp trong RAM bằng FFmpeg flite/slt, 16kHz mono
PCM16; thêm320ms silence đuôi như một câu cuối qua VAD. Không phải mic/WebRTC.

Base/medium đều CPU2threads, cùng mẫu và tham số. Medium chạy trong container
tạm `shrimple-whisper-quality-probe`, cùng image CPU với app, mount model cache
readonly. Không đổi service Whisper đang chạy, cổng hoặc volume.

Profiles:

| Tên trong JSON | Tham số khác cấu hình app |
| --- | --- |
| `current` | Không khác; adaptive audio_ctx, no_timestamps=true, beam1 |
| `timestamps` | no_timestamps=false; token_timestamps=false, beam1 |
| `beam3` | no_timestamps=false; token_timestamps=false, beam3 |
| `full_context` | audio_ctx=0, no_timestamps=false; token_timestamps=false, beam1 |

Timestamp ở đây là token giải mã của Whisper, không phải thời gian note trên UI.
Script `current` khai báo token_timestamps=false tường minh; app có cùng giá trị
hiệu lực vì server v1.9.4 tự tắt nó khi no_timestamps=true.

## Kết quả nhận dạng

| Input chỉ nói một lần | Base / current | Medium / current | Medium / timestamps hoặc beam3 |
| --- | --- | --- | --- |
| Can you hear me? (1.720s gồm silence) | Đúng,540ms | **Lặp44lần**,10814ms | Đúng1câu,4322ms /6100ms |
| What is happening? (1.765s) | Đúng,486ms | **Lặp55lần**,11068ms | Đúng1câu,4370ms /5240ms |
| The meeting starts at eight tonight. (2.415s) | Sai thành `The meeting starts at 8 to 9.`,501ms | `The meeting starts at 8 tonight.`,5361ms | Timestamp: cùng nghĩa,6126ms; beam3 đúng câu tham chiếu,6412ms |

Base với timestamps/beam3 vẫn lặp câu meeting2lần và sai `tonight -> to 9`.
Base full_context vẫn sai cùng cụm này,4421ms; hai câu ngắn đúng4763/4898ms.
Do đó **bật timestamp hoặc tăng context không phải cấu hình đã đủ kiểm chứng
cho mọi model**. Tăng lên medium mà giữ decoder hiện tại có thể tái hiện chính
kiểu lặp dài người dùng báo; tăng model đơn thuần chưa giải quyết lỗi.

Đã xác nhận reducer `translationNotesState.js` thay original theo stream/utterance
và revision, không nối các partial bằng phép cộng chuỗi. Kết quả lặp44/55lần ở
trên đến trực tiếp từ HTTP Whisper, trước Socket.IO/UI và model dịch.

[Base9lượt](./assets/2026-10-18-translation-quality/asr-base.jsonl),
[medium9lượt](./assets/2026-10-18-translation-quality/asr-medium.jsonl),
[base full context3lượt](./assets/2026-10-18-translation-quality/asr-base-full.jsonl).
`word_errors` trong JSON chỉ dùng khoảng cách token thô; `8`/`eight` vẫn bị tính
khác nhau. Không dùng các số đó để tuyên bố WER chuẩn hoặc độ chính xác tổng thể.

## Kết quả dịch văn bản đúng đầu vào

Chín câu mẫu được gửi riêng vào CT2 và Qwen0.6B đang chạy; sau đó cùng chín câu
vào Qwen1.7B trong container tạm, model cache readonly. Cùng hàm/prompt
`translate_qwen`, context1024/CPU2threads; không sửa system prompt giữa hai model.

| Input | MarianMT INT8 hiện tại | Qwen0.6B | Qwen1.7B |
| --- | --- | --- | --- |
| Can you hear me? | `Anh có nghe tôi nói không?` | Trả lời dạng `Tóm tắt...`, sai yêu cầu dịch | `Bạn có nghe tôi không?` |
| What's happening? | `Có chuyện gì vậy?` | `Tóm tắt: Tóm tắt.` | `Đang xảy ra chuyện gì?` |
| Bạn đang làm gì vậy? | `What are you doing?` | Cùng bản dịch | Cùng bản dịch |
| Mạng hơi yếu nên tiếng của bạn bị ngắt quãng. | `Your life is a little weak, so your voice is interrupted.` — sai nghĩa mạng | `The weak network causes your voice to be cut off.` | `The network is weak, so your voice is interrupted.` |
| Bạn có nghe thấy tôi không? | `Can you hear me?` | `You heard me?` | `Have you heard me?` — chưa giữ đúng thì/nghĩa hiện tại |

MarianMT sau warm29–490ms/câu trong bộ mẫu này; lần đầu hai chiều1329/1455ms
gồm load model trong tiến trình thử. Qwen1.7B1103–3009ms/câu; tốt hơn0.6B ở
các mẫu sai yêu cầu nhưng vẫn có sai nghĩa. Không thay toàn bộ bằng1.7B khi chưa
đánh giá tác động tới yêu cầu realtime.

`Bánh đang làm gì vậy?` được thử như đầu vào ASR sai từ ảnh: cả CT2/1.7B dịch
theo nghĩa `cake`. Model dịch không có audio để biết người nói thực sự nói `Bạn`.
Chưa có audio cuộc gọi gốc nên chưa xác nhận nguyên nhân phát âm/echo/noise cụ thể.

[CT2 và Qwen0.6B18lượt](./assets/2026-10-18-translation-quality/mt.jsonl),
[Qwen1.7B9lượt](./assets/2026-10-18-translation-quality/mt-qwen17.jsonl).

## Kết luận và bước tiếp theo

1. Có giới hạn chất lượng model: base sai cụm thời gian; MarianMT có câu sai nghĩa;
   Qwen0.6B fallback chưa đáng tin cậy ở bộ mẫu này. Medium/1.7B cải thiện một số
   mẫu nhưng vẫn có lỗi, không thay thế validation tiếng Việt thực.
2. Lặp dài còn liên quan decoder/cửa sổ audio. Cần đánh giá lại profile cho
   final/partial và xử lý output lặp bất thường trước khi phát note/gửi dịch.
   Không xóa mọi câu lặp bằng regex vì người nói có thể lặp thật.
3. Giữ AudioWorklet/PCM/session hiện tại. A/B model nhận dạng trung gian hoặc
   profile GPU riêng với audio Việt/Anh được đồng ý sử dụng; đo lỗi và thời gian
   partial/final/translation. Chưa thử GPU trong lượt này; VRAM đang có tải khác.
4. QS-Q01/Q03 còn mở; cần giọng Việt thật, accent/noise, câu lặp có chủ ý và nhiều
   nguồn audio, cùng benchmark đủ lượt trước khi chọn model mặc định.

Giới hạn: mỗi cấu hình/mẫu chỉ một lượt, chưa có p50/p95, bộ dữ liệu chấm dịch
chuẩn hoặc tái hiện WebRTC với hai thiết bị. Các số là thời gian HTTP/model local,
không phải độ trễ từ lúc người dùng bắt đầu nói. Các phép so sánh chạy nối tiếp.
Whisper cũng công bố khả năng hallucination/repetition và tradeoff decoder trong
[model card](https://github.com/openai/whisper/blob/main/model-card.md#performance-and-limitations).

## Thực thi và cleanup

`probe.py` được pipe qua `docker exec -i shrimple-ai-1 python -` với các đối số:
`asr base`, `asr medium`, `asr base full_context`, `mt`, `mt qwen17`.
Kết quả đã lưu ở các JSONL phía trên, chỉ chứa input/output tổng hợp.

Đã dừng/xóa tự động hai container thử `shrimple-whisper-quality-probe` và
`shrimple-qwen-quality-probe` bằng `docker stop` (`--rm` lúc tạo). Không đổi app,
không dừng các container Shrimple/QtmShrimple sẵn có, không xóa model cache.
Không sửa source/contract nên không chạy lại lint/build/unit suites; kiểm tra
JSON/evidence links và diff cho thay đổi tài liệu. Working tree chưa commit.
