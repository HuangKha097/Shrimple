# Chữ gốc vẫn bị Qwen giữ chân

**Date**: 2026-10-17 20:02
**Severity**: High
**Component**: TranslationNotes / proxy dịch / AI service
**Status**: Resolved — lỗi điều phối; độ trễ thực còn chưa đo

## What Happened

QS-I23: yêu cầu là ghi lời đối phương trước, dịch phía dưới sau. Bản đầu đã trả transcript trước translation nhưng vẫn giữ chung slot inference và chờ request dịch kết thúc mới gửi clip tiếp. Review bắt được lỗi: đổi định dạng response chưa giải quyết nghẽn.

## The Brutal Truth

Khó chịu nhất là giao diện trông nhanh hơn trong khi Qwen vẫn chặn chữ gốc tiếp theo. Chúng ta sửa thứ tự hiển thị rồi tưởng đã sửa lịch xử lý. Test một clip không thể chứng minh luồng hội thoại liên tục.

## Technical Details

`ai-service/app.py` tách `stt_slot` và `text_translation_slot`; nhả STT trước event `transcript`. Dịch bận trả `429` / `Translation is busy` sau chữ gốc. `translationQueue.js` giới hạn hai request mở mỗi nguồn, một job chờ STT và một clip mới nhất chờ; nhận transcript thì cho clip sau chạy.

Chỉ thu audio remote. Anh→Việt nghĩa là đối phương nói Anh, viewer đọc Việt; Việt→Anh ngược lại. Đổi chiều hủy recorder/request cũ.

Kết quả cuối phiên: AI 31/31; server 42/42; client mới 17/17 và tracker 8/8; lint 0 errors/3 warnings có sẵn; build pass 3509 modules. Browser fixture dùng component thật, audio/API giả lập chứng minh original 2 đến trước translation 1 và cleanup. Chưa đo mic/model/GPU thật; Docker daemon tắt.

## What We Tried

Stream chữ gốc trước giúp một clip xuất hiện sớm, nhưng khóa chung và client tuần tự vẫn chặn clip sau. Giảm clip từ 6 xuống 2 giây chỉ giảm thời gian gom audio; không chữa nghẽn đó.

## Root Cause Analysis

Chúng ta kiểm tra thứ tự event, bỏ sót quyền chạy của STT kế tiếp khi dịch còn treo. Hai tầng AI và client đều tuần tự hóa quá mức.

## Lessons Learned

Chọn tách slot và hàng chờ hữu hạn; bỏ cách giữ khóa đến hết dịch. Khi dịch bận, giữ chữ gốc và bỏ bản dịch đoạn đó. Cần test nhiều clip chồng nhau. Clip 2 giây vẫn chưa là nhận dạng từng từ hoặc SLA 1–2 giây.

## Next Steps

Owner triển khai dịch cần benchmark p50/p95, chất lượng tiếng Việt và tải nhiều nguồn trước nghiệm thu tốc độ. Owner QA cần thử WebRTC hai thiết bị, mic và CPU/GPU theo QS-Q01/Q02/Q03 trước release. Xem [evidence](../validation/2026-10-17-translation-progressive.md). Working tree chưa commit.
