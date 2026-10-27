# Hướng dẫn nối trang đặt lịch với Google Sheet

Thư mục gồm:
```
index.html            Trang đặt lịch (1 file duy nhất, ảnh đã nhúng sẵn)
apps-script/Code.gs   Code "máy chủ" lưu lịch hẹn vào Google Sheet
```
Toàn bộ miễn phí, chỉ cần 1 tài khoản Google (nên dùng tài khoản của phòng khám).
Thời gian làm: khoảng 5–10 phút.

---

## Bước 1 — Tạo Google Sheet
1. Vào https://sheets.new (đăng nhập tài khoản Google của phòng khám).
2. Đặt tên file, VD: **Lịch hẹn PK Phạm Thị Lan**.

## Bước 2 — Dán code vào Apps Script
1. Trong Google Sheet vừa tạo: menu **Tiện ích mở rộng → Apps Script**.
2. Xóa hết đoạn `function myFunction() {...}` có sẵn.
3. Mở file `apps-script/Code.gs`, copy **toàn bộ** nội dung, dán vào.
4. (Tùy chọn) Muốn nhận email mỗi khi có lịch mới: sửa dòng
   `const NOTIFY_EMAIL = '';` thành `const NOTIFY_EMAIL = 'email@gmail.com';`
5. Bấm biểu tượng **💾 Lưu** (hoặc Ctrl + S).

## Bước 3 — Chạy `setup` để tạo bảng & cấp quyền
1. Trên thanh công cụ, ô chọn hàm → chọn **setup** → bấm **▶ Chạy**.
2. Hiện hộp "Cần cấp quyền" → **Xem xét quyền** → chọn tài khoản Google.
3. Nếu hiện "Google chưa xác minh ứng dụng này": bấm **Nâng cao** →
   **Đi tới … (không an toàn)** → **Cho phép**.
   (Đây là script của chính bạn nên an toàn; Google luôn cảnh báo với script tự viết.)
4. Nhật ký thực thi hiện `OK! Dữ liệu lịch hẹn lưu tại tab "LichHen"...` là xong.
   Quay lại Google Sheet sẽ thấy tab **LichHen** có sẵn tiêu đề cột.

## Bước 4 — Triển khai thành "Ứng dụng web" để lấy link
1. Góc trên bên phải: **Triển khai → Tùy chọn triển khai mới**.
2. Bấm biểu tượng ⚙ cạnh "Chọn loại" → chọn **Ứng dụng web**.
3. Điền:
   - Mô tả: `Đặt lịch khám`
   - Thực thi dưới dạng: **Tôi (email của bạn)**
   - Người có quyền truy cập: **Bất kỳ ai**  ← bắt buộc, nếu không bệnh nhân không đặt được
4. Bấm **Triển khai** → sao chép **URL ứng dụng web**, có dạng:
   `https://script.google.com/macros/s/AKfycb............/exec`
5. Kiểm tra: dán link đó vào trình duyệt, thấy dòng chữ
   `{"ok":true,"service":"dat-lich-kham","slots":24}` là máy chủ đã chạy.

## Bước 5 — Dán link vào trang đặt lịch
1. Mở `index.html` bằng Notepad / VS Code, tìm (Ctrl + F) chữ **API_URL**.
2. Dán link vào giữa hai dấu nháy:
   ```js
   API_URL: 'https://script.google.com/macros/s/AKfycb..../exec',   // <<< DÁN LINK VÀO GIỮA HAI DẤU NHÁY
   ```
3. Lưu file. Mở `index.html` bằng trình duyệt: dải cảnh báo vàng **"Chế độ demo"** biến mất
   là đã kết nối thành công. Thử đặt 1 lịch → quay lại Google Sheet sẽ thấy 1 dòng mới.

## Bước 6 — Đưa lên mạng (GitHub Pages)
1. Tạo repository mới trên GitHub (VD `dat-lich-kham`), chế độ **Public**.
2. **Add file → Upload files** → kéo thả `index.html` → **Commit changes**.
   (Không cần upload `Code.gs` — code đó đã nằm trên Google.)
3. **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main / (root)** → **Save**.
4. Sau 1–2 phút, link trang đặt lịch: `https://<tên-github>.github.io/dat-lich-kham/`
   — gửi link này cho bệnh nhân, gắn vào Zalo OA, Facebook, Google Maps...

---

## Vận hành hằng ngày (trên Google Sheet, tab `LichHen`)
| Việc cần làm | Cách làm |
|---|---|
| Xác nhận lịch | Gọi/nhắn Zalo bệnh nhân → đổi cột **Trạng thái** thành `Đã xác nhận` |
| Bệnh nhân đã khám | Đổi thành `Đã khám` |
| Hủy lịch | Đổi thành `Đã hủy` → khung giờ đó tự trống lại trên web |
| Khóa giờ bác sĩ bận | Thêm 1 dòng tay: Mã `BAN01`, Ngày `2026-10-30`, Giờ `14:10`, Trạng thái `Đã xác nhận` |

Mẹo: dùng **Dữ liệu → Bộ lọc** hoặc sắp xếp theo cột *Ngày khám* để xem lịch từng ngày.
Cài app **Google Trang tính** trên điện thoại để xem lịch mọi lúc.

## Khi cần sửa
- **Sửa Code.gs** (đổi giờ làm, ngày nghỉ, email…): sau khi lưu phải vào
  **Triển khai → Quản lý các bản triển khai → ✏ Chỉnh sửa → Phiên bản: Phiên bản mới → Triển khai**.
  Link giữ nguyên, không cần dán lại.
- **Đổi giờ làm việc / ngày nghỉ**: sửa ở **cả 2 nơi** cho khớp — khối `CONFIG` trong `index.html`
  và phần đầu `Code.gs`: `SLOT_MINUTES`, `SESSIONS`, `WORK_DAYS`, `HOLIDAYS`, `DAYS_AHEAD`,
  `MIN_LEAD_MINUTES`, `CANCEL_BEFORE_MINUTES`.

## Gặp lỗi?
| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Trang báo "Không tải được lịch trống" | Link dán sai, thiếu `/exec` ở cuối, hoặc chưa chọn "Bất kỳ ai" ở Bước 4 |
| Vẫn thấy dải "Chế độ demo" | Chưa dán link vào `API_URL` hoặc chưa lưu file |
| Sửa code nhưng web không đổi | Chưa tạo **Phiên bản mới** khi triển khai lại |
| Số điện thoại trong Sheet mất số 0 | Tab `LichHen` không do script tạo — xóa tab đó rồi chạy lại `setup` |
