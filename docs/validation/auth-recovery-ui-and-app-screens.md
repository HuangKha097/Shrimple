# Auth recovery UI và ảnh các màn chính

Ngày 2026-10-15. Phạm vi QS-I03 / FR-03; ảnh thực tế hỗ trợ QS-Q01, không đóng nghiệm thu toàn app.

## Thay đổi

- `ForgotPasswordPage.jsx` dùng chính stylesheet layout đăng nhập, logo Shrimple, nền SideRays, card, footer, XInput và XButton. Loại bỏ bố cục ảnh hero cũ khỏi trang, giữ asset trong repo.
- Cả ba bước email, OTP và mật khẩu dùng cùng layout; thêm stepper, lỗi inline, focus heading, viền focus CTA và nhãn vi/en/zh trong i18n.
- Giá trị OTP khi quay về email được xóa bằng chuỗi rỗng đúng hợp đồng của OTPInput; trước đây gán array.
- Giữ nguyên endpoint, payload và điều kiện mật khẩu ít nhất 6 ký tự, có chữ và số; không đổi auth service/store/backend.
- Giảm chuyển động: không dựng SideRays và không animate logo khi `useReducedMotion()` bật. Đây là kiểm tra source, chưa giả lập OS reduced-motion trong browser.

## Kiểm tra

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| `npm.cmd --prefix client run lint` | 0 errors / 8 warnings ngoài phần sửa; log `output/app-screens-2026-10-15/logs/client-lint.txt` |
| `npm.cmd --prefix client run build` | Pass, 21.86s; còn mixed static/dynamic import và chunk >500 kB; log cùng thư mục |
| Browser Chrome local | Email → code → form mật khẩu với API giả lập localhost; thiếu mã có lỗi inline; back qua email xóa mã và gửi lại giữ ô mã rỗng |
| Mobile | DOM viewport thực tế 390×844 và 320×800; không có overflow ngang. 320 px cần scroll dọc để xem đủ footer |
| Keyboard | Tab từ email tới CTA; `:focus-visible` true, outline solid; ảnh 19 |
| Production screenshots | Feed, inbox, video, friends, own profile, settings, signin, signup, forgot cũ; chỉ đọc qua phiên có sẵn |

Các ảnh và `manifest.json` chứa URL, thời điểm UTC và môi trường. Ảnh local có API giả lập không chứng minh email thật, OTP thật hoặc reset thành công. Không gửi email, không nhập mật khẩu và không sửa dữ liệu production. Không chuyển cookie/token từ production sang local.

## Trạng thái

Người dùng yêu cầu commit/push qua GitHub để Vercel tự deploy; không cần đăng nhập CLI. Bản source này đã qua lint/build và kiểm tra local nêu trên. Deployment của commit mới và ảnh production được lưu trong manifest/báo cáo khi Vercel Ready; chỉ dùng ảnh có môi trường production để chứng minh UI đã live. Bộ dẫn chứng deployment trước đó trong `output/vercel-report-2026-10-15/` vẫn là lịch sử của commit `1d9bc1eac291b53962bb1dcf7a42957419917b26`.

Chưa kiểm chứng mail delivery, reset mật khẩu thật, reduced motion OS, theme light/custom bằng browser, hay camera/WebRTC/AI trong đợt này. Auth recovery chủ đích giữ bề mặt tối theo signin đang triển khai.
