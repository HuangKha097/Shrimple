# Shrimple client

Frontend React 19 + Vite 7 của Shrimple: chat, feed, video, hồ sơ, cài đặt,
WebRTC và Anti-Peep. Code dùng JavaScript ESM, Zustand và Sass Modules.

## Chạy và kiểm tra

Từ thư mục `client/`:

```powershell
npm ci
npm run dev
npm run lint
npm test
npm run build
```

Tạo `.env.development` từ `.env.example` theo [hướng dẫn gốc](../README.md).
Các biến `VITE_*` được đưa vào bundle trình duyệt; chỉ chứa cấu hình công khai.

## Tài liệu dự án

- [PRD](../docs/prd.md): yêu cầu và hành vi sản phẩm.
- [Kanban](../docs/kanban.md): trạng thái và bằng chứng ticket.
- [Thiết kế](../docs/design.md): màn hình, token, luồng và trạng thái UI.
- [Kế hoạch kỹ thuật](../docs/plan.md): kiến trúc, API, dữ liệu và vận hành.
- [Hướng dẫn agent](../AGENTS.md): quy tắc thay đổi và kiểm tra.

Anti-Peep dùng model tại `public/models/human/`; không xóa các cặp JSON/BIN.
Unit tests hiện tập trung vào tracker Anti-Peep; chưa thay thế nghiệm thu
giao diện, camera hoặc cuộc gọi trên thiết bị thật.
