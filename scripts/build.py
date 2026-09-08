#!/usr/bin/env python3
"""
Build site tĩnh từ data/ + templates/ — chạy bởi GitHub Actions mỗi khi data/posts.json hoặc
data/services.json đổi (2 commit CHỐT của CMS, xem .github/workflows/build.yml).

Chỉ dùng thư viện chuẩn của Python — chạy được cả trên máy dev lẫn CI runner, không cài gì.

Đọc:
  data/posts.json           index nhẹ mọi bài viết (CMS ghi khi Lưu/Xoá)
  data/blog/<slug>.json     nội dung đầy đủ 1 bài
  data/services.json        toàn bộ dịch vụ, kèm nội dung
  data/subservices.json     index nhẹ mọi danh mục con (cấp 3) của trang dịch vụ
  data/subservices/<parent>/<slug>.json   nội dung đầy đủ 1 danh mục con
  templates/post.html       khung trang bài viết   ) SỬA DESIGN Ở ĐÂY - không sửa file
  templates/blog-index.html khung trang danh sách  ) trong html/ (build sẽ ghi đè)
  templates/service.html    khung trang dịch vụ    ) - dùng cho CẢ trang danh mục con

Ghi:
  html/blog/<slug>/index.html   ghi đè mỗi lần build
  html/blog/index.html          ghi đè mỗi lần build
  html/<slug>/index.html        trang dịch vụ, ghi đè mỗi lần build
  html/<parent>/<slug>/index.html  trang danh mục con, ghi đè mỗi lần build
  html/sitemap.xml              dựng lại danh sách URL
  html/**/index.html            VÁ lại menu Dịch vụ giữa 2 mốc neo NAV_SERVICES (mọi trang,
                                kể cả trang viết tay như trang chủ / liên hệ / về chúng tôi)
Dọn:
  mọi trang MANG DẤU build.py (GENERATED_MARKER) mà không còn trong data/ (đã xoá qua CMS)
  -> xoá. Trang viết tay không mang dấu nên build không bao giờ đụng vào.
"""
import html as html_mod
import json
import os
import re
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "data")
POSTS_DATA_DIR = os.path.join(DATA_DIR, "blog")
TEMPLATES_DIR = os.path.join(BASE, "templates")
HTML_DIR = os.path.join(BASE, "html")
BLOG_HTML_DIR = os.path.join(HTML_DIR, "blog")
SITEMAP_PATH = os.path.join(HTML_DIR, "sitemap.xml")
# Danh mục con (cấp 3) nằm DƯỚI 1 trang dịch vụ: URL /<slug-cha>/<slug-con>/. Tách index/detail
# như bài viết (KHÔNG gom hết vào 1 file như services.json): số bản ghi có thể lớn dần, mà
# GitHub Contents API chỉ trả nội dung file dưới ~1MB - gom hết vào 1 file là tự đặt trần cứng
# cho CMS. Index nhẹ cũng là thứ boot() gửi xuống trình duyệt mỗi lần đăng nhập.
SUBSERVICES_INDEX_PATH = os.path.join(DATA_DIR, "subservices.json")
SUBSERVICES_DATA_DIR = os.path.join(DATA_DIR, "subservices")

SITE_URL = "https://xevipsanbay.com"
SITE_NAME = "Xe VIP Sân Bay"
SERVICE_SLUG_PREFIX = "dich-vu-"
DEFAULT_OG_IMAGE = "/images/xevipsanbay-banner2.jpeg"

# Dịch vụ thuộc nhóm "airports" (field `group` trong data/services.json) nằm dưới trang tổng
# này: sidebar liệt kê các sân bay khác, breadcrumb có 3 cấp đi qua đây. Trang tổng do người
# viết tay, build.py không sinh lại (xem STATIC_PAGES).
AIRPORT_HUB = {"name": "Dịch vụ xe taxi sân bay", "url": "/dich-vu-xe-san-bay/"}

# Dấu đóng ngay trong TRANG được sinh ra: "trang này do build.py tạo". Đây là NGUỒN CHÂN LÝ
# duy nhất để clean_orphans() biết trang nào nó có quyền xoá — không dùng file state riêng
# (bản cũ dùng data/.generated.json và đã hỏng thật: workflow chỉ `git add html/` nên manifest
# không bao giờ được commit lại, build sau đọc phải manifest cũ và không nhận ra các trang do
# chính nó sinh ra sau đó -> xoá bài qua CMS mà trang HTML vẫn nằm lại trên site).
GENERATED_MARKER = "<!-- build.py:generated -->"

NAV_START = "<!-- NAV_SERVICES_START -->"
NAV_END = "<!-- NAV_SERVICES_END -->"
DRAWER_START = "<!-- NAV_SERVICES_DRAWER_START -->"
DRAWER_END = "<!-- NAV_SERVICES_DRAWER_END -->"

# Trang tĩnh viết tay (không do build sinh ra) nhưng vẫn phải có mặt trong sitemap.
STATIC_PAGES = [
    ("/", "weekly", "1.0"),
    ("/ve-chung-toi/", "monthly", "0.6"),
    ("/lien-he/", "yearly", "0.5"),
    ("/blog/", "weekly", "0.7"),
    # Trang tổng "Dịch vụ xe taxi sân bay" — viết tay, KHÔNG nằm trong menu và KHÔNG do CMS
    # quản lý (menu chỉ gồm 12 dịch vụ trong data/services.json). Khai ở đây để nó vẫn có mặt
    # trong sitemap; build.py không sinh lại và không xoá trang này.
    ("/dich-vu-xe-san-bay/", "monthly", "0.8"),
]


def esc(s):
    return html_mod.escape(str(s or ""), quote=True)


def json_ld(obj):
    """json.dumps an toàn để nhúng trong <script type="application/ld+json">: nếu chuỗi JSON
    chứa literal "</script" (vd tiêu đề bài viết có người gõ "</script>"), trình duyệt (HTML
    parser, không phải JSON parser) sẽ đóng thẻ script bao ngoài SỚM tại đó, biến phần JSON
    còn lại thành HTML thô — chèn được markup/script tuỳ ý (XSS thật). Escape "/" trong
    "</script" thành "\\/" để phá literal đó; JSON vẫn hợp lệ."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</script", "<\\/script")


def load_json(path, default=None):
    if not os.path.exists(path):
        if default is None:
            raise SystemExit("Thiếu file dữ liệu: " + path)
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def read_template(name):
    with open(os.path.join(TEMPLATES_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def write_generated_page(path, content):
    """Ghi 1 trang do build sinh ra, có đóng GENERATED_MARKER.

    Chèn SAU <head>, không chèn trước <!DOCTYPE html>: bất kỳ thứ gì đứng trước doctype đều
    đẩy trình duyệt về quirks mode và làm vỡ layout toàn trang."""
    if GENERATED_MARKER not in content:
        if "<head>" in content:
            content = content.replace("<head>", "<head>\n  " + GENERATED_MARKER, 1)
        else:
            # Template không có <head> (không nên xảy ra) — vẫn phải đóng dấu, nếu không
            # trang đó thành "mồ côi vĩnh viễn": xoá qua CMS mà build không dám dọn.
            print("  CẢNH BÁO: không thấy <head> trong", path, "- đóng dấu ở cuối trang.")
            content = content + "\n" + GENERATED_MARKER + "\n"
    write(path, content)


def is_generated_page(path):
    """Trang có dấu của build.py hay không. Đọc từ chính file, nên đúng kể cả khi file được
    tạo bởi một lần build khác / trên máy khác / ở commit khác."""
    try:
        return GENERATED_MARKER in read(path)
    except (OSError, UnicodeDecodeError):
        return False


def render_placeholders(tpl, mapping):
    """Thay {{KEY}} trong 1 lượt quét duy nhất trên chuỗi TEMPLATE GỐC. KHÔNG dùng .replace()
    tuần tự từng key: nếu nội dung bài viết (editor nhập tự do) vô tình chứa đúng literal
    "{{TITLE}}", cách tuần tự sẽ thay nhầm nó ở bước sau — bug thật, không phải giả thuyết."""
    return re.sub(r"\{\{(\w+)\}\}", lambda m: mapping.get(m.group(1), m.group(0)), tpl)


def find_content_image(content_html):
    """Ảnh đầu tiên trong nội dung, hoặc None nếu không có (khác first_content_image: hàm này
    KHÔNG rơi về ảnh mặc định, để nơi gọi còn chèn được nấc dự phòng riêng của mình)."""
    m = re.search(r'<img[^>]+src="(/images/[^"]+)"', content_html or "")
    return m.group(1) if m else None


def first_content_image(content_html):
    return find_content_image(content_html) or DEFAULT_OG_IMAGE


# ---------------- Menu Dịch vụ (vá vào MỌI trang qua mốc neo) ----------------

def build_nav_blocks(services):
    desktop = "\n".join(
        '          <li><a href="/%s/">%s</a></li>' % (esc(s["slug"]), esc(s.get("nav_label") or s["title"]))
        for s in services
    )
    drawer = "\n".join(
        '        <a href="/%s/" class="sub-link">%s</a>' % (esc(s["slug"]), esc(s.get("nav_label") or s["title"]))
        for s in services
    )
    return "\n" + desktop + "\n          ", "\n" + drawer + "\n        "


def patch_nav(content, nav_desktop, nav_drawer, label):
    """Vá tại chỗ giữa 2 mốc neo, giữ nguyên toàn bộ phần còn lại của trang. Không tìm thấy
    mốc neo -> log CẢNH BÁO RÕ RÀNG (không im lặng bỏ qua: nghĩa là header đã bị đổi cấu trúc
    và menu Dịch vụ của trang đó sẽ không bao giờ tự cập nhật nữa)."""
    ok = True
    if NAV_START in content and NAV_END in content:
        content = re.sub(re.escape(NAV_START) + r".*?" + re.escape(NAV_END),
                         lambda m: NAV_START + nav_desktop + NAV_END, content, flags=re.S)
    else:
        ok = False
    if DRAWER_START in content and DRAWER_END in content:
        content = re.sub(re.escape(DRAWER_START) + r".*?" + re.escape(DRAWER_END),
                         lambda m: DRAWER_START + nav_drawer + DRAWER_END, content, flags=re.S)
    else:
        ok = False
    if not ok:
        print("  CẢNH BÁO: không thấy mốc neo NAV_SERVICES trong", label,
              "- menu Dịch vụ của trang này sẽ KHÔNG tự cập nhật. Kiểm tra lại header của trang.")
    return content


def patch_nav_everywhere(services):
    nav_desktop, nav_drawer = build_nav_blocks(services)
    count = 0
    for root, _dirs, files in os.walk(HTML_DIR):
        for name in files:
            if name != "index.html":
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, BASE)
            # Trang không mang header/menu của site thì không có gì để vá, và cũng KHÔNG
            # phải lỗi thiếu mốc neo - bỏ qua im lặng. Nhận biết bằng chính nội dung thay vì
            # liệt kê tay từng đường dẫn (danh sách gõ tay sẽ lỗi thời ngay khi ai đó thêm
            # trang chuyển hướng mới). Ví dụ: /admin/, các trang redirect
            # /dich-vu-xe-san-bay/<slug>/ trỏ sang URL phẳng.
            content = read(path)
            if 'class="sub-menu' not in content and "drawer-submenu-inner" not in content:
                continue
            new_content = patch_nav(content, nav_desktop, nav_drawer, rel)
            if new_content != content:
                write(path, new_content)
                count += 1
    print(f"  Menu Dịch vụ: đã cập nhật {count} trang")


# ---------------- Bài viết ----------------

def date_display(iso_date):
    y, m, d = str(iso_date).split("-")
    return f"{d}/{m}/{y}"


def build_post_cards(posts):
    cards = []
    for p in posts:
        cards.append(
            '      <a class="blog-card" href="/blog/%s/">\n'
            '        <div class="thumb"><img src="/images/%s" alt="%s" loading="lazy"></div>\n'
            '        <div class="body">\n'
            '          <h3>%s</h3>\n'
            '          <p>%s</p>\n'
            '        </div>\n'
            '      </a>' % (
                esc(p["slug"]), esc(p["cover"]), esc(p.get("cover_alt") or p["title"]),
                esc(p["title"]), esc(p.get("description") or ""),
            )
        )
    return "\n".join(cards)


def render_post_page(tpl, post):
    slug = post["slug"]
    url = f"{SITE_URL}/blog/{slug}/"
    og_image = f"{SITE_URL}/images/{post['cover']}"
    date = post["date"]

    jsonld_breadcrumb = json_ld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": "Tin tức", "item": f"{SITE_URL}/blog/"},
            {"@type": "ListItem", "position": 3, "name": post.get("breadcrumb") or post["title"], "item": url},
        ],
    })
    jsonld_article = json_ld({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "headline": post["title"],
        "description": post.get("description") or "",
        "image": og_image,
        "datePublished": date,
        "dateModified": (post.get("updated_at") or date)[:10],
        "inLanguage": "vi-VN",
        "author": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE_URL}/"},
        "publisher": {
            "@type": "Organization",
            "name": SITE_NAME,
            "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/images/logo.png"},
        },
    })
    return render_placeholders(tpl, {
        "SEO_TITLE": esc(post.get("seo_title") or post["title"]),
        "DESCRIPTION": esc(post.get("description") or ""),
        "CANONICAL_URL": url,
        "OG_IMAGE": og_image,
        "JSONLD_BREADCRUMB": jsonld_breadcrumb,
        "JSONLD_ARTICLE": jsonld_article,
        "TITLE": esc(post["title"]),
        "CONTENT_HTML": post.get("content_html") or "",
        "SIDEBAR": build_category_sidebar(),
        # NAV_SERVICES do patch_nav_everywhere() vá sau, nhưng phải xoá placeholder ở đây để
        # không lỡ lọt ra site nếu bước vá không chạy tới trang này.
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    })


# ---------------- Dịch vụ ----------------

# ================= Chuyên mục bài viết =================
# NGUỒN CHÂN LÝ DUY NHẤT của danh sách chuyên mục. Dùng cho 2 việc:
#   1. Sinh khối "Chuyên mục bài viết" ở cột phải các trang /blog/, trang bài viết và trang
#      dịch vụ thường.
#   2. Danh sách chọn Danh mục khi viết bài trong CMS — gas/Code.js có hằng POST_CATEGORIES
#      PHẢI KHỚP y hệt danh sách này (gas/ không nằm trong git nên không tự đồng bộ được;
#      sửa ở đây thì sửa luôn bên đó, xem GAS.md mục II.1).
#
# Danh sách CỐ ĐỊNH, không quản lý qua CMS (chốt với chủ dự án). Chưa có trang riêng cho từng
# chuyên mục nên mọi mục tạm trỏ chung về /blog/; khi nào làm trang lọc theo chuyên mục thì
# đổi url ở đây, mọi trang tự cập nhật theo ở lần build kế tiếp.
POST_CATEGORIES = [
    "Bảng giá",
    "Cẩm nang du lịch",
    "Chính sách",
    "Kinh nghiệm đi lại",
    "Tiện ích hay",
    "Tin tức",
]
CATEGORY_URL = "/blog/"


def sidebar_box(heading, items, heading_url=None):
    """1 khối cột phải — ĐÚNG cấu trúc <div class="sidebar-box"> + <h3> + <ul> mà CSS của site
    đang có (html/css/style.css). Thẻ bọc trước đây nằm sẵn trong templates/*.html nên cột phải
    chỉ có được ĐÚNG 1 khối; nay build sinh cả thẻ bọc để xếp được nhiều khối chồng nhau (trang
    sân bay có thêm khối danh mục con của chính nó). Đổi ở đây thì cả 3 template ăn theo."""
    head = ('<a href="%s">%s</a>' % (esc(heading_url), esc(heading))) if heading_url else esc(heading)
    return ('    <div class="sidebar-box">\n'
            "      <h3>%s</h3>\n"
            "      <ul>\n%s\n      </ul>\n"
            "    </div>") % (head, items)


def sidebar_links(pairs, current_url=None):
    """pairs: [(url, nhãn)]. Mục ứng với TRANG ĐANG MỞ in đậm và bỏ thẻ <a> — link tự trỏ về
    chính trang đang xem vừa vô nghĩa với người đọc vừa là tín hiệu xấu với công cụ tìm kiếm."""
    rows = []
    for url, label in pairs:
        if current_url and url == current_url:
            rows.append("        <li><strong>%s</strong></li>" % esc(label))
        else:
            rows.append('        <li><a href="%s">%s</a></li>' % (esc(url), esc(label)))
    return "\n".join(rows)


def build_category_sidebar():
    return sidebar_box("Chuyên mục bài viết",
                       sidebar_links([(CATEGORY_URL, name) for name in POST_CATEGORIES]))


def build_children_box(service, children, current_url=None, heading_url=None):
    """Khối liệt kê danh mục con (cấp 3) của 1 trang dịch vụ.

    Tiêu đề khối = NHÃN CỦA CHÍNH TRANG CHA (vd "Dịch vụ Sân bay Nội Bài") — chốt với chủ dự
    án, không phải một cái tên chung chung kiểu "Danh mục khác". Trên trang con, tiêu đề đó là
    link về trang cha (đường về duy nhất trong cột phải); trên chính trang cha thì để chữ
    thường."""
    pairs = [("/%s/%s/" % (service["slug"], c["slug"]), c.get("title") or c["slug"])
             for c in children]
    return sidebar_box(service.get("nav_label") or service["title"],
                       sidebar_links(pairs, current_url), heading_url=heading_url)


def build_service_sidebar(service, services, children):
    """Trang sân bay: liệt kê CÁC SÂN BAY KHÁC (tự cập nhật khi thêm/xoá dịch vụ qua CMS).
    Trang khác: khối chuyên mục bài viết tĩnh. Chọn kiểu nào là do field `group` trong
    data/services.json quyết định — KHÔNG suy đoán theo tên slug (thêm 1 dịch vụ tên na ná
    là suy đoán sai ngay).
    Có danh mục con thì nối thêm 1 khối nữa NGAY DƯỚI khối trên, cùng kiểu trình bày."""
    if service.get("group") == "airports":
        others = [s for s in services
                  if s["slug"] != service["slug"] and s.get("group") == "airports"]
        boxes = [sidebar_box("Các sân bay khác", sidebar_links(
            [("/%s/" % s["slug"], s.get("nav_label") or s["title"]) for s in others]))]
    else:
        boxes = [build_category_sidebar()]
    if children:
        boxes.append(build_children_box(service, children))
    return "\n".join(boxes)


def render_service_page(tpl, service, services, children):
    slug = service["slug"]
    url = f"{SITE_URL}/{slug}/"
    # Ưu tiên og_image đã lưu trong dữ liệu (các trang sân bay dùng ảnh ngoài, không nằm trong
    # html/images/ — mất field này là mất luôn ảnh preview khi chia sẻ link). Không có thì lấy
    # ảnh đầu tiên trong nội dung, cuối cùng mới tới ảnh mặc định của site.
    saved_og = str(service.get("og_image") or "").strip()
    if saved_og.startswith("http"):
        og_image = saved_og
    elif saved_og:
        og_image = SITE_URL + saved_og
    else:
        og_image = SITE_URL + first_content_image(service.get("content_html"))

    crumbs = [{"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{SITE_URL}/"}]
    if service.get("group") == "airports":
        crumbs.append({"@type": "ListItem", "position": 2,
                       "name": AIRPORT_HUB["name"], "item": SITE_URL + AIRPORT_HUB["url"]})
    # Cấp cuối lấy TÊN TRANG (title/h1), không phải nhãn menu - nhãn menu thường viết tắt
    # cho vừa thanh menu ("Dịch vụ Sân bay Nội Bài"), còn breadcrumb nên là tên đầy đủ
    # ("Dịch vụ đưa đón Sân bay Nội Bài").
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1,
                   "name": service["title"], "item": url})
    jsonld_breadcrumb = json_ld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": crumbs,
    })
    jsonld_service = json_ld({
        "@context": "https://schema.org",
        "@type": "Service",
        "serviceType": service["title"],
        "name": service["title"],
        "description": service.get("description") or "",
        "provider": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE_URL}/"},
        # Khu vực phục vụ: mỗi sân bay khai đúng tỉnh/thành của nó (SEO địa phương) - để mặc
        # định "VN" cho dịch vụ toàn quốc.
        "areaServed": str(service.get("area_served") or "VN"),
        "url": url,
        "image": og_image,
    })
    return render_placeholders(tpl, {
        "SEO_TITLE": esc(service.get("seo_title") or service["title"]),
        "DESCRIPTION": esc(service.get("description") or ""),
        "CANONICAL_URL": url,
        "OG_IMAGE": og_image,
        "JSONLD_BREADCRUMB": jsonld_breadcrumb,
        "JSONLD_SERVICE": jsonld_service,
        "TITLE": esc(service["title"]),
        "CONTENT_HTML": service.get("content_html") or "",
        "SIDEBAR": build_service_sidebar(service, services, children),
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    })


# ---------------- Danh mục con (cấp 3) ----------------
# Trang /<slug-cha>/<slug-con>/ — KHÔNG có mặt trong menu Dịch vụ (chốt với chủ dự án), lối vào
# duy nhất là khối danh mục ở cột phải trang cha. Dùng CHUNG templates/service.html: bố cục,
# header, footer, cột phải của nó giống hệt trang dịch vụ, nên tách ra file template thứ 2 chỉ
# tạo ra 2 bản design phải nhớ sửa song song — đúng loại lỗi mà GAS.md đã dặn né.

def load_subservices(services):
    """Đọc index + nội dung đầy đủ từng danh mục con. Bản ghi trỏ tới dịch vụ cha KHÔNG CÒN
    tồn tại thì BỎ QUA (kèm cảnh báo) chứ không làm hỏng cả lần build: trang cũ của nó không
    nằm trong danh sách trang vừa sinh nên clean_orphans() sẽ tự dọn."""
    index = load_json(SUBSERVICES_INDEX_PATH, [])
    known = {s["slug"] for s in services}
    items = []
    for meta in index:
        parent, slug = meta.get("parent"), meta.get("slug")
        if parent not in known:
            print("  CẢNH BÁO: bỏ qua danh mục con", str(parent) + "/" + str(slug),
                  "- không còn dịch vụ cha tương ứng.")
            continue
        items.append(load_json(os.path.join(SUBSERVICES_DATA_DIR, parent, slug + ".json")))
    items.sort(key=lambda c: (c["parent"], int(c.get("order") or 0)))
    return items


def group_by_parent(subservices):
    grouped = {}
    for c in subservices:
        grouped.setdefault(c["parent"], []).append(c)
    return grouped


def render_subservice_page(tpl, service, child, children):
    slug = child["slug"]
    url = f"{SITE_URL}/{service['slug']}/{slug}/"
    # Danh mục con KHÔNG có ô nhập ảnh (chốt với chủ dự án): lấy ảnh đầu tiên trong chính nội
    # dung của nó, không có thì THỪA KẾ ảnh chia sẻ của trang cha (11 trang sân bay đang dùng
    # ảnh ngoài Wikimedia), cuối cùng mới tới ảnh mặc định của site.
    own = find_content_image(child.get("content_html"))
    parent_og = str(service.get("og_image") or "").strip()
    if own:
        og_image = SITE_URL + own
    elif parent_og:
        og_image = parent_og if parent_og.startswith("http") else SITE_URL + parent_og
    else:
        og_image = SITE_URL + DEFAULT_OG_IMAGE

    crumbs = [{"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{SITE_URL}/"}]
    if service.get("group") == "airports":
        crumbs.append({"@type": "ListItem", "position": 2,
                       "name": AIRPORT_HUB["name"], "item": SITE_URL + AIRPORT_HUB["url"]})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1,
                   "name": service["title"], "item": f"{SITE_URL}/{service['slug']}/"})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1,
                   "name": child["title"], "item": url})
    jsonld_breadcrumb = json_ld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": crumbs,
    })
    jsonld_service = json_ld({
        "@context": "https://schema.org",
        "@type": "Service",
        "serviceType": child["title"],
        "name": child["title"],
        "description": child.get("description") or "",
        "provider": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE_URL}/"},
        # Khu vực phục vụ THỪA KẾ của trang cha: danh mục con của trang Nội Bài thì vẫn phục vụ
        # Hà Nội - không có ô nhập riêng để người viết bài phải khai lại (và khai lệch).
        "areaServed": str(service.get("area_served") or "VN"),
        # Nêu rõ quan hệ cha-con cho công cụ tìm kiếm, đúng thứ mà cấu trúc URL đang thể hiện.
        "isPartOf": {"@type": "Service", "name": service["title"],
                     "url": f"{SITE_URL}/{service['slug']}/"},
        "url": url,
        "image": og_image,
    })
    return render_placeholders(tpl, {
        "SEO_TITLE": esc(child.get("seo_title") or child["title"]),
        "DESCRIPTION": esc(child.get("description") or ""),
        "CANONICAL_URL": url,
        "OG_IMAGE": og_image,
        "JSONLD_BREADCRUMB": jsonld_breadcrumb,
        "JSONLD_SERVICE": jsonld_service,
        "TITLE": esc(child["title"]),
        "CONTENT_HTML": child.get("content_html") or "",
        # Cột phải: ĐÚNG 1 khối "<nhãn trang cha>" liệt kê các danh mục cùng cha, tiêu đề khối
        # là link về trang cha (chốt với chủ dự án).
        "SIDEBAR": build_children_box(service, children, current_url=f"/{service['slug']}/{slug}/",
                                      heading_url=f"/{service['slug']}/"),
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    })


# ---------------- Sitemap ----------------

def existing_lastmods():
    """Giữ nguyên lastmod của các trang tĩnh viết tay (build không biết chúng đổi lúc nào)."""
    if not os.path.exists(SITEMAP_PATH):
        return {}
    content = read(SITEMAP_PATH)
    return {
        m.group(1): m.group(2)
        for m in re.finditer(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", content)
    }


def build_sitemap(posts, services, subservices):
    known = existing_lastmods()
    fallback = max([p["date"] for p in posts] + [str(s.get("updated_at") or "")[:10] for s in services] or [""]) or "2026-01-01"

    entries = []
    for path, changefreq, priority in STATIC_PAGES:
        loc = SITE_URL + path
        entries.append((loc, known.get(loc, fallback), changefreq, priority))
    for s in services:
        loc = f"{SITE_URL}/{s['slug']}/"
        entries.append((loc, str(s.get("updated_at") or fallback)[:10], "monthly", "0.8"))
    for c in subservices:
        loc = f"{SITE_URL}/{c['parent']}/{c['slug']}/"
        entries.append((loc, str(c.get("updated_at") or fallback)[:10], "monthly", "0.7"))
    for p in posts:
        loc = f"{SITE_URL}/blog/{p['slug']}/"
        entries.append((loc, str(p.get("updated_at") or p["date"])[:10], "monthly", "0.6"))

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, changefreq, priority in entries:
        out.append("  <url>")
        out.append(f"    <loc>{loc}</loc>")
        out.append(f"    <lastmod>{lastmod}</lastmod>")
        out.append(f"    <changefreq>{changefreq}</changefreq>")
        out.append(f"    <priority>{priority}</priority>")
        out.append("  </url>")
    out.append("</urlset>")
    write(SITEMAP_PATH, "\n".join(out) + "\n")
    print(f"  sitemap.xml: {len(entries)} URL")


# ---------------- Dọn thư mục mồ côi ----------------

def clean_orphans(generated_now):
    """Xoá trang đã bị xoá qua CMS. Nếu không có bước này, trang cũ vẫn truy cập được trên
    site vô thời hạn và Google vẫn tiếp tục index nội dung đã xoá.

    ⚠️ CHỈ xoá trang do CHÍNH build.py sinh ra — nhận biết bằng GENERATED_MARKER nằm trong
    chính file HTML, KHÔNG theo quy ước tên thư mục và KHÔNG theo file state bên ngoài.

    Hai cái bẫy đã gặp thật, đừng lặp lại:
      1. Xoá theo tên ("mọi html/dich-vu-* không có trong services.json"): người khác thêm 11
         trang sân bay viết tay thì lần build sau xoá sạch, dù build chưa hề tạo ra chúng.
      2. Nhớ bằng file state data/.generated.json: workflow chỉ `git add html/` nên state
         không bao giờ được commit lại; build sau đọc state cũ, không nhận ra trang do chính
         nó sinh ra sau đó, và trang test xoá qua CMS vẫn nằm lại trên site.
    Dấu nằm trong chính trang thì không có gì để lệch: file còn đó là bằng chứng còn đó."""
    keep = set(generated_now)
    removed = 0
    for root, _dirs, files in os.walk(HTML_DIR):
        if "index.html" not in files:
            continue
        page = os.path.join(root, "index.html")
        rel_dir = os.path.relpath(root, BASE)
        if rel_dir in keep or not is_generated_page(page):
            continue
        # Thư mục trang thường chỉ có mỗi index.html. Có file lạ nằm cùng (ảnh ai đó bỏ vào,
        # trang con viết tay...) thì chỉ xoá đúng index.html của mình, không kéo theo đồ của
        # người khác.
        leftovers = [f for f in os.listdir(root) if f != "index.html"]
        if leftovers:
            os.remove(page)
            print("  Đã xoá trang mồ côi:", rel_dir + "/index.html",
                  "(giữ lại", len(leftovers), "file khác trong thư mục)")
        else:
            shutil.rmtree(root)
            print("  Đã xoá trang mồ côi:", rel_dir)
        removed += 1
    if not removed:
        print("  Không có trang mồ côi.")


# ---------------- Main ----------------

def main():
    posts_index = load_json(os.path.join(DATA_DIR, "posts.json"), [])
    services = load_json(os.path.join(DATA_DIR, "services.json"), [])
    # Bài mới hơn lên trước; cùng ngày thì giữ nguyên thứ tự trong posts.json (sort ổn định).
    posts_index = sorted(posts_index, key=lambda p: p["date"], reverse=True)
    services = sorted(services, key=lambda s: int(s.get("order") or 0))
    subservices = load_subservices(services)
    children_of = group_by_parent(subservices)

    print("1) Bài viết:")
    post_tpl = read_template("post.html")
    for p in posts_index:
        slug = p["slug"]
        detail = load_json(os.path.join(POSTS_DATA_DIR, slug + ".json"))
        out_path = os.path.join(BLOG_HTML_DIR, slug, "index.html")
        write_generated_page(out_path, render_post_page(post_tpl, detail))
        print("  +", os.path.relpath(out_path, BASE))

    index_path = os.path.join(BLOG_HTML_DIR, "index.html")
    write_generated_page(index_path, render_placeholders(read_template("blog-index.html"), {
        "POST_CARDS": build_post_cards(posts_index),
        "SIDEBAR": build_category_sidebar(),
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    }))
    print("  +", os.path.relpath(index_path, BASE))

    print("2) Dịch vụ:")
    service_tpl = read_template("service.html")
    for s in services:
        out_path = os.path.join(HTML_DIR, s["slug"], "index.html")
        write_generated_page(out_path,
                             render_service_page(service_tpl, s, services, children_of.get(s["slug"], [])))
        print("  +", os.path.relpath(out_path, BASE))

    print("3) Danh mục con:")
    by_slug = {s["slug"]: s for s in services}
    for c in subservices:
        parent = by_slug[c["parent"]]
        out_path = os.path.join(HTML_DIR, parent["slug"], c["slug"], "index.html")
        write_generated_page(out_path, render_subservice_page(
            service_tpl, parent, c, children_of[parent["slug"]]))
        print("  +", os.path.relpath(out_path, BASE))
    if not subservices:
        print("  (chưa có danh mục con nào)")

    print("4) Dọn trang mồ côi:")
    # Danh sách thư mục do CHÍNH lần build này sinh ra (đường dẫn tương đối từ gốc repo).
    generated_now = (
        [os.path.join("html", "blog")] +
        [os.path.join("html", "blog", p["slug"]) for p in posts_index] +
        [os.path.join("html", s["slug"]) for s in services] +
        [os.path.join("html", c["parent"], c["slug"]) for c in subservices]
    )
    clean_orphans(generated_now)

    print("5) Vá menu Dịch vụ vào mọi trang:")
    patch_nav_everywhere(services)

    print("6) Sitemap:")
    build_sitemap(posts_index, services, subservices)

    print(f"Build xong: {len(posts_index)} bài viết, {len(services)} dịch vụ, "
          f"{len(subservices)} danh mục con.")


if __name__ == "__main__":
    main()
