# YEP Racing — Spec

## 1. Idea
Game đua kart 3D chạy trên web (phone là chính, xoay ngang hoặc dọc đều chơi được) cho Year End Party.
Nhân viên quét QR → nhập tên, chọn đội → vào phòng đua với nhau. Thành tích tốt nhất của mỗi người lên
bảng xếp hạng chung; màn hình lớn của bữa tiệc chiếu BXH + bản đồ live. Top 1 nhận quà.
Thể loại: kart arcade (tự tăng ga, drift tích nitro) — game gốc, không sao chép game có sẵn nào.

## 2. Người dùng & quy mô
- 300–400 người / chi nhánh, có thể cùng online một lúc.
- Không đăng nhập: mỗi máy có 1 mã ngẫu nhiên lưu trong trình duyệt (localStorage) + tên + đội.
- MC / ban tổ chức: mở `/screen` trên màn hình lớn, `/admin` để reset / xuất CSV.

## 3. Luật chơi
- Mỗi ván: tối đa `roomSize` (8) xe / phòng, `laps` (2) vòng. Xe không va nhau (xuyên qua) để công bằng khi mạng lag.
- "Đua ngay": ghép phòng công khai, tự xuất phát sau 12 giây hoặc khi đủ người.
- "Tạo phòng": phòng riêng mã 4 số, chủ phòng bấm bắt đầu, đua xong quay lại phòng chờ.
- Xếp hạng cá nhân: thời gian hoàn thành tốt nhất (ms). Chơi lại bao nhiêu lần cũng được.
- Xếp hạng đội: trung bình `teamTopN` (5) thời gian tốt nhất của đội; đội chưa đủ 5 người xếp sau.
- Ván kết thúc khi mọi người về đích, hoặc 45 giây sau người về đầu, hoặc tối đa 6 phút.

## 4. Điều khiển
- Phone: ◀ ▶ bên trái; DRIFT, NITRO, phanh bên phải. Tự tăng ga.
- Máy tính: mũi tên / A-D, Shift hoặc Space = drift, N hoặc Ctrl = nitro, S/↓ = phanh.
- Drift khi đang rẽ → tích tia lửa (2 cấp) → nhả ra được mini-boost; drift làm đầy bình nitro (tối đa 2 bình).
- Ô tăng tốc trên đường.

## 5. Kiến trúc (đã sửa sau AI check + audit)
- 1 tiến trình Node.js (`server.js`): file tĩnh (gzip) + WebSocket (`ws`) + BXH lưu file JSON.
- **Server-authoritative**: client chỉ gửi trạng thái nút bấm theo tick 1/60 s; server chạy lại cùng bộ vật lý tất định
  (`src/physics.js`) cho từng xe và tự quyết định thời gian về đích. Client chạy song song để hiển thị không trễ.
- Input không được chạy trước thời gian thực; chạy chậm hơn thời gian thực quá 1.5 s thì tính theo đồng hồ server.
- Client được bundle + minify (esbuild) lúc server khởi động; không phục vụ mã nguồn, không source map.
- Màn hình lớn nhận BXH (≤ 1 lần/giây) và vị trí mọi xe đang đua (5 Hz) từ mô phỏng của server.

## 6. Map
- Map = file `public/maps/<tên>.json`: danh sách điểm tim đường (spline khép kín), bề rộng, ô tăng tốc,
  ánh sáng, bầu trời, và tùy chọn `model` = file GLB (bản scan LiDAR văn phòng).
- `/editor`: nạp GLB, nhìn từ trên xuống, bấm để đặt điểm đường đua, xuất JSON.
- Map mặc định "Company Campus" dựng thủ tục (tòa nhà kính, cây, đèn, cổng xuất phát) để chơi được ngay.

## 7. Đồ họa
- PBR (MeshStandard/Physical), phản xạ môi trường, đèn mặt trời có bóng đổ, sương mù, bầu trời gradient.
- Tự giảm độ phân giải khi FPS thấp để máy yếu vẫn mượt.

## 8. Tiêu chí nghiệm thu
1. 400 kết nối đồng thời đua liên tục, server CPU < 50% 1 core, không rớt kết nối (script `tools/loadtest.js`).
2. Một ván hoàn chỉnh từ nhập tên → về đích → lên BXH chạy được trên Chrome/Safari mobile, cả ngang và dọc.
3. Màn hình `/screen` cập nhật trong ≤ 2 giây sau khi có người về đích.
4. Khởi động lại server không mất BXH.
5. Đổi map chỉ cần thêm file JSON (+GLB) và sửa `config.json`.

## 9. Ngoài phạm vi
Đăng nhập SSO, va chạm giữa các xe, vật phẩm tấn công, chạy nhiều server song song (1 server đã đủ cho 400–500 người).
