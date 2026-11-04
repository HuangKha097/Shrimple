# Dữ liệu tiếng Việt và Accent Robustness Benchmark

Cập nhật **2026-11-03** · FR-23 / QS-AI01 · nghiên cứu development, chưa nghiệm thu model.
Người dùng chưa có quyền truy cập Bud500/VLSP hoặc dữ liệu local của hai nguồn này.

Cập nhật sau yêu cầu **train tiếp**: đã bổ sung official ViMD train riêng, không đổi
90valid đã đo, phối hợp VIVOS replay và chạy [vòng fine-tune600steps](./validation/2026-11-03-whisper-accent-training.md).
Các trạng thái valid-only dưới đây mô tả lượt nghiên cứu/benchmark ban đầu; kết quả
train và phạm vi sử dụng nguồn theo report mới, chưa triển khai/phát hành model.

## 1. Kết luận và lựa chọn nguồn

Tăng dữ liệu có thể giảm lỗi ASR khi bổ sung người nói, cách phát âm và điều kiện thu
đang thiếu. Không có bảo đảm “nhiều giờ hơn = thông minh hơn”. Audio trùng, lời chép sai,
lệch miền hoặc một giọng chiếm ưu thế có thể làm kết quả kém đi. Ngay trong dự án,
[bốn lượt development](./validation/2026-11-03-whisper-development.md) chưa vượt base
theo WER validation. Đây là kết quả cấu hình/dữ liệu cụ thể, không chứng minh dữ liệu
lớn vô ích. Fine-tune nhánh này cải thiện **nhận dạng lời nói**; bước dịch văn bản cần
đánh giá riêng, không suy chất lượng dịch từ WER.

| Nguồn đã kiểm tra | Khả năng sử dụng cho đồ án | Điểm phải giải quyết |
| --- | --- | --- |
| [Bud500: kho tác giả](https://github.com/apluka34/Bud500), [dataset](https://huggingface.co/datasets/linhtran92/viet_bud500) | Khoảng 500 giờ audio + transcription, ứng viên mở rộng train | Gated, yêu cầu chia sẻ thông tin tài khoản; schema công bố không có speaker/accent từng mẫu. Metadata CC BY-NC-SA khác đoạn Apache trong README; làm rõ điều kiện dữ liệu |
| [ViMD: paper](https://aclanthology.org/2024.emnlp-main.426/), [dataset](https://huggingface.co/datasets/nguyendv02/ViMD_Dataset) | 102,56 giờ; có region/province/speakerID, phù hợp nhất về metadata cho benchmark vùng | Card CC BY-NC-ND 4.0; đã lấy mẫu valid để đánh giá riêng tư, chưa train hoặc phân phối model. 63 nhãn tỉnh là thiết kế bản phát hành 2024 |
| [VLSP resources](https://vlsp.org.vn/index.php/resources) | Có các bộ ASR qua kỳ challenge, cần chọn đúng bộ | Cần điền/ký phiếu và gửi email, điều kiện theo dữ liệu được cấp. Chưa gửi yêu cầu, chưa có dữ liệu/schema để xác nhận vùng |
| [VietMed](https://huggingface.co/datasets/leduckhai/VietMed) | 16 giờ **có nhãn**, card MIT, có speaker/accent; dùng starter công khai | Miền y khoa; 1.000 giờ y khoa và 1.200 giờ tổng quát khác là **không nhãn**. Card thông báo sửa nhãn tháng 10/2026; pin revision |
| [FLEURS](https://huggingface.co/datasets/google/fleurs), subset vi_vn | Audio + bản lời, CC BY 4.0; ứng viên đánh giá ASR tổng quát độc lập | Schema công bố thiếu speaker/accent; chưa đủ cho benchmark vùng tách người nói. Chưa tải |
| [VietSpeech](https://huggingface.co/datasets/NhutP/VietSpeech) | Công bố hơn 1.100 giờ, ứng viên train lớn | Gated; schema audio/transcription thiếu nhãn speaker/accent. Apache metadata không thay việc rà quyền nguồn audio |
| [GigaSpeech 2](https://huggingface.co/datasets/speechcolab/gigaspeech2) | Khoảng 6.000 giờ Việt refined; phương án weak supervision tương lai | Nhãn train tự động; dev/test người gán nhãn là bộ khác. Gated + điều kiện audio riêng, không coi Apache metadata là toàn bộ thỏa thuận |

Các nhận xét “phù hợp/ứng viên” là đánh giá thiết kế cho dự án từ schema đã xem, không
phải xác nhận độc lập quyền hoặc chất lượng mọi câu. Đã tải VietMed train/dev và
một phần ViMD valid; không chấp thuận gate hoặc chia sẻ tài khoản thay người dùng.
CC BY-NC-ND không tự động cấm đọc để đánh giá: [Section 2 của giấy phép](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en)
cho phép sao chép phi thương mại và tạo bản thích nghi riêng tư, hạn chế chia sẻ bản
thích nghi. Vòng này chỉ giữ dữ liệu local cho nghiên cứu, xuất thống kê; không suy
từ đó quyền dùng thương mại hoặc phát hành model đã train.
Registry lưu revision, gate, licence, hash snapshot và quyết định từng nguồn:
[sources.registry.json](./validation/assets/2026-11-03-accent-benchmark/sources.registry.json).
Số byte toàn repo trong registry không phải dung lượng subset Việt hoặc audio giải nén.

## 2. Benchmark v1: các chiều đánh giá

Ba nhóm chính: `north`, `central`, `south`. `central_highlands` giữ riêng; nhãn Tây Nguyên
không được tự coi là đại diện miền Trung duyên hải. `unknown` giữ nguyên khi thiếu nhãn.
Tỉnh nơi thu/phát sóng không tự chứng minh quê quán hoặc độ nặng giọng từng người.

`fast` và `heavy` là hai cohort có thể giao với nhóm vùng, không cộng chúng như các
nhóm độc lập. Muốn có điểm số cần nhãn nguồn đáng tin hoặc người nghe gán nhãn trước
khi xem lỗi model. Không suy “giọng nặng” từ WER cao; không suy tuổi/tốc độ tự nhiên
từ vùng hoặc thời lượng clip. Stress test tăng tốc bằng xử lý tín hiệu phải ghi là
**synthetic**, không nhập vào cohort nói nhanh tự nhiên hoặc tạo thêm “giọng miền Trung”.

Mức tối thiểu **đề xuất cho nghiên cứu này**: mỗi vùng chính ít nhất 10 người và 30 phút
validation, nội dung/thiết bị/điều kiện tương đối cân bằng; không phải chuẩn quốc tế
hoặc bảo đảm đại diện dân số. Nhóm dưới ngưỡng vẫn có thể hiện điểm mô tả nhưng phải
báo thiếu coverage. Test cuối cần thêm người độc lập, đóng băng trước lựa chọn model.

Các mục tiêu WER người dùng minh họa (Bắc 8%, Nam 12%, Trung 15%, nhanh 15%, nặng 20%)
được lưu là **illustrative**, chưa là số đo hoặc acceptance. Cần chốt mục tiêu sau
baseline trên bộ đại diện; không ghi các WER giả định 8/19/34/27/42% thành kết quả.

Chia dữ liệu theo người nói và bản ghi gốc trước khi cắt đoạn/augment. Giữ official
split nếu đáng tin, audit lại; mọi đoạn từ cùng nguồn ghi âm phải nằm cùng split.
Không dùng test để chọn learning rate, sửa nhãn dựa trên model hoặc quyết định epoch.
ID có namespace nguồn; chặn trùng ID/audio bytes và giữ checksum WAV đã chuẩn hóa.
Hash ID xuyên corpus không xác nhận hai người là khác nhau: trùng danh tính thực,
audio gần trùng và trùng pretraining Whisper vẫn là giới hạn chưa giải quyết.

## 3. Chấm điểm và bằng chứng

- WER/CER corpus: tổng edit chia tổng đơn vị tham chiếu, không trung bình WER từng câu.
  WER dùng token tách khoảng trắng (tiếng Việt thường tương ứng âm tiết), không áp dụng
  word segmentation; CER bỏ khoảng trắng. NFC/casefold, punctuation→space, giữ dấu,
  không viết lại số hay tự sửa thuật ngữ. Dùng cùng `evidence.py` của vòng trước.
- Báo tổng, từng vùng và từng người; phân rã thay/xóa/chèn và lỗi chỉ khác dấu chữ.
  Phân rã dấu là phép so ký tự, chưa xác định nguyên nhân âm vị/giọng.
- Macro ba vùng và worst-region chỉ có khi đủ cả ba nhóm có mẫu. Thiếu nhóm → `null`,
  tuyệt đối không 0%. Coverage vẫn được kiểm riêng dù đã đủ ba điểm số.
- Bootstrap theo speaker, seed42/1.000 lần; chỉ xuất khi có ít nhất 5 người. Khoảng
  95% là thăm dò trên mẫu đã chọn, không chứng minh đại diện toàn vùng. Nhiều người
  chung một chương trình có thể còn tương quan; chưa bootstrap nhiều cấp bản ghi.
- Dự đoán rỗng vẫn tính deletion. Thiếu prediction, khác reference, duplicate ID/audio,
  train overlap hoặc nhãn cohort thiếu provenance → từ chối chấm. Lỗi runtime giữ
  trạng thái failed và artifacts, không xuất bảng “hoàn thành” từ một phần dữ liệu.
- Mỗi lượt giữ manifest/protocol/config/model revision, hashes, environment, predictions,
  scores/CI/error counts và status; audio/transcript/câu lỗi để private. Bản công khai
  chỉ thống kê, không nguyên văn dữ liệu y khoa.

## 4. Starter đã thực hiện và cách chạy lại

Đã tải đúng hai Parquet train/dev VietMed, tổng **113.080.475 byte**, revision
`f302146de79c5cbd6a7d14400fefa2c8cfda7738`; không tải/đọc test. Kiểm SHA256 theo
`data/vietmed-source-v1/acquisition.json`. Train 2.773 câu/13 người; dev 2.912 câu/21
người. Speaker và bản ghi không giao nhau giữa train/dev theo metadata kiểm thực tế.

Chọn tối đa 10 câu/dev speaker theo SHA256(seed42:id), không dựa trên lỗi hoặc lời chép:
**210 câu/21 người/1.251 giây**, gồm Bắc 70/7, Nam 130/13 và Tây Nguyên 10/1.
Không có nhãn `central`, `fast`, `heavy`. Nhãn nguồn chưa được nhóm nghe rà độc lập.
Tập này là diagnostic y khoa, chưa phải benchmark Bắc–Trung–Nam hoàn chỉnh.
[Kết quả thực đo và giới hạn](./validation/2026-11-03-accent-benchmark.md).

Đã bổ sung **ViMD valid** revision `3a5b30157034e7eadd5c75fae1a820c6f9383398`:
30câu/30người mỗi vùng, tổng90câu/90người,16tỉnh/thành theo nhãn nguồn. Shards0/4/6
được chọn sau khi dò cột region, không phải mẫu ngẫu nhiên toàn63nhãn. Khoảng9–10phút
mỗi vùng, chưa đủ30phút; `fast`/`heavy` chưa có nhãn. Không tải train/test ViMD.
Không tái dùng valid này làm train; chưa audit độc lập full official train IDs hoặc
bản ghi chương trình gốc (schema chỉ cho ID từng câu). Không tuyên bố người nói này
chưa xuất hiện trong pretraining Whisper. Kết quả không gộp với VietMed/VIVOS.

Tool `prepare_vimd.py --metadata <snapshot-metadata.json> --output <new-private-dir>
--download` giới hạn ba shard cuối dưới1,6GB; `--source-cache <source-dir>` kiểm SHA
trước khi dùng lại nguồn đã tải. Giữ Parquet gốc, WAV chuyển định dạng và transcript
riêng tư; không gửi lên Hub. Một shard thăm dò không dùng còn được giữ local, nên
tổng Parquet đã lấy trong nghiên cứu ViMD là khoảng1,81GB. API preview500/timeout;
dò metadata qua HTTP Range và pin source giúp không phụ thuộc preview server.

Commands từ root, dùng dữ liệu nguồn đã lưu local. Dependency ingest tách `.venv-check`,
không đổi môi trường GPU đã chạy bốn lượt trước. Output có sẵn bị từ chối ghi đè:

```powershell
$dataPython = '.\ai-service\training\.venv-check\Scripts\python.exe'
$trainPython = '.\ai-service\training\.venv\Scripts\python.exe'
& $dataPython -m pip install -r ai-service/training/requirements-data.txt
& $dataPython ai-service/training/prepare_vietmed.py --source ai-service/training/data/vietmed-source-v1 --output ai-service/training/data/accent-vietmed-dev-new
$env:HF_HOME = Join-Path (Get-Location) '.cache/huggingface'
$env:HF_HUB_OFFLINE = '1'
& $trainPython ai-service/training/evaluate_accent.py --manifest ai-service/training/data/accent-vietmed-dev-new/benchmark.manifest.jsonl --training-identities ai-service/training/data/accent-vietmed-dev-new/training-identities.private.json --output ai-service/training/runs/accent-baseline-new
& $dataPython -m unittest discover -s ai-service/training -p 'test_*.py' -v
```

Evaluator chỉ dùng model base revision đã cache, local-only, HF fp32; không dùng dịch,
không gọi AI cloud, không train hoặc promote model. Protocol ở
`ai-service/training/benchmark.protocol.json`. Reporter `report_accent.py` xuất số liệu,
speaker CSV, biểu đồ và registry từ snapshots; không export transcript/audio.

## 5. Vòng tiếp theo và tự động hóa có điều kiện

1. Ưu tiên mở rộng valid ViMD theo tỉnh/người và xác định phạm vi phát hành model trước
   khi chọn nó cho train, hoặc xin bộ VLSP có nhãn speaker/region. Bud500
   là ứng viên train bổ sung sau khi người dùng tự có quyền; thiếu metadata thì giữ
   ngoài benchmark chính cho tới khi gán và rà nhãn. Không cần chờ nguồn gated để
   chuẩn bị rubric và thu có đồng ý người nói miền Trung/hội thoại kỹ thuật.
2. Rà ngẫu nhiên audio–text theo vùng, speaker và source; ghi tỷ lệ lỗi thực thấy,
   sửa/loại với lý do; lưu phiên bản nhãn. Không tự đổi `unreviewed` thành `reviewed`.
3. Chốt người/bản ghi validation/test độc lập. Bổ sung thiết bị/nhiễu/nội dung cuộc gọi,
   thuật ngữ kỹ thuật và các cohort nhanh/nặng; không để miền y khoa chi phối kết luận.
4. Khi đủ ba vùng, `balanced_plan()` lấy mẫu train không lặp, luân phiên người nói,
   có cap giây/vùng và giây/người. Recipe VietMed hiện `blocked_missing_region_data:
   central`; ViMD hiện chỉ có valid, không có train rows được cấp vào recipe.
   Recipe luôn cần QA + audit training hiện có; không tự phát lệnh train từ data mới.
5. Thí nghiệm lượng dữ liệu đề xuất 5→10→30 giờ **duy nhất**, báo cả lượt tiếp xúc và
   số bước. So cùng model/seed/decoding/validation; kiểm soát compute budget. Giữ một
   ablation cân bằng vùng so với lấy ngẫu nhiên. Thay một yếu tố chính mỗi lượt;
   augmentation chỉ trên train, sau split và không nhân số giờ độc nhất.
6. Chọn cấu hình bằng validation tổng và từng vùng, xét độ bất định và suy giảm Anh/Trung,
   thuật ngữ/miền mới. Chốt rồi mới chạy test cuối. Sau đó export GGML/Q5_1, đo serving
   và cuộc gọi thật; chỉ triển khai khi có bằng chứng cải thiện và rollback.

Ổ C: còn khoảng 33 GiB lúc kiểm; Bud500 HF repo ~52,7 GB, ViMD ~59,8 GB serialized,
còn cần WAV/cache/checkpoint nên không tải toàn bộ vào ổ này. Giới hạn dung lượng/
shard, chỉ tải phần cần hoặc dùng ổ khác sau đo dung lượng thực. Corpus lớn không phải
nằm toàn bộ trong VRAM: 4 GiB giới hạn batch/model/activation; thời gian train vẫn tăng
theo số bước. Không ước lượng thời gian 500 giờ từ pilot nhỏ và không hứa chất lượng.
