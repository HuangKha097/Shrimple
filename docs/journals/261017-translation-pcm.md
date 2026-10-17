# PCM đã chạy; inference vẫn vượt mục tiêu 1–2 giây

**Date**: 2026-10-17 20:35  
**Severity**: High  
**Component**: TranslationNotes / Socket.IO bridge / Silero VAD / AI lanes  
**Status**: PCM hoàn tất; mục tiêu latency còn mở

## What Happened

QS-I23 / FR-23 chuyển audio đối phương sang AudioWorklet: PCM mono 16 kHz, 2048 samples/gói, mỗi 128 ms. Silero VAD giữ pre-roll 256 ms, chốt sau 320 ms im lặng. Chữ gốc cập nhật cùng note trước `Translating...`; dịch ghép đúng revision cuối. Đường PCM bọc WAV trong RAM, bỏ decode FFmpeg từng clip.

## The Brutal Truth

Thật bực khi transport đã liên tục mà người dùng vẫn phải chờ. Mẫu JFK công khai 2 giây trên CPU local cho partial ở 4467 ms, final 7437 ms, dịch 16779 ms. Mục tiêu 1–2 giây chưa đạt; packet nhỏ không cứu được inference chậm.

## Technical Details

Review bắt hai race: `pcm_stream.py:recognize()` bỏ kết quả partial đang chạy khi final vừa xếp hàng; `translationPcm.js` giải phóng quota trước khi Mongo lookup bị hủy thực sự settle. Đã giữ partial hoàn tất hợp lệ và reservation đến lúc lookup settle. Regression dùng barrier và 100 lần start trùng để kiểm chứng.

Client 40, server 72, AI 55 tests pass; lint 0 errors/3 warnings có sẵn; build pass. Browser chạy AudioWorklet thật với audio tổng hợp, event nhận dạng giả lập. Live AI kiểm tra model thật riêng. Không dùng audio riêng tư hoặc log secret; working tree chưa commit.

## What We Tried

Progressive HTTP tách ASR/dịch nhưng vẫn gom clip 2 giây và gọi decoder. Chọn PCM + VAD để bỏ khoản chờ đó; giữ HTTP cũ tương thích. ASR và dịch chạy lane riêng, queue hữu hạn, partial chờ giữ bản mới nhất; ưu tiên final. Không thay engine vội khi chưa benchmark phần inference.

## Root Cause Analysis

Thiết kế cũ buộc UI chờ clip; inference CPU tiếp tục là nút thắt sau khi bỏ clip. Hai race xuất phát từ việc coi “đã xếp final” là “partial hết giá trị”, và coi “đã hủy stream” là “Mongo ngừng chạy”. Cả hai giả định đều sai. Test tuần tự trước review không ép được những thời điểm này.

## Lessons Learned

Đo transport, ASR, dịch riêng. Hủy await không hủy công việc đồng bộ hoặc database đang chạy. Quota phải đếm công việc thực; kiểm thử race cần barrier.

## Next Steps

AI owner benchmark Whisper/Qwen theo CPU/NVIDIA trước khi cam kết latency. GPU hiện là opt-in; chưa có tự phát hiện/failover. QA kiểm tra WebRTC hai thiết bị, Anh/Việt, noise, leave/rejoin và nhiều nguồn trước nghiệm thu. Integration owner ghi evidence tại [PCM validation](../validation/2026-10-17-translation-pcm.md); Q01/Q02/Q03 và consent/retention/logging vẫn mở.
