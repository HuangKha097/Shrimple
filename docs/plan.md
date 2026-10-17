# Plan — Shrimple: kiến trúc baseline và thứ tự hoàn thiện

Cập nhật: **2026-10-08**. Trạng thái: baseline đã triển khai; roadmap dưới đây là đề xuất để khép gaps, không phải lịch phát hành đã được duyệt. Tài liệu thường trực này nằm ở `docs/plan.md` theo yêu cầu người dùng; kế hoạch theo phiên/phase tiếp tục nằm trong `plans/`.

## Mục lục

1. [Đầu vào và nguyên tắc](#1-đầu-vào-và-nguyên-tắc)
2. [Stack và ranh giới](#2-stack-và-ranh-giới)
3. [Môi trường và lệnh](#3-môi-trường-và-lệnh)
4. [Baseline hoàn thành](#4-baseline-hoàn-thành)
5. [Roadmap](#5-roadmap)
6. [Dependency và exit gates](#6-dependency-và-exit-gates)
7. [Kiểm tra và phát hành](#7-kiểm-tra-và-phát-hành)
8. [Quản lý rủi ro](#8-quản-lý-rủi-ro)

## 1. Đầu vào và nguyên tắc

- [PRD](./prd.md) xác định FR/BR/AC từ code và phân biệt mục tiêu với giới hạn.
- [Design](./design.md) ghi layout, tokens, models, routes và flow thực tế.
- [Kanban](./kanban.md) quản lý ticket, dependency, evidence và trạng thái.
- [Validation](./validation/codebase-cleanup.md) lưu kết quả chạy đợt cleanup.
- [Group roles](./group-roles.md) là tham chiếu chi tiết quyền nhóm/lời mời hiện có.
- [Codebase summary](./codebase-summary.md) hỗ trợ định vị module; [AGENTS](../AGENTS.md) hướng dẫn làm việc.

KaZhen chỉ làm mẫu cấu trúc. Tài liệu/plan cũ là dữ liệu tham khảo, không mặc nhiên là yêu cầu người dùng mới. Các kế hoạch `plans/260922-anti-peep-adaptive-gaze/` và `plans/261008-group-roles/` giữ lịch sử; trạng thái phải đối chiếu code/test mới nhất, không dùng checklist cũ để suy ra production acceptance.

Không ấn định deadline/estimate, provider mới hoặc release scope khi chưa có quyết định. Ưu tiên khép quyền và data lifecycle trước thêm tính năng.

## 2. Stack và ranh giới

Các phiên bản dưới đây là range từ package.json, không khẳng định số patch đang cài trên mọi máy.

| Layer | Baseline |
| --- | --- |
| Client | React `^19.1.1`, Vite `^7.1.7`, React Router `^7.9.5`, Zustand `^5.0.8`, Axios `^1.13.1` |
| UI | Sass `^1.93.3`, motion `^12.43.0`, GSAP `^3.15.0`, Lucide, Sonner, React Hook Form/Zod |
| Realtime/media | Socket.IO client/server `^4.8.1`, simple-peer `^9.11.1` |
| Vision | `@vladmandic/human ^3.3.6`, Human models phục vụ trong client/public |
| API | Node ESM, Express `^5.1.0`, Mongoose `^8.19.2`, MongoDB |
| Security/integrations | JWT, bcrypt, Google Auth Library, Nodemailer, Multer, Cloudinary |
| Optional ML | Python + joblib/Pyvi/NumPy/scikit-learn; training thêm pandas/openpyxl |
| Test/tooling | ESLint 9, node:test, mongodb-memory-server; không có test runner browser cấu hình được xác nhận |

Dockerfiles client/server dùng Node 22 alpine. Client container chạy Vite dev server, backend cài python3/py3-pip nhưng chưa cài các thư viện ML, nên compose không chứng minh classifier đã sẵn sàng. Repo không có root package.json; chạy scripts theo client/server.

Các ranh giới giữ ổn định:

1. UI → stores/services → Axios/Socket; không đưa secret server vào VITE_*.
2. API route → authentication/membership → controller → model/helper; quyền backend không tin CTA bị ẩn trên UI.
3. Media upload → local temp → Cloudinary; browser dùng URL, không có proxy private media đã hoàn chỉnh.
4. WebRTC media peer-to-peer; backend signaling/presence và MongoDB history riêng nhau.
5. Anti-Peep inference ở browser, enrollment lưu backend; giữ data privacy đúng ranh giới này.
6. Python classifier là tiến trình con, phải kiểm soát failure/timeout trước khẳng định dependable.

Chi tiết data/API không lặp ở Plan: dùng [Design](./design.md) để tránh hai contract mâu thuẫn.

## 3. Môi trường và lệnh

### 3.1. Cài/chạy

Từ root repo, sau khi cấu hình `.env` cục bộ dựa vào `.env.example`:

```powershell
npm --prefix client ci
npm --prefix server ci
```

Trong terminal backend với working directory `server/`:

```powershell
npm run dev
```

Trong terminal frontend với working directory `client/`:

```powershell
npm run dev
```

Scripts này có thật trong package.json. Backend phải dùng cwd `server/` vì upload và Python script lấy đường dẫn tương đối. Khởi chạy toàn stack phụ thuộc MongoDB/env và dịch vụ tích hợp; đợt cleanup chưa nghiệm thu live startup với toàn bộ dịch vụ thật. Hướng dẫn đầy đủ ở [README](../README.md).

### 3.2. Cấu hình đã xác minh

| File mẫu / module | Keys / trách nhiệm |
| --- | --- |
| `client/.env.example`, `client/src/config/env.js` | VITE_API_URL, VITE_SOCKET_URL, VITE_ASSET_BASE_URL, VITE_GOOGLE_CLIENT_ID |
| `server/.env.example` | PORT, CLIENT_ORIGINS, MONGODB_CONNECTIONSTRING, optional MONGODB_DNS_SERVERS, ACCESS_TOKEN_SECRET, CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET, GOOGLE_CLIENT_ID, EMAIL_SERVICE/USER/PASS, optional EMAIL_HOST/PORT/SECURE |
| `server/src/controllers/authController.js` | NODE_ENV chi phối secure/SameSite cookie; deployment phải cấp đúng, key này chưa liệt kê trong server env sample |
| `compose.yaml` | client/.env.development, server/.env; ai-service/init-env.ps1 tạo ai-service/.env dùng chung cho backend+ai; ports5173/5001/loopback8001; ai/whisper/qwen, Mongo bên ngoài |

Development API/socket mặc định localhost:5001. Production API fallback là cùng origin (config chuyển `/` thành chuỗi rỗng), còn socket/assets có fallback host Render trong code. Cần đặt env production rõ; không giả định REST và socket tự cùng host nếu thiếu cấu hình. Hai Google Client ID frontend/backend phải khớp audience.

### 3.3. Lệnh xác minh

```powershell
npm --prefix client run lint
npm --prefix client test
npm --prefix client run build
npm --prefix server test
```

Backend test dùng MongoDB tạm. Khi đã có binary cache workspace, cách chạy không tải mạng nằm trong [validation](./validation/codebase-cleanup.md); không bật env runtime-download=false trên máy chưa có binary. `npm --prefix client run preview` chỉ preview bundle, không tạo API/backend production. Không có `npm test` root hoặc `npm --prefix server run lint` hiện tại.

## 4. Baseline cleanup trước pull

| Nhóm | Ticket Done | Evidence hiện có |
| --- | --- | --- |
| Auth/profile/friends/block | I01–I06 | Code route/controller/schema/service/UI |
| Chat/media/message actions | I07–I09 | Code; suite groups kiểm tra quyền API một phần |
| Group roles/invite/QR | I10–I11 | Code + tests groups, QR browser chưa nghiệm thu |
| 1:1/group calls | I12–I13 | Code; socket group permissions có tests; media chưa device test |
| Posts/interaction/search/video | I14–I16 | Code; quyền direct read/interaction còn gap P0 |
| Notification/preferences/theme/i18n | I17–I18 | Code; sound/desktop delivery, dịch/tokens còn gap |
| Anti-Peep/ML/account endpoint | I19–I21 | Tracker unit tests; camera/ML/runtime/data deletion chưa hoàn chỉnh |
| Cleanup và docs | M01–M02 | Lint/build/tests/syntax/static graph + tài liệu |

Kết quả đợt cleanup: client lint 0 errors/7 warnings, tracker 8/8, client production build pass, server groups 10/10 bằng cache local, server syntax pass, diff check pass. Review độc lập chưa tìm regression do cleanup. Chi tiết command/cảnh báo và phạm vi ở [validation](./validation/codebase-cleanup.md). Không có browser/WebRTC/camera/production acceptance.

## 5. Roadmap

### Phase 0 — Baseline/tài liệu (Done về đợt bảo trì)

Ticket: QS-M01, QS-M02. Giữ nguyên các thay đổi nhóm đã có trong working tree; loại dư thừa qua evidence graph/reference, không xóa chỉ vì export không có import hoặc model là binary. Exit: build/tests chạy lại, không broken reference, docs đúng code; không còn source unreachable trong graph đã kiểm tra. Warnings/gaps chuyển ticket riêng.

### Phase 1 — Khép privacy và lifecycle (Backlog, P0)

Ticket: QS-B01, QS-B02, QS-B03, QS-B05; hỗ trợ QS-B10/QS-B11/QS-B12 khi liên quan.

1. Chốt policy đọc/tương tác post và visibility DTO profile.
2. Viết regression stranger/friend/blocked/owner trước sửa policy chung.
3. Đồng nhất whoCanMessage/direct/forward/caller identity với auth server; xử lý legacy stub endpoint có response hoặc deprecate rõ.
4. Quyết định delete account cascade/ẩn danh/retention; revoke session/socket, sửa text UI theo policy.
5. Kiểm tra group/member/delete races và multi-step data changes; chọn transaction hoặc recovery phù hợp Mongo deployment thực tế.

Exit: QS-Q02 phần quyền/dữ liệu đạt, không endpoint direct vượt privacy, không data/session tồn dư trái policy. Đây là điều kiện trước tuyên bố app có privacy đầy đủ.

### Phase 2 — Reliability/media/integration (Backlog, P1)

Ticket: QS-B04, QS-B06, QS-B10, QS-B11, QS-B12, QS-B13.

1. Shared-media filters tôn trọng recall/delete-for-me.
2. Validate file content/URL/duration, dọn temp/Cloudinary khi lỗi.
3. Python error/timeout/JSON contract, process cleanup và heuristic messaging.
4. Refresh single-flight, phân biệt PIN invalid với auth expired, auth/OTP replay/session tests.
5. Pagination timestamp ties/limit và reconnect/cache contract; giữ single-instance scope cho room RAM tới khi có scaling design.

Exit: fault tests không crash/treo/leak file hoặc vượt quyền; MongoDB test isolation; error phản hồi đủ để UI rollback. Không đổi fallback policy của classifier âm thầm.

### Phase 3 — Hoàn thiện trải nghiệm (Backlog, P1/P2)

Ticket: QS-B07, QS-B08, QS-B09, QS-B14.

1. Chốt desktop notification/sound delivery hoặc sửa nhãn theo capability.
2. Chuyển hardcode nền/màu về tokens, dịch các luồng chính vi/en/zh.
3. Audit keyboard/focus/labels/reduced motion và responsive từng màn.
4. Nối avatar nhóm từ preview tới upload/persist; error/cancel cleanup.

Exit: browser matrix QS-Q01 các phần UI tương ứng; reload giữ state đúng; không hứa tác dụng chưa triển khai. Không tự thêm skin/design system/library mới khi chỉ cần đồng nhất components hiện có.

### Phase 4 — Nghiệm thu/vận hành (Backlog)

Ticket: QS-Q01, QS-Q02, QS-Q03. Chuẩn bị >=2 user/browser và thiết bị camera/mic thực; kiểm tra direct/group calls, screen share, NAT/reconnect; enrollment/false locks; denied permissions/hidden tab/logout. Thử backup/restore và cấu hình deployment theo provider người dùng chọn. Đo performance có workload rõ; triage chunk warnings.

Exit: các AC cần thiết trong PRD có evidence, P0 đóng, release decision được người dùng xác nhận. Không deploy/commit/push/merge chỉ vì đến phase cuối.

## 6. Dependency và exit gates

```text
Baseline M01/M02
  ├─ B01 + B02 + B03 ──────────────┐
  ├─ B05 + B10 + B11 + B12 ── Q02 ├─ Q03 release gate
  └─ B04/B06/B07/B08/B09/B13/B14 ─ Q01
```

Phase có thể xen kẽ khi không cùng file/contract; quyền/data lifecycle là dependency bắt buộc của nghiệm thu cuối. Group avatar không chặn sửa privacy; UI theme không chặn API tests. Nếu nhiều người cùng làm, thống nhất file ownership và contract trước, không ghi đè thay đổi của nhau.

| Gate | Điều kiện | Evidence phải giữ |
| --- | --- | --- |
| G-BASE | Code cleanup/docs đúng working tree; tests/build cần thiết pass | Validation command/exit, reference check |
| G-SEC | B01/B02/B03/B05 và security regression đạt | API matrix + failure/replay/cascade tests |
| G-REL | Media/refresh/classifier/group consistency không treo hoặc lộ data | Unit/integration fault tests |
| G-UX | Các flow chính mobile/desktop + a11y + camera/calls có walkthrough | Browser/device/permission/network steps |
| G-OPS | Provider/env/TLS, backup/restore, benchmark và release decision | Report số liệu và quyết định riêng |

G-BASE đạt ở phạm vi cleanup; những gate còn lại chưa được tuyên bố đạt.

## 7. Kiểm tra và phát hành

Chỉ chạy kiểm tra cần thiết cho thay đổi, không lặp bộ test đã pass khi không có code/failure mới. Quyền tài nguyên/identity/data deletion cần regression; pure docs cần link/path/ID/LOC checks. Client test hiện chỉ tracker, server test hiện groups và direct translation session; phải thêm suite đúng module trước kết luận coverage toàn hệ thống.

Deployment checklist dự thảo:

- Chốt origin/frontend/backend và VITE_API/SOCKET/ASSET; SPA rewrite cho route alias và invite deep link.
- NODE_ENV production, TLS và cookie credentials/SameSite đúng; CORS allowlist cụ thể.
- DB indexes/backup/restore, Cloudinary/email quota/error handling; không log secrets hoặc enrollment.
- Python runtime/model packages/version tương thích nếu giữ classifier; Docker hiện chưa cài deps ML.
- Room RAM/single instance, NAT/TURN khả năng thực, load/concurrency đo trước scaling.
- Chỉ thu thập analytics được đồng ý và minimization dữ liệu; không gán SLA chưa đo.

Đây là tiêu chí chuẩn bị, không phải xác nhận app đã deployed hoặc bộ cấu hình production được thử.

## 8. Quản lý rủi ro

Đợt chạy thử 2026-10-17 đã sửa ChatInput Hooks/Fast Refresh, username friend DTO
và mô tả xóa tài khoản; server 21/21, client 8/8, lint/build pass trong phạm vi
[evidence](./validation/2026-10-17-project-smoke.md). Có U cục bộ cho các luồng
chat/mention/feed/settings mobile được liệt kê; vẫn giữ gates privacy, delete
lifecycle, thiết bị/WebRTC/email/AI và production bên dưới.

Cleanup tiếp theo trong ngày giảm lint còn 3 warnings, bỏ dependency/style/audio
prototype không dùng và giữ test hồi quy; [evidence](./validation/2026-10-17-cleanup-push.md).
Không thêm dependency vào lifecycle CallModal/TreeQRCodeModal chỉ để tắt warning;
giữ việc kiểm chứng media/scene trong gate thiết bị tương ứng.

| Rủi ro đã xác minh | Biện pháp / theo dõi |
| --- | --- |
| Privacy ngoài list chưa đầy đủ | B01/B02, block release privacy claims |
| Data deletion và group nhiều bước | B05/B12, policy + tests + recovery |
| Python process thiếu timeout/error | B06, test không có interpreter/model |
| Media URL public/validation rộng | B04/B11, data access policy rõ |
| Chưa có TURN/SFU được xác nhận, room RAM | Q01/Q03/B13, thử mạng/giới hạn scope |
| Anti-Peep heuristic không liveness | I19/Q01, đánh giá tình huống thật và text kỳ vọng đúng |
| Bundle main/Human lớn | Q03, đo và tách tối ưu riêng, không che warning bằng tăng threshold |
| Hook deps warnings còn lại | Review lifecycle từng warning; không disable rules hàng loạt |

Mỗi phase hoàn tất cập nhật ticket/FR/AC/evidence thay vì tạo bản copy PRD rời rạc. Scope thay đổi cần nêu rõ delta và lý do; không tự nâng roadmap đề xuất thành cam kết.

## Đồng bộ sau pull

Upstream bổ sung delegated admin/add/role/leave, poll, TreeQR scan/preview và note dịch cuộc gọi. [Group roles](./group-roles.md) là authority cho ma trận role/invite/poll; [Design](./design.md) ghi translation proxy/service/session. Ticket mới I22/I23 Done về triển khai, board42tickets25Done17Backlog; không thêm scope phát hành/commit/deploy.

Dependencies mới: server TRANSLATION_AI_URL/KEY; `ai-service/` FastAPI, whisper.cpp/Qwen endpoints và ffmpeg. `server/package.json` test bao gồm test/ + tests/; `test:ai` là smoke script cho dịch vụ đang chạy, chưa chạy trong đợt xử lý conflict. Không đồng nhất node:test session pass với dịch AI output hoặc vận hành GPU/models.

Q01 thêm poll/QR64+24hex/login retention, incoming group call và note dịch2browser; Q02 thêm poll caps/races, quyền upload audio/viewer/speaker và end/disconnect; Q03 thêm AI readiness/latency/consent/retention/logging. Hợp nhất code xong cần kết quả checks tree cuối ở [validation sau pull](./validation/pull-conflict-resolution.md); evidence cleanup trước pull không bị ghi đè.

Compose upstream đã khai báo frontend/backend/ai/whisper/qwen; backend trỏ http://ai:8001, AI trỏ whisper/qwen:8080. Whisper build dùng Dockerfile.cuda và GPU NVIDIA reservation; Qwen image pinned digest/model Qwen3-1.7B-GGUF Q8_0. Có model-cache volumes, AI port bind127.0.0.1:8001. Đây là cấu hình source, chưa chạy compose/model download/health trong đợt conflict. Lệnh test tree cuối: server20/20, client8/8, lint0errors8warnings, build pass18,68s; xem validation mới.
