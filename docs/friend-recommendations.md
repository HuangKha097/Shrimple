# Gợi ý kết bạn

Endpoint `GET /api/friends/suggestions` dùng chung cho bước hoàn tất hồ sơ và các màn hình tìm bạn. Kết quả tối đa 20 người, được tạo theo hai bước:

1. **Tìm ứng viên:** bạn của bạn; thành viên chung nhóm chat; người cùng trường, nơi làm việc hoặc khu vực; tác giả/người tương tác với bài viết công khai; khi thiếu dữ liệu thì thêm tài khoản có username được tạo gần đây.
2. **Xếp hạng:** cộng điểm bạn chung (có giới hạn để tránh tài khoản quá nhiều kết nối), bình luận/lượt thích qua lại trên bài công khai, nhóm chung, nơi làm việc, trường/ngành và khu vực. Trả `suggestionReason` cùng `mutualFriendCount` để giao diện giải thích gợi ý.

Luôn loại chính mình, bạn hiện tại, lời mời đang chờ, tài khoản chặn hai chiều và tài khoản chưa có username. Trường, nơi làm việc và khu vực chỉ được dùng khi cả hai bên cho phép hiển thị mục đó. Không dùng tọa độ chính xác, ngày sinh, giới tính hoặc dữ liệu tin nhắn riêng. Truy vấn và số ứng viên được giới hạn để tránh tải toàn bộ người dùng vào bộ nhớ.

Đây là mô hình **chấm điểm theo quy tắc**, chưa phải mô hình học máy của Facebook. Các hệ thống công khai của [LinkedIn](https://engineering.linkedin.com/teams/data/artificial-intelligence/people-you-may-know) và [Meta](https://engineering.fb.com/2020/12/10/web/how-instagram-suggests-new-content/) cũng mô tả việc tìm ứng viên rồi xếp hạng bằng tín hiệu đồ thị và tương tác. Khi app có đủ dữ liệu hiển thị, kết bạn và bỏ qua, có thể hiệu chỉnh trọng số dựa trên tỷ lệ chấp nhận lời mời thay vì đoán trọng số cố định.
