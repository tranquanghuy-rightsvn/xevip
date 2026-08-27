#!/usr/bin/env python3
"""
Build site tĩnh từ data/ + templates/ — chạy bởi GitHub Actions mỗi khi data/posts.json hoặc
data/services.json đổi (2 commit CHỐT của CMS, xem .github/workflows/build.yml).

Chỉ dùng thư viện chuẩn của Python — chạy được cả trên máy dev lẫn CI runner, không cài gì.

Đọc:
  data/posts.json           index nhẹ mọi bài viết (CMS ghi khi Lưu/Xoá)
  data/blog/<slug>.json     nội dung đầy đủ 1 bài
  data/services.json        toàn bộ dịch vụ, kèm nội dung
  templates/post.html       khung trang bài viết   ) SỬA DESIGN Ở ĐÂY - không sửa file
  templates/blog-index.html khung trang danh sách  ) trong html/ (build sẽ ghi đè)
  templates/service.html    khung trang dịch vụ    )

Ghi:
  html/blog/<slug>/index.html   ghi đè mỗi lần build
  html/blog/index.html          ghi đè mỗi lần build
  html/<slug>/index.html        trang dịch vụ, ghi đè mỗi lần build
  html/sitemap.xml              dựng lại danh sách URL
  html/**/index.html            VÁ lại menu Dịch vụ giữa 2 mốc neo NAV_SERVICES (mọi trang,
                                kể cả trang viết tay như trang chủ / liên hệ / về chúng tôi)
Dọn:
  html/blog/<slug>/ và html/dich-vu-*/ không còn trong data/ (đã xoá qua CMS) -> xoá thư mục
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

SITE_URL = "https://xevipsanbay.com"
SITE_NAME = "Xe VIP Sân Bay"
SERVICE_SLUG_PREFIX = "dich-vu-"
DEFAULT_OG_IMAGE = "/images/xevipsanbay-banner2.jpeg"

NAV_START = "<!-- NAV_SERVICES_START -->"
NAV_END = "<!-- NAV_SERVICES_END -->"
DRAWER_START = "<!-- NAV_SERVICES_DRAWER_START -->"
DRAWER_END = "<!-- NAV_SERVICES_DRAWER_END -->"

# Trang không mang header/menu của site -> bỏ qua bước vá menu (không phải lỗi thiếu mốc neo).
NO_HEADER_PAGES = {"admin"}

# Trang tĩnh viết tay (không do build sinh ra) nhưng vẫn phải có mặt trong sitemap.
STATIC_PAGES = [
    ("/", "weekly", "1.0"),
    ("/ve-chung-toi/", "monthly", "0.6"),
    ("/lien-he/", "yearly", "0.5"),
    ("/blog/", "weekly", "0.7"),
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


def render_placeholders(tpl, mapping):
    """Thay {{KEY}} trong 1 lượt quét duy nhất trên chuỗi TEMPLATE GỐC. KHÔNG dùng .replace()
    tuần tự từng key: nếu nội dung bài viết (editor nhập tự do) vô tình chứa đúng literal
    "{{TITLE}}", cách tuần tự sẽ thay nhầm nó ở bước sau — bug thật, không phải giả thuyết."""
    return re.sub(r"\{\{(\w+)\}\}", lambda m: mapping.get(m.group(1), m.group(0)), tpl)


def first_content_image(content_html):
    m = re.search(r'<img[^>]+src="(/images/[^"]+)"', content_html or "")
    return m.group(1) if m else DEFAULT_OG_IMAGE


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
            if os.path.relpath(root, HTML_DIR) in NO_HEADER_PAGES:
                continue  # trang không có header site (vd /admin/ chỉ là trang chuyển hướng)
            content = read(path)
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
        # NAV_SERVICES do patch_nav_everywhere() vá sau, nhưng phải xoá placeholder ở đây để
        # không lỡ lọt ra site nếu bước vá không chạy tới trang này.
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    })


# ---------------- Dịch vụ ----------------

def render_service_page(tpl, service):
    slug = service["slug"]
    url = f"{SITE_URL}/{slug}/"
    og_image = SITE_URL + first_content_image(service.get("content_html"))

    jsonld_breadcrumb = json_ld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": service.get("nav_label") or service["title"], "item": url},
        ],
    })
    jsonld_service = json_ld({
        "@context": "https://schema.org",
        "@type": "Service",
        "serviceType": service["title"],
        "name": service["title"],
        "description": service.get("description") or "",
        "provider": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE_URL}/"},
        "areaServed": "VN",
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


def build_sitemap(posts, services):
    known = existing_lastmods()
    fallback = max([p["date"] for p in posts] + [str(s.get("updated_at") or "")[:10] for s in services] or [""]) or "2026-01-01"

    entries = []
    for path, changefreq, priority in STATIC_PAGES:
        loc = SITE_URL + path
        entries.append((loc, known.get(loc, fallback), changefreq, priority))
    for s in services:
        loc = f"{SITE_URL}/{s['slug']}/"
        entries.append((loc, str(s.get("updated_at") or fallback)[:10], "monthly", "0.8"))
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

    ⚠️ CHỈ xoá đúng những trang mà CHÍNH build.py đã sinh ra ở lần build trước (đọc từ
    data/.generated.json), KHÔNG xoá theo quy ước tên thư mục.

    Bản đầu của hàm này xoá "mọi thư mục html/dich-vu-* không có trong services.json" — sai
    về bản chất và suýt gây hậu quả thật: người khác thêm 11 trang sân bay viết tay
    (html/dich-vu-xe-san-bay-noi-bai/...) thì lần build kế tiếp sẽ xoá sạch chúng, dù build.py
    chưa hề tạo ra chúng và không có quyền gì với chúng. Quy tắc đúng: build chỉ được xoá thứ
    do chính nó tạo ra."""
    manifest_path = os.path.join(DATA_DIR, ".generated.json")
    previous = set(load_json(manifest_path, []))
    for rel in sorted(previous - set(generated_now)):
        path = os.path.join(BASE, rel)
        if os.path.isdir(path):
            shutil.rmtree(path)
            print("  Đã xoá trang mồ côi:", rel)
    write(manifest_path, json.dumps(sorted(generated_now), ensure_ascii=False, indent=2) + "\n")


# ---------------- Main ----------------

def main():
    posts_index = load_json(os.path.join(DATA_DIR, "posts.json"), [])
    services = load_json(os.path.join(DATA_DIR, "services.json"), [])
    # Bài mới hơn lên trước; cùng ngày thì giữ nguyên thứ tự trong posts.json (sort ổn định).
    posts_index = sorted(posts_index, key=lambda p: p["date"], reverse=True)
    services = sorted(services, key=lambda s: int(s.get("order") or 0))

    print("1) Bài viết:")
    post_tpl = read_template("post.html")
    for p in posts_index:
        slug = p["slug"]
        detail = load_json(os.path.join(POSTS_DATA_DIR, slug + ".json"))
        out_path = os.path.join(BLOG_HTML_DIR, slug, "index.html")
        write(out_path, render_post_page(post_tpl, detail))
        print("  +", os.path.relpath(out_path, BASE))

    index_path = os.path.join(BLOG_HTML_DIR, "index.html")
    write(index_path, render_placeholders(read_template("blog-index.html"), {
        "POST_CARDS": build_post_cards(posts_index),
        "NAV_SERVICES": "",
        "NAV_SERVICES_DRAWER": "",
    }))
    print("  +", os.path.relpath(index_path, BASE))

    print("2) Dịch vụ:")
    service_tpl = read_template("service.html")
    for s in services:
        out_path = os.path.join(HTML_DIR, s["slug"], "index.html")
        write(out_path, render_service_page(service_tpl, s))
        print("  +", os.path.relpath(out_path, BASE))

    print("3) Dọn trang mồ côi:")
    # Danh sách thư mục do CHÍNH lần build này sinh ra (đường dẫn tương đối từ gốc repo).
    generated_now = (
        [os.path.join("html", "blog", p["slug"]) for p in posts_index] +
        [os.path.join("html", s["slug"]) for s in services]
    )
    clean_orphans(generated_now)

    print("4) Vá menu Dịch vụ vào mọi trang:")
    patch_nav_everywhere(services)

    print("5) Sitemap:")
    build_sitemap(posts_index, services)

    print(f"Build xong: {len(posts_index)} bài viết, {len(services)} dịch vụ.")


if __name__ == "__main__":
    main()
