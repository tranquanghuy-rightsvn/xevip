# GAS.md — Guideline CMS Xe VIP Sân Bay (xevipsanbay.com)

> Nguồn quyết định CHỐT của dự án này. Đọc TOÀN BỘ file này trước khi sửa bất kỳ file nào
> trong `gas/`. Không tự suy đoán/bịa thêm field, quy tắc, tên biến ngoài những gì ghi ở đây.
> Sửa code xong phải cập nhật ngược lại file này trong CÙNG 1 lượt sửa.
>
> Playbook chung: skill `free-cms-static-site-pipeline`. Dự án mẫu: `trithucworld/remake`.

## 0. Phạm vi (ĐÚNG 4 mục, không làm rộng hơn)

1. Viết bài viết (blog).
2. Quản lý liên hệ (form `/lien-he/`).
3. Quản lý dịch vụ (ít — lưu trực tiếp trong repo website, không tách DB riêng).
4. Quản lý người dùng (root / admin / editor).

⛔ **TUYỆT ĐỐI KHÔNG ĐỤNG TỚI LUỒNG ĐẶT XE.** Form đặt xe (`#quickBookingForm`,
`#finalBookingForm` trong `html/index.html`) gọi thẳng backend thật `api.xevipsanbay.com` qua
`html/js/xevip-api.js`. CMS này KHÔNG nhận, KHÔNG lưu, KHÔNG proxy đơn đặt xe. Không sửa
`xevip-api.js`, không sửa phần booking trong `main.js`. Yêu cầu tường minh của chủ dự án.

---

## I. Đăng nhập

1. Luồng: nhập email → gửi OTP qua email → nhập mã → vào Admin. Không mật khẩu, không phụ
   thuộc session Google (user thật không cùng Workspace domain với chủ script).
2. Chỉ email ĐÃ ĐĂNG KÝ (có trong sheet `Users`) mới được gửi OTP.
3. Account chủ GAS (người deploy) LUÔN hợp lệ + LUÔN là `root` ngầm định — không lưu trong
   sheet `Users`, không hiện/không quản lý được trong tab Người dùng.
   ⚠️ Bẫy bắt buộc né: `requestOtp()` phải kiểm tra `email === ownerEmail_()` SONG SONG với
   tra sheet `Users`, nếu không chính chủ script bị chặn ngay từ bước xin mã.
4. Phân quyền 3 cấp `root > admin > editor` (`ROLE_RANK = { editor: 1, admin: 2, root: 3 }`).
   Không có `viewer`. Ma trận quyền — CHỐT:

   | Chức năng | editor | admin | root |
   |---|---|---|---|
   | Bài viết (xem/thêm/sửa/xoá) | ✅ | ✅ | ✅ |
   | Dịch vụ (xem/thêm/sửa/xoá) | ✅ | ✅ | ✅ |
   | Liên hệ (xem/đổi trạng thái/xoá) | ❌ | ✅ | ✅ |
   | Người dùng (thêm/đổi quyền/xoá) | ❌ | ✅ | ✅ |

   `editor` toàn quyền với NỘI DUNG site (bài viết + dịch vụ). Ranh giới duy nhất: cố ý KHÔNG
   cho thấy thông tin khách hàng (tên/SĐT trong tab Liên hệ) và không quản lý tài khoản.
   Quyết định của chủ dự án, chặn ở CẢ client (ẩn nav-item) LẪN server (`requireRole_`).

   Qua CMS chỉ gán được quyền `admin` / `editor` (`CMS_MANAGEABLE_ROLES`). Dòng `root` chỉ
   sửa tay trong Sheet — không bao giờ qua CMS. Chặn thêm: không tự thao tác lên chính mình.
5. OTP sống 10 phút, cooldown 60 giây/email, tối đa 5 lần nhập sai rồi phải xin mã mới.
   Token phiên sống 30 ngày, lưu `localStorage`.
6. Server tự `requireRole_` ở MỌI hàm — ẩn nút trên UI không phải là bảo mật.

## II. Viết bài (blog)

1. Field CÓ ô nhập trên giao diện (không tự ý thêm/bớt):
   - **Tiêu đề**
   - **URL bài viết (slug)** — tự sinh từ tiêu đề (bỏ dấu, gạch ngang); bất biến sau lần Lưu
     đầu (mục III). URL công khai: `https://xevipsanbay.com/blog/<slug>/`.
   - **Danh mục** — **danh sách CỐ ĐỊNH**, chọn trong ô select, KHÔNG gõ tự do và KHÔNG có
     màn quản lý danh mục trong CMS (chốt với chủ dự án). Được phép để trống (4 bài migrate
     từ trang viết tay chưa có danh mục). Server tự chặn giá trị lạ, không tin `<select>`.
     6 mục hiện tại: Bảng giá, Cẩm nang du lịch, Chính sách, Kinh nghiệm đi lại, Tiện ích hay,
     Tin tức.
     ⚠️ Danh sách này nằm ở **2 nơi phải khớp nhau y hệt**, và `gas/` không nằm trong git nên
     KHÔNG tự đồng bộ được — sửa một bên phải sửa luôn bên kia:
       + `POST_CATEGORIES` trong `gas/Code.js` — danh sách chọn khi viết bài (server gửi xuống
         client qua `boot()`, client không hard-code lại).
       + `POST_CATEGORIES` trong `scripts/build.py` — sinh khối "Chuyên mục bài viết" ở cột
         phải trang `/blog/`, trang bài viết và trang dịch vụ thường.
     Chưa có trang riêng cho từng chuyên mục nên mọi mục tạm trỏ chung về `/blog/`
     (`CATEGORY_URL` trong `build.py`). Khi nào làm trang lọc theo chuyên mục thì đổi ở đó,
     mọi trang tự cập nhật ở lần build kế tiếp.
   - **Mô tả** — DUY NHẤT 1 field, dùng cho CẢ thẻ card ngoài `/blog/` LẪN `<meta name="description">`
     + `og:description`. Không tách "tóm tắt" và "mô tả SEO".
   - **Ảnh bìa** — riêng 1-1 cho từng bài, tên đặt CỨNG theo slug: `html/images/<slug>-cover.jpg`.
     Tải ảnh mới cho cùng bài = ghi đè đúng file cũ. Phải có slug (điền tiêu đề) TRƯỚC khi
     tải ảnh; tải xong thì slug tự khoá luôn.
   - **Nội dung** — TinyMCE: link, heading h2–h4, đậm/nghiêng/gạch chân, danh sách, bảng,
     chèn ảnh nhanh (nút `quickimage`, không dùng dialog mặc định).
2. Field KHÔNG có ô nhập — server tự suy lúc Lưu:
   - `seo_title` = Tiêu đề + `" - Xe VIP Sân Bay"` (đúng quy ước `<title>` của 4 bài viết tay
     đã có từ trước — giữ nguyên để không đổi SEO). `breadcrumb` = Tiêu đề. `cover_alt` = Tiêu đề.
   - `date` (ngày đăng): bài mới = ngày Lưu lần đầu (giờ VN); bài đã có = GIỮ NGUYÊN ngày gốc
     khi sửa lại. Lần sửa chỉ cập nhật `updated_at` (không hiển thị công khai như ngày đăng).
3. Danh sách bài trong Admin: GAS đọc thẳng `data/posts.json` từ GitHub Contents API mỗi lần
   `boot()` — luôn mới nhất kể cả site chưa build xong. KHÔNG fetch file JSON đã deploy.
4. Ảnh (cả bìa lẫn ảnh trong nội dung):
   - Nén phía client bằng `<canvas>` TRƯỚC khi upload: cạnh dài tối đa 1600px, JPEG q=0.85
     (luôn ép JPEG — ảnh bìa đặt tên cứng đuôi `.jpg`).
   - Publish THẲNG lên GitHub ngay lúc chọn (không qua Drive). Hiện ảnh tạm ngay, upload chạy
     ngầm, không chặn thao tác.
   - Ảnh trong nội dung: `html/images/<slug>-content-<N>.jpg`, đánh số tăng dần bất biến.
   - ⚠️ **Đường dẫn ảnh trong content lưu dạng TUYỆT ĐỐI theo domain: `/images/<file>`** —
     KHÔNG dùng `../` như dự án mẫu. Lý do: toàn bộ site xevip đã dùng đường dẫn tuyệt đối
     (`/css/style.css`, `/images/...`) ở mọi trang, và trang bài viết nằm ở `html/blog/<slug>/index.html`
     (2 cấp) nên đường dẫn tương đối rất dễ sai. Nhờ quy ước này, gotcha #14 của skill (sai độ
     sâu tương đối) KHÔNG áp dụng cho dự án này. Editor hiển thị ảnh qua URL tuyệt đối
     `raw.githubusercontent.com` (mục III), lưu xuống thì đổi ngược về `/images/...`.
   - Caption + alt: chèn ảnh xong bọc `<figure>` + `<figcaption>` chứa placeholder
     `"Sửa caption ảnh..."`, con trỏ bôi sẵn placeholder để gõ đè. `alt`/`title` = caption
     thật nếu đã nhập, còn placeholder/rỗng thì rơi về Tiêu đề bài viết (đồng bộ SỐNG mỗi khi
     nội dung hoặc tiêu đề đổi). Trước khi Lưu: xoá hẳn `<figcaption>` còn placeholder —
     tuyệt đối không để chữ "Sửa caption ảnh..." lên site thật.

## III. Sửa bài viết

- Giống viết bài, trừ: **slug bất biến** — chặn CẢ server (`throw` nếu slug gửi lên khác slug
  cũ) LẪN client (`disabled` ô slug). Mở form "Bài viết mới" ngay sau khi sửa bài phải BẬT LẠI
  `disabled = false` (form dùng lại chung DOM).
- Ảnh xem trong lúc sửa lấy qua URL tuyệt đối
  `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/html/images/<file>` — KHÔNG dùng
  domain thật (có thể chưa deploy bản mới → ảnh 404 gây hiểu nhầm).
- Muốn đổi URL thật sự: xoá bài cũ, tạo bài mới.

## IV. Xoá bài viết

- Xoá đủ trong 1 thao tác: `data/blog/<slug>.json` + ảnh bìa `<slug>-cover.jpg` + mọi ảnh
  nội dung `<slug>-content-*.jpg` + gỡ khỏi `data/posts.json` (ghi SAU CÙNG).
  An toàn xoá ảnh vì ảnh đặt tên tất định theo slug, không có cơ chế dùng chung giữa các bài.
- `build.py` tự xoá thư mục `html/blog/<slug>/` mồ côi ở lần build kế tiếp.
- Bắt buộc pop-up xác nhận trước khi xoá (không hoàn tác được).

## V. Liên hệ (form công khai `/lien-he/`)

- Nguồn DUY NHẤT: form `#contactForm` trong `html/lien-he/index.html`. Field thật của form
  hiện tại: `your-name`, `your-phone`, `your-message` → map thành `name`, `phone`, `message`.
  KHÔNG thêm field email (form không có), KHÔNG nhận đơn đặt xe (xem mục 0).
- Honeypot: input ẩn tên `_hp`. Có giá trị → âm thầm trả `{ok:true}`, không lưu, không báo lỗi.
  ⚠️ Ô này CHỈ ẩn nhờ rule `.hp-field` trong `html/css/style.css`. Mất rule đó là hỏng nghiệp
  vụ chứ không phải chỉ xấu giao diện — xem mục X.
- Rate-limit: 20 giây/lần theo số điện thoại (`CacheService`).
- Gọi từ site tĩnh (domain khác) bằng `fetch()` tới `<GAS_EXEC_URL>` với
  `Content-Type: text/plain;charset=utf-8` để né CORS preflight (GAS không xử lý OPTIONS).
- Trong Admin: xem danh sách, đổi trạng thái, xoá — **chỉ `admin`/`root`** (mục I.4), `editor`
  không thấy tab này. `status` hợp lệ: `"Mới"` / `"Đã xử lý"`.
- **Thông báo: gửi EMAIL qua `MailApp` tới `NOTIFY_EMAIL`** — **KHÔNG có địa chỉ mặc định
  trong code**, chủ dự án tự khai Script Property này (chốt lại 27/08/2026). Chưa khai thì
  không gửi mail, nhưng liên hệ VẪN được lưu vào Sheet bình thường (`requireCfg_` nằm trong
  `try` của `sendNotificationEmail_`). ⚠️ Dùng CHUNG quota Gmail 100 mail/ngày với OTP đăng nhập: nếu có ngày lượng liên
  hệ tăng cao chạm mốc đó thì OTP sẽ không gửi được — lúc đó cân nhắc tách tài khoản Gmail
  riêng cho OTP, hoặc chuyển kênh báo sang Telegram. Gửi mail lỗi KHÔNG được làm hỏng việc đã
  lưu vào Sheet (chỉ `Logger.log`).
- Dữ liệu liên hệ CHỈ nằm trong Google Sheet, **KHÔNG bao giờ ghi vào repo GitHub** (repo chứa
  site công khai — thông tin khách hàng không được lọt ra đó).

## VI. Dịch vụ

- "Các dịch vụ ít nên lưu trực tiếp ở website" → toàn bộ dịch vụ (kể cả nội dung) nằm trong
  **1 file duy nhất `data/services.json`**, không tách index/detail như bài viết.
- Field: `title`, `slug`, `seo_title`, `description` (meta description), `content_html`,
  `nav_label` (chữ hiện trong menu Dịch vụ), `order` (thứ tự trong menu), `group`,
  `area_served`, `og_image`, `created_at`, `updated_at`.
- **`group`** — `"airports"` hoặc rỗng. Quyết định 2 thứ trên trang được build ra: (a) cột bên
  phải liệt kê "Các sân bay khác" thay vì khối chuyên mục bài viết, (b) breadcrumb 3 cấp đi
  qua trang tổng `/dich-vu-xe-san-bay/`. CHỐT bằng field này, KHÔNG suy đoán theo tiền tố slug
  — thêm 1 dịch vụ tên na ná là suy đoán sai ngay.
- **`area_served`** — tỉnh/thành khai trong JSON-LD `Service` (SEO địa phương: Nội Bài = "Hà
  Nội", Đà Nẵng = "Đà Nẵng"...). Rỗng → `"VN"`.
- **`og_image`** — KHÔNG có ô nhập trên giao diện, server giữ nguyên giá trị cũ khi Lưu. Lý do:
  11 trang sân bay đang dùng ảnh NGOÀI (Wikimedia), không nằm trong `html/images/`; bỏ field
  này đi là mất ảnh preview khi chia sẻ link. Dịch vụ mới tạo qua CMS để trống → build tự lấy
  ảnh đầu tiên trong nội dung, không có thì dùng ảnh mặc định của site.
- **`seo_title` là ô nhập TUỲ CHỌN, để trống thì = `title`** — khác bài viết (bài viết suy ra
  cứng, mục II.2). Lý do: 2 trang dịch vụ hiện có đang dùng `<title>` SEO dài hơn hẳn tên hiển
  thị (vd h1 "Dịch vụ xe taxi sân bay" nhưng `<title>` là "Dịch vụ xe taxi sân bay chuyên
  nghiệp, giá rẻ, đón đúng giờ") — bỏ field này đi là mất SEO đang có trên 2 trang tiền quan
  trọng nhất của site.
- **Slug bắt buộc bắt đầu bằng `dich-vu-`** (chặn ở server) — vì trang dịch vụ nằm ngay ở gốc
  site (`html/<slug>/index.html`), tiền tố này tránh đè nhầm `blog/`, `lien-he/`, `images/`,
  `css/`, `js/`, `area/`. URL công khai: `https://xevipsanbay.com/<slug>/`.
- Slug bất biến sau khi lưu lần đầu (giống bài viết, cùng lý do SEO).
- Ảnh trong nội dung dịch vụ: `html/images/<slug>-content-<N>.jpg`, cùng cơ chế với bài viết.
- Dịch vụ KHÔNG có ảnh bìa riêng (2 trang dịch vụ hiện tại không dùng ảnh bìa).
- Xoá dịch vụ: gỡ khỏi `data/services.json` + xoá ảnh nội dung của nó; `build.py` xoá thư mục
  `html/<slug>/` mồ côi. Có pop-up xác nhận.
- Quyền: `editor` trở lên — thêm/sửa/xoá dịch vụ đầy đủ, giống bài viết.
- **Menu "DỊCH VỤ" trên toàn site tự cập nhật theo danh sách này** — `build.py` vá lại vùng
  giữa 2 mốc neo `<!-- NAV_SERVICES_START -->` / `<!-- NAV_SERVICES_END -->` (có ở cả sub-menu
  desktop lẫn drawer mobile) trong MỌI file `html/**/index.html`. Đổi design header phải GIỮ
  NGUYÊN 2 mốc neo này, nếu không build sẽ log CẢNH BÁO và bỏ qua.

## VII. Người dùng

- Tab chỉ hiện với `admin`/`root` (server vẫn tự chặn `requireRole_(token, "admin")`).
- Thêm mới: nhập email + chọn quyền (`admin` / `editor`). Người đó tự đăng nhập bằng OTP gửi
  tới email đó — không cấp mật khẩu.
- Đổi quyền: chỉ đổi được giữa `admin` ↔ `editor`. Dòng đang có quyền `root` → từ chối, báo
  rõ "sửa trực tiếp trong Sheet".
- Không cho tự đổi quyền/xoá chính tài khoản đang đăng nhập (tránh tự khoá mình ra ngoài).
- Không hiện/không quản lý được account chủ GAS.

## VIII. UX chung (áp dụng cho MỌI thao tác trong Admin)

- 2 loại pop-up RIÊNG BIỆT, giữa màn hình, KHÔNG dùng `alert()`/`confirm()` native, KHÔNG toast:
  1. **Xác nhận** (Huỷ / Xoá) — hỏi TRƯỚC khi bắt đầu xử lý.
  2. **Thông báo kết quả** (1 nút Đóng) — hiện SAU khi xong, không tự ẩn.
- Mọi thao tác làm đổi nội dung site thật kèm dòng nhắc: *"Website sẽ được cập nhật sau 1-2
  phút!"* (build CI + Vercel deploy có độ trễ).
- Mọi nút async: `disabled` + spinner trong lúc chờ, tự phục hồi kể cả khi lỗi (`finally`).
- Sau Lưu/Xoá thành công: quay lại đúng màn DANH SÁCH của chính entity đó, danh sách tự cập
  nhật ngay (không đợi F5), và F5 ngay sau đó cũng không được hiện lại dữ liệu cũ.
- Chuyển tab chỉ là hiệu ứng giao diện — không tải lại trang, không gọi lại toàn bộ dữ liệu.
- Đăng nhập lần đầu: 1 round-trip `boot(token)` duy nhất lấy hết (me, appHtml, posts, services,
  github). Lần sau: hiện ngay từ cache localStorage rồi revalidate ngầm.
- Mọi key `localStorage` (TRỪ token đăng nhập) mang hậu tố `CLIENT_BUILD`, + hàm
  `purgeStaleCaches_()` tự dọn key khác phiên bản lúc tải script.
- **`CLIENT_BUILD` TỰ SINH, không ai phải nhớ bump.** Server băm MD5 nội dung `app.html` +
  `js.html` (`clientBuild_()` trong `Code.js`), bơm xuống client qua `index.html`
  (`window.CLIENT_BUILD`); `js.html` chỉ đọc lại giá trị đó. Sửa 1 trong 2 file = băm ra khác
  = mọi key cache đổi theo = cache cũ tự bị dọn.
  Dự án khác cùng playbook dùng hằng số gõ tay và đã dính bug thật vì có người quên tăng (mục
  X). Ở đây cố ý KHÔNG làm vậy: bắt con người nhớ một việc máy làm được là thiết kế sai — bug
  sẽ tái diễn đúng vào lần quên đầu tiên. Không thêm lại hằng số gõ tay dưới bất kỳ hình thức nào.
- TinyMCE chỉ `init` SAU KHI tab chứa nó đã `display:block` (init lúc còn ẩn → editor cao 0px).

## IX. Kiến trúc lưu trữ

**Google Sheet "Xe VIP CMS Data"** (tự tạo lần đầu, `SPREADSHEET_ID` tự lưu lại) — tên
sheet/cột CỐ ĐỊNH:
- `Users` — `email`, `role`.
- `Contacts` — `id`, `created_at`, `name`, `phone`, `message`, `status`.
  Chỉ Admin xem, không bao giờ hiển thị công khai / không đẩy lên GitHub.

**GitHub (Contents API)** — đường dẫn CỐ ĐỊNH, đổi phải sửa luôn `scripts/build.py` + CI:
- `data/posts.json` — index nhẹ mọi bài viết. **Commit CHỐT** của Lưu/Xoá bài → trigger CI.
- `data/blog/<slug>.json` — nội dung đầy đủ 1 bài.
- `data/services.json` — TOÀN BỘ dịch vụ (kèm content). **Commit CHỐT** của Lưu/Xoá dịch vụ.
- `html/images/<slug>-cover.jpg`, `html/images/<slug>-content-<N>.jpg` — ảnh, ghi THẲNG vào
  vị trí site thật.

**File index tổng LUÔN ghi SAU CÙNG** trong 1 thao tác (nó là file trigger CI).

**Ai ghi / ai sửa được:**

| Thư mục | Ai ghi | Sửa tay được? |
|---|---|---|
| `data/**` | GAS (CMS) | ❌ (build lại sẽ mất) |
| `html/blog/<slug>/index.html`, `html/blog/index.html`, `html/dich-vu-*/index.html` | `build.py` (CI) | ❌ (CI ghi đè) |
| `html/index.html`, `html/ve-chung-toi/`, `html/lien-he/` | Người | ✅ (CI chỉ vá vùng NAV_SERVICES) |
| `templates/*.html` | Người | ✅ — đây chính là chỗ sửa design |
| `html/images/**` | GAS | không cần |

**Trang quản trị**: `https://xevipsanbay.com/admin/` (trang tĩnh chuyển hướng) → web app GAS
`https://script.google.com/macros/s/AKfycbwjfcy82c6_ywQIN_pffWpCiAEfw-pVPDR996NOPEqwq5SobbP4GiX26npARxfligFHbQ/exec`.
URL này nằm ở 2 chỗ trong repo: `html/admin/index.html` và `html/js/main.js` (hằng
`GAS_EXEC_URL`). Deploy lại bằng "New version" thì URL giữ nguyên; chỉ "New deployment" mới đổi.
Chặn bot 3 lớp: meta robots trong trang admin + `Disallow: /admin/` trong `robots.txt` +
header `X-Robots-Tag` trong `html/vercel.json`.

**Hosting**: Vercel (đã nối sẵn repo này). CI GitHub Actions chỉ build `html/` rồi commit —
Vercel tự deploy khi có commit mới. Độ trễ thực tế từ lúc bấm Lưu tới lúc thấy trên site:
khoảng 1–2 phút.

## X. Checklist bug phải né (đúc kết từ dự án thật cùng playbook)

- **Đăng nhập được nhưng không vào được Admin** → thường do `requestOtp` quên ngoại lệ chủ
  script (mục I.3), hoặc so email chưa `trim().toLowerCase()`.
- **Sửa code, deploy đúng, F5 vẫn thấy giao diện CŨ** → cache `localStorage` của chính app giữ
  `appHtml` cũ. Fix ĐỦ 2 lớp: (1) `CLIENT_BUILD` (tự băm từ nội dung file, mục VIII) ghép vào
  mọi key + `purgeStaleCaches_()`; (2) revalidate ngầm so `appHtml` mới ≠ cũ thì vẽ lại DOM
  (giữ đúng tab đang xem, KHÔNG vẽ đè khi đang mở form soạn). ⛔ Không bao giờ "chữa" bằng
  cách bảo khách tự xoá localStorage.
  Test bắt buộc: F5 khi localStorage còn cache CŨ → giao diện phải tự đúng ngay lần F5 đầu.
- **Hàm chạy ngầm nuốt lỗi (`.catch(() => {})`)** → luôn `console.warn`/`console.error`.
- **TinyMCE "không chạy"** (ô nội dung trống/cao 0px) → do init lúc tab còn ẩn (mục VIII).
- **GitHub 422 "sha wasn't supplied"** khi publish nhiều file liên tiếp nhanh → eventual
  consistency, không phải lỗi logic. Vá: retry-once + `Utilities.sleep(500)` trong PUT.
- **`isNew` tính bằng `!rec.id`/`!rec.slug`** → sai khi client đã có slug từ trước lúc Lưu lần
  đầu (chèn ảnh cần slug). Phải xác định bằng "slug đã có trong index chưa".
- **CI trigger theo `data/**`** → build ở commit dở dang. Chỉ trigger đúng 2 file index tổng.
- **Sheets tự convert `"YYYY-MM-DD"` thành Date** → luôn `Utilities.formatDate` khi đọc ra.
- **[ĐÃ GẶP THẬT trên production, 27/08/2026] Gửi form Liên hệ mà không có gì được lưu vào
  Sheet, cũng không báo lỗi gì** → rule CSS `.hp-field` (ẩn ô honeypot `_hp`) bị mất trong một
  lần merge lấy `style.css` bản remote. Ô bẫy hiện ra như một ô nhập bình thường ngay dưới
  "Nội dung"; khách thật hoặc autofill của trình duyệt điền vào là server coi như bot, ÂM THẦM
  bỏ qua và vẫn trả `{ok:true}` — mất khách mà không ai biết.
  Cách né: sau MỌI lần merge/đổi `style.css`, kiểm lại
  `curl -s https://xevipsanbay.com/css/style.css | grep -c hp-field` phải ra khác 0. Bản chất
  vấn đề: cơ chế honeypot phụ thuộc 1 rule CSS ở file khác — hỏng thì hỏng im lặng, không
  có lỗi nào để lần ra.
- **Tưởng "form không lưu được" nhưng thật ra đang mở NHẦM Spreadsheet** → `SPREADSHEET_ID`
  không phải khai tay (code tự tạo Sheet lần chạy đầu và tự lưu id lại), nên rất dễ không biết
  dữ liệu nằm ở file nào trong Drive. Tab Liên hệ trong CMS có nút **"⧉ Mở Google Sheet"** trỏ
  đúng file thật (`getDataSheetUrl`) — dùng nút đó thay vì tự tìm trong Drive.
- **Đổi `let` → `const` khi dọn code** mà biến còn bị gán lại ở nhánh khác → `TypeError`.

## XI. Script Properties (Project Settings > Script Properties) — TÊN CỐ ĐỊNH

- `GITHUB_TOKEN` — bắt buộc. PAT có quyền ghi repo `xevip`.
- `GITHUB_OWNER` — bắt buộc (`tranquanghuy-rightsvn`).
- `GITHUB_REPO` — bắt buộc (`xevip`).
- `GITHUB_BRANCH` — bắt buộc (`master`).
- `NOTIFY_EMAIL` — **bắt buộc nếu muốn nhận mail báo liên hệ**; không có giá trị mặc định
  trong code. Để trống = không gửi mail (liên hệ vẫn lưu vào Sheet bình thường).
- `SPREADSHEET_ID` — KHÔNG cần điền, code tự tạo Sheet lần đầu và tự lưu lại.
