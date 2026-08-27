# xevipsanbay.com — site tĩnh + CMS

Site tĩnh HTML/CSS/JS thuần trong `html/`, deploy qua **Vercel**. Nội dung (bài viết, dịch vụ)
được quản lý bằng một CMS chạy trên **Google Apps Script**, ghi dữ liệu thẳng vào repo này qua
GitHub Contents API; GitHub Actions build lại `html/` rồi Vercel tự deploy.

> **Mọi quyết định nghiệp vụ của CMS nằm ở [`GAS.md`](GAS.md)** — đọc file đó trước khi sửa
> bất cứ thứ gì liên quan tới CMS. Playbook chung: skill `free-cms-static-site-pipeline`.

## Luồng dữ liệu

```
Admin (Google Apps Script)  ──ghi──►  data/*.json  ──trigger──►  GitHub Actions
                                                                      │ scripts/build.py
                                                                      ▼
                                                          html/  ──push──►  Vercel deploy
```

Độ trễ thực tế từ lúc bấm Lưu tới lúc thấy trên site: **khoảng 1–2 phút**.

## Thư mục

| Đường dẫn | Là gì | Sửa tay được? |
|---|---|---|
| `data/posts.json` | Danh sách bài viết (commit CHỐT, trigger CI) | ❌ CMS ghi |
| `data/blog/<slug>.json` | Nội dung 1 bài viết | ❌ CMS ghi |
| `data/services.json` | Toàn bộ dịch vụ, kèm nội dung (commit CHỐT) | ❌ CMS ghi |
| `templates/*.html` | **Design gốc** của trang bài viết / danh sách / dịch vụ | ✅ đây là chỗ sửa giao diện |
| `scripts/build.py` | Sinh `html/` từ `data/` + `templates/` | ✅ |
| `html/blog/**`, `html/dich-vu-*/**` | Trang do build sinh ra | ❌ build ghi đè |
| `html/index.html`, `html/ve-chung-toi/`, `html/lien-he/` | Trang viết tay | ✅ (build chỉ vá vùng menu Dịch vụ) |
| `html/admin/index.html` | Trang chuyển hướng tới CMS | ✅ |
| `html/images/**` | Ảnh (CMS upload thẳng vào đây) | — |
| `gas/` | Code CMS Apps Script — **gitignore**, deploy bằng `clasp` | ✅ xem `gas/README.md` |

⚠️ Không sửa tay file trong `html/blog/`, `html/dich-vu-*/` — lần build kế tiếp sẽ ghi đè.
Muốn đổi giao diện các trang đó thì sửa `templates/`.

## Menu "DỊCH VỤ" tự cập nhật

`build.py` vá lại danh sách dịch vụ giữa 2 mốc neo có trong **mọi** trang:

```html
<!-- NAV_SERVICES_START --> ... <!-- NAV_SERVICES_END -->              (menu desktop)
<!-- NAV_SERVICES_DRAWER_START --> ... <!-- NAV_SERVICES_DRAWER_END -->  (menu mobile)
```

Đổi design header thì **phải giữ nguyên 2 cặp mốc neo này**, nếu không build sẽ in CẢNH BÁO và
menu của trang đó không bao giờ tự cập nhật nữa.

## Chạy tại máy

```bash
python3 scripts/build.py        # build lại html/ từ data/
python3 -m http.server -d html  # xem thử ở http://localhost:8000
```

Build là **idempotent**: chạy 2 lần liên tiếp không sinh thêm thay đổi nào.

## Script chạy một lần (đã chạy xong, không cần chạy lại)

| Script | Việc đã làm |
|---|---|
| `scripts/scaffold_templates.py` | Gắn mốc neo NAV_SERVICES vào các trang + dựng `templates/` từ chính trang thật |
| `scripts/migrate_once.py` | Bóc 4 bài viết + 2 trang dịch vụ viết tay thành dữ liệu trong `data/` |

Cả hai đều có cờ chặn ghi đè; chỉ chạy lại với `--force` khi thực sự hiểu hậu quả
(`migrate_once.py --force` sẽ ĐÈ MẤT mọi chỉnh sửa đã làm qua CMS).

## Trang quản trị

- Vào bằng **https://xevipsanbay.com/admin/** — trang này chỉ chuyển hướng sang web app CMS
  trên Apps Script (URL `/exec` đã cấu hình sẵn trong `html/admin/index.html`).
- URL `/exec` đó cũng nằm trong `html/js/main.js` (hằng `GAS_EXEC_URL`) để form Liên hệ gửi
  được về CMS. **Deploy lại GAS theo kiểu "New version" thì URL KHÔNG đổi** — chỉ khi tạo
  "New deployment" mới sinh URL mới, lúc đó phải sửa cả 2 chỗ trên.
- CI không cần secret nào (chỉ dùng `GITHUB_TOKEN` mặc định của Actions).

### Chặn bot vào /admin/ — 3 lớp

| Lớp | Ở đâu | Ghi chú |
|---|---|---|
| Thẻ `<meta robots/googlebot/bingbot>` | `html/admin/index.html` | Bot đọc HTML thì thấy ngay `noindex, nofollow` |
| `Disallow: /admin/` | `html/robots.txt` | Bot tuân thủ chuẩn thì không crawl tới |
| Header `X-Robots-Tag` | `html/vercel.json` | Mạnh nhất — không phụ thuộc bot có parse HTML hay không |

Thêm `<meta name="referrer" content="no-referrer">` để URL trang admin không bị rò qua header
`Referer` khi chuyển sang Apps Script.

⚠️ **Đánh đổi cần biết**: `robots.txt` là file CÔNG KHAI, ai cũng đọc được — khai
`Disallow: /admin/` ở đó vô tình cho cả thiên hạ biết đường dẫn trang quản trị (bot xấu vốn
không tuân thủ robots.txt lại càng thích). Muốn giấu hẳn đường dẫn thì bỏ dòng đó đi, chỉ giữ
2 lớp còn lại. Dù chọn cách nào thì **bảo mật thật của CMS vẫn nằm ở đăng nhập OTP** phía Apps
Script, mấy lớp trên chỉ để không lọt lên kết quả tìm kiếm.

⚠️ `html/vercel.json` đặt trong `html/` vì Root Directory của project Vercel đang trỏ vào thư
mục này. Nếu Vercel báo không thấy file cấu hình thì chuyển nó ra gốc repo.

## ⛔ Ranh giới: KHÔNG đụng luồng đặt xe

Form đặt xe (`#quickBookingForm`, `#finalBookingForm` ở trang chủ) gọi thẳng backend thật
`api.xevipsanbay.com` qua `html/js/xevip-api.js`. CMS **không** nhận, **không** lưu, **không**
proxy đơn đặt xe. Khi sửa `html/js/main.js`, chỉ đụng phần `initContactForm()` ở cuối file.
