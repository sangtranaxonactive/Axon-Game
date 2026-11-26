# YEP Racing

Game đua kart 3D nhiều người chơi trên web cho Year End Party. Giao diện tiếng Anh, chơi trên phone (ngang/dọc) và máy tính.

| Trang | Dùng để |
| --- | --- |
| `/` | Game (nhân viên quét QR vào đây) |
| `/screen` | Màn hình lớn: BXH cá nhân + đội, bản đồ live, QR. Thêm `?url=https://ten-mien` để QR trỏ đúng địa chỉ công khai |
| `/admin` | Xuất CSV kết quả, reset BXH (cần admin key) |
| `/editor?key=<adminKey>` | Vẽ đường đua lên bản scan GLB của công ty |

## Chạy

```bash
npm install
ADMIN_KEY=mot-chuoi-bi-mat npm start      # http://localhost:3000
```

Server tự build bản client đã minify mỗi lần khởi động. Cấu hình ở `config.json` (tên sự kiện, đội, số vòng, map, số xe/phòng).
Deploy: bất kỳ host Node nào có WebSocket (VPS, Render, Railway, Fly.io…) — 1 vCPU / 512 MB là dư; có sẵn `Dockerfile`.
Gắn volume vào `DATA_DIR` để BXH không mất khi restart. **Chỉ chạy 1 instance** (trạng thái phòng nằm trong RAM).

## Kiểm thử (chạy lại sau mỗi lần sửa code)

```bash
npm run dev                                  # server có bật test hook
node tools/cheattest.js                      # bảo mật + chống gian lận, phải ALL PASS
node tools/loadtest.js 450 ws://localhost:3000 120   # 450 người chơi giả lập, timeMismatches phải = 0
node tools/roomtest.js                       # 2 ván liên tiếp trong phòng riêng + khóa đội
node tools/shot.js 844 390 land              # 1 ván thật trong trình duyệt + ảnh chụp vào shots/
```

Kết quả đo ngày 2026-11-24 (máy sandbox, sau bản cập nhật 2): 450 kết nối đua liên tục, 0 rớt, 0 lệch thời gian, CPU server ~10% một core, RAM ~80 MB.

## Cách chơi (bản cập nhật 2)

- **Nitro đúng nhịp**: nút NITRO nháy sáng trong ~0.6 giây ngay khi đếm ngược về GO và ~1 giây sau mỗi cú drift. Bấm đúng lúc được một cú phóng nhỏ
  miễn phí (~15% một bình; drift dài thì nhiều hơn chút). Bấm sớm trước GO sẽ bị "TOO EARLY" và mất lượt đó.
- **Bình nitro** (icon tia sét): drift để đầy thanh, tối đa 2 bình; bấm NITRO khi nút không nháy để dùng 1 bình.
- **Đường tắt**: lối hẹp phát sáng (6.6 m, xe rộng ~2 m) cắt ngang ngay trước đỉnh hai cua chữ U, dài ~50 m, có cổng "SHORTCUT". Phải rẽ gần 90° để vào:
  lọt vào lối là được phóng ~15% một bình (mỗi 8 giây một lần); vào lệch thì đập rào và mất vài giây.
- **Khúc khó**: chuỗi cua chữ S và cua tay áo ở cuối vòng. Map `arena`/`office` dài 1843 m (~50 giây/vòng).
- **Garage**: chọn 1 trong 8 nhân vật (Racer, Duck, Banana, Alien, Chicken, Clown, Boss, Robot), màu nhân vật và màu xe. Chỉ là ngoại hình —
  server không dùng các lựa chọn này trong mô phỏng nên mọi xe lái y hệt nhau. Thêm nhân vật: `makeDriver` trong `src/car.js` + tên trong `src/looks.js`.
- **Lái**: bấm hướng nào xe luôn quay hướng đó; đang drift mà bẻ ngược hẳn thì drift kết thúc.
- Âm thanh tổng hợp bằng WebAudio (`src/audio.js`): beat trap tối 140 BPM tự soạn (808 trượt nốt, clap có vang, piano + dây), tiếng rít lốp, tiếng nitro. Nút ♪ để tắt.
  Muốn dùng beat thật: chép file vào `public/music/` và thêm `"music": "/music/ten-file.mp3"` vào `config.json` (chỉ dùng nhạc bạn có quyền sử dụng).

- **Map mặc định `company`**: văn phòng công ty dựng lại theo ảnh 360° tham khảo (màu lấy mẫu trực tiếp từ ảnh), ở tỉ lệ khổng lồ. **Không có mặt đường nhựa hay rào**:
  xe chạy trên sàn bê tông, đường đua chỉ được đánh dấu bằng hai vạch vàng (vẫn có giới hạn vô hình ở vạch). Chi tiết: trần bê tông sáng với ống gió bọc bạc, ống đỏ, máng cáp cam đục lỗ,
  đèn thả đen, giàn vòm thép đen; tường xanh có nét xéo và chữ A lớn; phòng họp kính xanh bo góc; tường cam cong có TV, đồng hồ, ghế bar; tủ locker than chì cửa vàng in số;
  bồn cây lục giác vàng với cây thân mảnh dưới chụp đèn tím; cụm bàn làm việc trong khung thép đen có vách trắng và 2 thanh LED; cột tròn chân lục giác; xe máy, xích lô, phòng server,
  quầy lễ tân, tranh núi, các bức tường chữ. Vật liệu PBR (bê tông bóng, kính, thép sơn tĩnh điện, crôm, vải, da, gỗ). Tên công ty / giá trị sửa ở `"company"` / `"values"` trong `config.json`. Code: `src/company.js`.
- **Map `arena`**: đường đua đêm tông xanh — tháp đèn lóe sao, khán đài có khán giả, giàn khung thép có dải đèn bắc ngang đường, dải neon trên rào,
  hiệu ứng phát sáng (bloom). Cùng bố cục đường với `office` (đổi map bằng `"map"` trong `config.json`). Bloom tự tắt khi máy yếu; tắt tay bằng `/?bloom=0`.
- **Góc máy**: lia vòng quanh xe lúc đếm ngược, camera nghiêng theo cua và lệch ra ngoài cua, rung nhẹ khi nitro, quay vòng quanh xe khi về đích;
  ở sảnh luân phiên cảnh sát mặt đường và cảnh trên cao.

Thêm đường tắt cho map khác: `node tools/suggest-shortcuts.mjs <map>` gợi ý các cặp điểm, chép vào `"shortcuts": [[from, to, 4.4]]` trong file map.

## Bản cập nhật 11: chướng ngại, vật phẩm, trang bình luận viên

- **Vạch SLOW** (đỏ trắng): chạm vào là xe bò khoảng 2 giây. Vị trí: `"slowZones": [[vị trí trên vòng 0–1, lệch ngang (m)]]` trong file map.
- **Hộp may mắn màu cam**: `"itemBoxes"` trong file map; có lại sau `boxRespawnMs` (3000 ms). Mỗi hộp cho ngẫu nhiên: 2 vỏ chuối (thả phía sau),
  nam châm (làm chậm người ngay phía trước ~3 giây, mình được kéo nhẹ) hoặc 1 lần phóng nitro. Dùng bằng nút cam trên màn hình hoặc phím E.
- Mọi vật phẩm do **máy chủ quyết định** (ai nhặt, trúng ai); máy khách chỉ nhận hiệu ứng tại một tick xác định và tua lại nếu cần (`src/netcar.js`),
  nên thời gian chính thức vẫn khớp tuyệt đối. `tools/loadtest.js` cho bot dùng vật phẩm; `timeMismatches` và `tooLateToRewind` phải bằng 0.
- **Trang bình luận viên / ban tổ chức**: `/live`, cần mã `HOST_CODE` (biến môi trường, hoặc `hostCode` trong `config.json`; chưa đặt thì server in mã tạm khi khởi động).
  Chọn phòng → camera bám sau/trên tay đua, có tên trên đầu xe. Bấm tên hoặc phím 1–8 để đổi người, kéo chuột để xoay, lăn chuột để zoom, `H` ẩn bảng cho khung hình sạch.
  Để livestream: chia sẻ cửa sổ trình duyệt này qua OBS / Teams / Zoom. Trang này chỉ nhận dữ liệu, không lái xe hay dùng vật phẩm được.
- **Mobile**: nhắc xoay ngang, bỏ nút phanh, HUD gọn hơn, nút bấm cỡ ngón tay. Có vạch sóng mạng trên HUD; mạng yếu thì gửi/nhận thưa hơn.

## Kiểm tra đang chạy bản nào

Góc dưới trái màn hình game có số bản (ví dụ `v16-3fa9c1`), dòng khởi động của server và `/api/version` cũng in ra số đó.
Nếu số trên điện thoại khác số trong cửa sổ server thì điện thoại đang giữ bản cũ: đóng tab rồi mở lại link.
Khi sửa game, tăng `VERSION` trong `server.js`.

## Công bằng & chống gian lận

- Trình duyệt **chỉ gửi nút bấm** (trái/phải/drift/phanh/nitro, 60 lần/giây). Server tự lái lại chiếc xe bằng đúng bộ vật lý
  (`src/physics.js`) và tự tính thời gian về đích. Gửi "tôi đã về đích", dịch chuyển, tua nhanh, bỏ tick… đều bị từ chối.
- Mã nguồn (`src/`, `server.js`, `config.json`, `data/`) không được phục vụ qua HTTP; client chỉ nhận bản bundle đã minify, không có source map.
- Đội bị khóa sau lần về đích đầu tiên; API BXH không lộ mã định danh người chơi.
- **Giới hạn cần biết**: game web nào cũng tải code về máy, nên minify chỉ làm chậm chứ không ngăn được người đọc code. Server-authoritative
  chặn được kết quả giả, nhưng không chặn được một con bot tự lái "thật" bằng input hợp lệ. Vì khán giả toàn developer, nên:
  **trao giải bằng vòng chung kết trực tiếp** (top 8 đua trong 1 phòng riêng, chiếu `/screen`, cầm máy trước mặt mọi người). BXH online chỉ dùng để chọn người vào chung kết.
- Muốn chặt hơn nữa (chưa làm): phát mã cá nhân cho từng nhân viên thay vì tự nhập tên.

## Đưa map công ty vào (cảm giác "tí hon trong văn phòng")

1. **Quét bằng iPhone 16 Pro (LiDAR)** — khuyên dùng **Scaniverse** (miễn phí, chọn chế độ *Mesh*, không phải Splat) hoặc **Polycam** (LiDAR mode).
   Quét từng khu ~30–50 m², đi chậm, bật hết đèn, tránh kính/gương; cầm máy quét cả mặt sàn và gầm bàn.
2. Export **GLB** (Scaniverse: Share → Export Model → GLB). Nên < 30 MB / < 500k tam giác (giảm trong app hoặc Blender: Decimate).
3. Chép file vào `public/maps/`, mở `/editor?key=…`, chọn file GLB. Để **Scale = 10** (xe thành xe đồ chơi 27 cm), bấm *Auto-place floor*.
4. Bấm trên mặt sàn để vẽ vòng đua luồn qua lối đi, gầm bàn… Editor báo đỏ nếu cua quá gắt. *Download map JSON* → chép vào `public/maps/`.
5. Sửa `"map"` trong `config.json` (hoặc `MAP=ten-map npm start`), chạy `node tools/checkmap.mjs ten-map`.

Ví dụ có sẵn: `MAP=sample-scan npm start` (một phòng mẫu GLB kích thước thật, phóng 10 lần). Map mặc định `office` là văn phòng khổng lồ dựng sẵn — dùng làm phương án dự phòng nếu bản scan không đẹp.
Lưu ý: xe chỉ va chạm với rào hai bên đường, không va chạm với đồ vật trong bản scan — hãy vẽ đường qua chỗ trống.

## Bảo trì / ngày diễn ra tiệc

- Trước tiệc: đặt `ADMIN_KEY`, reset BXH ở `/admin`, chạy `cheattest` + `loadtest` trên server thật, mở `/screen?url=…` trên máy chiếu.
- Trong tiệc: theo dõi `/api/stats` (online / phòng / đang đua). Server treo → restart, BXH vẫn còn (`data/leaderboard.json`, tự backup khi reset).
- Sau tiệc: `/admin` → Download CSV.
- Sửa cảm giác lái: chỉ sửa `src/physics.js` (đọc quy tắc ở đầu file — không dùng `Math.sin/cos/random`), rồi chạy lại loadtest để chắc `timeMismatches=0`.
- Chưa kiểm thử trên iPhone/Safari thật (chỉ Chromium tự động). Nếu Safari tính lệch server, thời gian chính thức vẫn là của server; hãy thử 1 ván trên iPhone trước tiệc.
