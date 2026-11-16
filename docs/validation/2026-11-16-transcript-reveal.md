# Live transcript reveal — 16/11/2026

Phạm vi: QS-I23 / FR-23, presentation frontend. Không sửa backend/AI,
API/socket contracts, capture, reducer/revision hay logic nhận dạng/dịch.
Working tree có thay đổi AI/training/docs từ trước; giữ nguyên, không commit/push.

## Thay đổi

- `client/src/components/chat/TranscriptText.jsx`: nhận snapshot `original`, hiện
  từ mới bằng fade nhẹ, giữ key của từ khớp theo thứ tự qua interim edits. Phần
  đã thấy được sửa tại chỗ; đuôi mới tiếp tục animation trên snapshot mới nhất.
  Không xếp hàng bản interim cũ hoặc nối chuỗi nhận dạng.
- Nhịp dựa độ dài từ/dấu câu. Khi dồn chữ, rút nhịp và dùng batch nhỏ để đuổi kịp
  trong ngân sách animation khoảng800ms, không gia hạn ngân sách mỗi update.
  Đây không phải cam kết latency nhận dạng/network hoặc timer dưới tải thực.
- Cursor ở cuối phần đang hiển thị; nháy khi interim/còn chữ chờ, bỏ khi final
  đã hiện đủ hoặc bị ngắt/lỗi. Reduced motion hiện ngay, cursor tĩnh; đổi preference
  lúc đang chạy flush phần chờ, bật motion lại không chạy lại chữ cũ.
- Hidden tab/ngắt hiển thị hết phần đã nhận, không giữ timer chạy ngầm; unmount
  dọn timer/listeners. Đóng/mở Note không chạy lại lịch sử. Clear/đổi phiên không
  làm chữ cũ xuất hiện từ callback trễ.
- `TranslationNotes.jsx`: chỉ tích hợp renderer, ghi nhớ lịch sử đã đóng và cuộn
  danh sách. Theo cuối khi cách đáy<48px; giữ vị trí đọc lại, về đáy thì theo tiếp.
  Bố cục, controls, dòng dịch và cơ chế stream vẫn như cũ.
- `TranslationNotes.css`: fade/cursor dùng màu chữ hiện có; snapshot truy cập
  nằm ngoài subtree animation `aria-hidden`, tránh đọc từng tick của animation.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm --prefix client run lint` | Pass, không warning/error |
| `npm --prefix client run build` | Pass; vẫn có cảnh báo chunk>500kB |
| `node --test server/test/directCall.test.js server/test/groupTranslation.test.js` | 14/14 pass; chỉ chạy test hiện có, không sửa source/test backend |
| `node client/test/browser/transcriptReveal.mjs` | Pass, 11 nhóm tình huống trong Chrome/React StrictMode |
| `git diff --check` | Pass |

Browser regression dùng real React/CSS/timer/scroll, transcript giả và mocked
health/capture/transport; không đọc `.env`, dùng credentials, mic hoặc gọi AI/backend.
Chrome cần chạy ngoài filesystem sandbox vì crash handler bị chặn trong sandbox.

Các nhóm: append/DOM identity/accessibility; interim insert/delete/replace;
shortened interim/final trong animation; 199 từ cập nhật dồn và liên tục; Việt/Unicode/
từ lặp/khoảng trắng/newline; interruption/hidden/unmount/history; đổi reduced motion
đang chạy; bật motion lại; scroll theo chữ/đọc lại/theo tiếp; translation tới khi
original còn hiện dần và giữ focus bàn phím; clear/reopen/session reset.

Đã xem ảnh desktop dark1280×900 và mobile light390×844; kiểm tra thêm custom accent
trên mobile. Không overflow panel/text; cursor theo màu chữ. Fixture light thay CSS
tokens để kiểm renderer, không thêm theme hay đổi chính sách theme của app.
Ảnh và kết quả: [assets](./assets/2026-11-16-transcript-reveal/result.json),
[desktop](./assets/2026-11-16-transcript-reveal/desktop-dark.png),
[mobile](./assets/2026-11-16-transcript-reveal/mobile-light.png),
[custom accent](./assets/2026-11-16-transcript-reveal/mobile-custom.png).

Không nghiệm thu mic/WebRTC, chất lượng ASR/MT, tải nhiều speaker hoặc production.
Không chạy full server/AI suites vì không sửa những lớp đó. Q01/Q03 giữ nguyên gate.
