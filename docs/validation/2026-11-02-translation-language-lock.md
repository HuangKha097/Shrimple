# Khóa hướng dịch A ⇒ B và quay lại Whisper base

Ngày: 2026-11-02. Phạm vi: QS-I23, FR-23; các gate QS-Q01/Q03 vẫn mở.

## Hành vi hiện tại

- Bảng Note chọn hai ngôn ngữ khác nhau trong `vi/en/zh`, hiển thị A ⇒ B và nút đảo chiều. Không có Auto.
- Remote gửi `sourceLanguage=A`, `targetLanguage=B`, `translate=true`. Chính viewer gửi B/B với `translate=false`, chỉ nhận dạng lời gốc.
- Chọn trùng phía còn lại đảo cặp nguyên tử. Đổi A/B dừng stream cũ, đánh dấu note chờ bị gián đoạn và mở stream mới; giữ note đã hoàn tất với nhãn cũ.
- Group dùng chung A cho các đối phương trong bảng Note của viewer; chưa chọn nguồn riêng từng speaker. Người tham gia cần nói theo cặp đã chọn.
- Bridge và AI PCM từ chối `auto`, cặp dịch bằng nhau và self không đúng viewer trước inference. Vẫn kiểm tra JWT, phiên gọi và membership. Client/bridge loại kết quả không khớp nguồn đã khóa.
- Whisper được truyền `language=vi/en/zh` trên từng request. `--language auto` trong startup là fallback chung của whisper-server, không phải chế độ PCM hiện tại. API upload HTTP cũ vẫn hỗ trợ Auto để tương thích.
- Khóa nguồn giảm việc tự đoán ngôn ngữ; không giới hạn Whisper còn hai bộ trọng số và không bảo đảm chép đúng âm/từ theo mọi giọng.

## Model và runtime sau phản hồi tốc độ

Đã thử `medium-q5_0` rồi quay lại `base-q5_1` theo yêu cầu người dùng, giữ khóa A ⇒ B. Hiện chỉ dùng một model ASR đa ngữ base cho en/vi/zh. Qwen, CT2, VAD, decoder và protocol PCM không đổi trong rollback.

Các default trong `compose.yaml`, `compose.gpu.yaml`, `ai-service/whisper/start.sh` đều là `base-q5_1`. Đây cũng là giá trị trước lần thử medium, nên các file cấu hình này có thể không còn diff so với Git HEAD.

Đã build/recreate frontend, backend và AI local của project `shrimple` để áp dụng khóa ngôn ngữ; sau đó chỉ recreate Whisper để rollback. Không tác động project `qtmshrimple`, không xóa model cache, chưa commit/push/deploy cloud.

```powershell
$env:WHISPER_MODEL='base-q5_1'
docker compose -p shrimple up -d --no-deps whisper
```

Đối chiếu runtime:

- Model: `/models/ggml-base-q5_1.bin`; CPU, `--threads 2`, `--no-gpu`.
- SHA-256: `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898`, đúng giá trị allowlist trong start.sh.
- Compose CPU và CPU+GPU override: `config --quiet` pass. GPU chưa chạy thực tế.
- `sh -n /usr/local/bin/start-whisper` trong container: pass.
- AI health `mode=pcm`: HTTP 200, `ready`.

## Kiểm tra đã chạy

Các kết quả bên dưới là lịch sử kiểm tra trước bàn giao. Theo yêu cầu dọn file test, đã xóa ba file test mới và script harness/probe tạm ngày 2026-11-02; các lệnh test tương ứng trong bảng không còn chạy được trên bản source sau cleanup. Giữ kết quả và bằng chứng trong tài liệu, không diễn giải chúng như test suite hiện có.

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| `node --test client/test/translationLanguagePair.test.mjs server/test/translationLanguageLock.test.js` | 10/10. Sáu cặp direct/group, self B/B, swap, giữ note, start ACK cũ, nguồn sai, từ chối Auto và kiểm tra membership bằng mocks. |
| `ai-service/test_language_lock.py` trong AI container | 5/5. Config WebSocket và truyền nguồn cụ thể tới Whisper; mock pipeline/HTTP, không đo chất lượng model. |
| ESLint các file UI/transport/i18n được sửa | Pass: TranslationNotes.jsx, translationStream.js, translationPcmSocket.js, i18n.js. |
| `npm --prefix client run build` | Pass; còn cảnh báo bundle lớn hơn 500 kB. |
| Browser component harness | Bốn trường hợp: 1280 px dark/vi/direct; 1280 px light/en/direct; 375 px dark/zh/group; 320 px light/vi/group. Không JS error hoặc tràn chiều ngang; select/swap/Tab và sáu cặp dùng nguồn cố định. Socket và health được giả lập. |
| Live AI WebSocket sau rollback | Auto bị trả 400 với cả translate true/false; en/vi, vi/zh, zh/en và self vi/vi nhận ready. Probe PCM en→vi có final và bản dịch, không error. |

[Kết quả browser](./assets/2026-11-02-language-lock/browser-checks.json), [desktop](./assets/2026-11-02-language-lock/desktop-dark.png), [mobile](./assets/2026-11-02-language-lock/small-mobile.png).

Probe live dùng tiếng Anh tổng hợp FFmpeg flite “Can you hear me”, PCM phát theo gói 128 ms, giữ kết nối bằng im lặng để chờ dịch. Kết quả base: final `Can you hear me?`, revision 3; bản dịch `Anh có nghe tôi nói không?`; từ bắt đầu phát tới nhận đủ kết quả 2.713 s, không error. Lượt medium trước rollback với cùng probe và nguồn en cố định: 4.899 s. Hai lượt đơn lẻ gồm thời gian phát gói, không phải benchmark, độ trễ thuần inference hoặc độ trễ WebRTC.

[Evidence base](./assets/2026-11-02-language-lock/live-base.json). Các số đo medium trước khóa nguồn được giữ riêng như [lịch sử thử nghiệm](./2026-11-02-whisper-medium-trial.md).

## Báo cáo và sequence diagram

[Word kiến trúc cập nhật](../Tai-Lieu-Kien-Truc-Ky-Thuat-He-Thong-Shrimple.docx) dùng A4, Times New Roman, đen trắng và bảng xám nhạt. Model hiện tại là base; medium chỉ còn trong lịch sử thử nghiệm.

Luồng xử lý trực tiếp chia thành hai hình trên trang ngang:

1. Health lặp mỗi 3 s khi loading, tối đa 10 phút; lặp mở stream theo người nói; nhánh quyền/cấu hình sai hoặc hợp lệ; stop/cleanup và mở lại sau visible/reconnect.
2. `par` thu PCM, ASR và dịch; `loop` gói 128 ms/ACK/VAD; `loop` snapshot partial/final; `opt` retry final tối đa một lần; `loop` dịch final remote; cập nhật theo revision và lỗi từng đoạn.

Nguồn vector: [khởi tạo](./assets/2026-11-02-language-lock/sequence-setup.svg), [PCM/ASR/dịch](./assets/2026-11-02-language-lock/sequence-runtime.svg). Hai trang tương ứng mô tả cùng một stream, không phải hai pipeline thay thế.

Đã render bằng LibreOffice theo quyền người dùng đã cấp và xem đủ 10 trang; trang 5–6 nằm ngang. DOCX hợp lệ, 9 bảng, 3 hình; ảnh render đều thang xám, font sơ đồ có đủ glyph. Bản trước được giữ trong `output/translation-language-lock-2026-11-02/architecture-before.docx`; file Word gốc `Tai-Lieu-Tinh-Nang-Translate-Shrimple.docx` được giữ. Audit và PDF/PNG QA: `output/translation-base-rollback-2026-11-02/`. SHA-256 bản giao: `a6071dd87d60ffd1ad084994accc809bad2b6e7a5b4ff8f969c12427ec23bab5`.

## Giới hạn

Chưa chạy cuộc gọi thật với mic/WebRTC, audio Việt Bắc–Trung–Nam, tiếng Trung, nhóm đa ngôn ngữ hoặc nhiều speaker đồng thời; chưa chạy GPU. Browser harness không chứng minh cuộc gọi nhiều thiết bị. Không chạy toàn bộ test của ứng dụng hoặc DB integration trong đợt này. Kết quả config và mẫu tiếng Anh không xác nhận chất lượng Việt/Trung hay độ đúng ngữ nghĩa. Guard chống lặp và retry không xác minh từng từ; lời gốc sai vẫn có thể dẫn đến dịch sai.

## Cập nhật sau đó: GPU kết hợp CPU

Giữ base-q5_1 và khóa A ⇒ B; đã kích hoạt Whisper CUDA trên GPU, VAD/CT2/Qwen trên CPU. Các phép đo CPU trước đó ở trên là lịch sử. Xem [kiểm chứng GPU/CPU và Word mới](./2026-11-02-translation-gpu-cpu.md). Phần chưa chạy GPU ở giới hạn phía trên mô tả đợt rollback trước khi chuyển profile.
