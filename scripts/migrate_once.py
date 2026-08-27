#!/usr/bin/env python3
"""
Script CHẠY MỘT LẦN — bóc 4 bài viết + 2 trang dịch vụ đang viết tay trong html/ thành dữ
liệu CMS trong data/, để từ nay sửa được qua trang quản trị.

    python3 scripts/migrate_once.py [--force]

Không đổi URL công khai của bất kỳ trang nào (slug = đúng tên thư mục hiện tại). Sau bước này
chạy scripts/build.py là html/ được sinh lại từ data/ — nội dung phải giống hệt bản viết tay.

Ảnh bìa: 4 bài viết chưa theo quy ước "<slug>-cover.jpg" (CMS yêu cầu), nên script COPY ảnh
og:image hiện tại của từng bài thành đúng tên đó. Ảnh gốc giữ nguyên (có thể còn chỗ khác dùng).
"""
import html as html_mod
import json
import os
import re
import shutil
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_DIR = os.path.join(BASE, "html")
DATA_DIR = os.path.join(BASE, "data")
IMAGES_DIR = os.path.join(HTML_DIR, "images")

SITE_URL = "https://xevipsanbay.com"
SITE_TITLE_SUFFIX = " - Xe VIP Sân Bay"
# Dữ liệu migrate KHÔNG được khai "vừa sửa hôm nay" - sẽ làm dateModified/lastmod nói dối là
# nội dung vừa đổi trong khi thực chất y nguyên. Lấy đúng mốc đang có trên site: bài viết dùng
# ngày đăng của chính nó, dịch vụ dùng <lastmod> đang khai trong sitemap.xml.
SITEMAP_PATH = os.path.join(HTML_DIR, "sitemap.xml")


def sitemap_lastmod(url, fallback):
    if not os.path.exists(SITEMAP_PATH):
        return fallback
    m = re.search(r"<loc>%s</loc>\s*<lastmod>([^<]+)</lastmod>" % re.escape(url), read(SITEMAP_PATH))
    return m.group(1) if m else fallback


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def find1(pattern, content, label, flags=0):
    m = re.search(pattern, content, flags)
    if not m:
        raise SystemExit(f"KHÔNG bóc được {label} — trang gốc có thể đã đổi cấu trúc.")
    return m.group(1)


def text_of(raw):
    return html_mod.unescape(raw).strip()


def article_html(content):
    inner = find1(r"<article>(.*?)</article>", content, "nội dung <article>", re.S)
    # Bỏ thụt lề 6 space của bản viết tay để content_html sạch (build.py tự thụt lại khi render)
    lines = [re.sub(r"^      ", "", ln) for ln in inner.strip("\n").split("\n")]
    return "\n".join(lines).strip() + "\n"


def meta_content(content, attr, name):
    return text_of(find1(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(name)), content,
                         f"meta {name}"))


def migrate_posts():
    blog_dir = os.path.join(HTML_DIR, "blog")
    on_disk = {
        d for d in os.listdir(blog_dir)
        if os.path.isdir(os.path.join(blog_dir, d)) and os.path.exists(os.path.join(blog_dir, d, "index.html"))
    }
    # Giữ ĐÚNG thứ tự thẻ bài viết đang hiển thị ở /blog/ - 4 bài hiện có cùng 1 ngày đăng nên
    # nếu chỉ sắp theo ngày thì thứ tự sẽ bị xáo so với bản viết tay (đổi giao diện vô cớ).
    listed = re.findall(r'<a class="blog-card" href="/blog/([^/"]+)/"',
                        read(os.path.join(blog_dir, "index.html")))
    slugs = [s for s in listed if s in on_disk] + sorted(on_disk - set(listed))
    index = []
    for slug in slugs:
        page = read(os.path.join(blog_dir, slug, "index.html"))
        title = text_of(find1(r'<div class="page-title-banner">\s*<h1>(.*?)</h1>', page, f"h1 của {slug}", re.S))
        description = meta_content(page, "name", "description")
        og_image = meta_content(page, "property", "og:image")
        date = find1(r'"datePublished":"(\d{4}-\d{2}-\d{2})"', page, f"datePublished của {slug}")

        # Ảnh bìa: copy ảnh og:image hiện tại sang đúng tên quy ước của CMS.
        src_name = og_image.rsplit("/", 1)[-1]
        cover_name = slug + "-cover.jpg"
        src_path = os.path.join(IMAGES_DIR, src_name)
        dst_path = os.path.join(IMAGES_DIR, cover_name)
        if not os.path.exists(src_path):
            raise SystemExit(f"Không thấy ảnh og:image của {slug}: {src_path}")
        if not os.path.exists(dst_path):
            shutil.copyfile(src_path, dst_path)
            print("  + ảnh bìa:", os.path.relpath(dst_path, BASE))

        detail = {
            "slug": slug,
            "title": title,
            "seo_title": title + SITE_TITLE_SUFFIX,
            "breadcrumb": title,
            "description": description,
            # Danh mục để trống - trang cũ không hiển thị danh mục ở đâu cả, không tự bịa.
            # Vào CMS gõ danh mục cho từng bài lúc nào cũng được.
            "category": "",
            "date": date,
            "cover": cover_name,
            "cover_alt": title,
            "content_html": article_html(page),
            "updated_at": date + "T00:00:00Z",
        }
        write_json(os.path.join(DATA_DIR, "blog", slug + ".json"), detail)
        print("  +", os.path.relpath(os.path.join(DATA_DIR, "blog", slug + ".json"), BASE))
        index.append({k: detail[k] for k in
                      ("slug", "title", "description", "category", "date", "cover", "cover_alt", "updated_at")})

    # sort ỔN ĐỊNH: bài mới hơn lên trước, cùng ngày thì giữ nguyên thứ tự ở trên.
    index.sort(key=lambda p: p["date"], reverse=True)
    write_json(os.path.join(DATA_DIR, "posts.json"), index)
    print(f"  = data/posts.json ({len(index)} bài)")


def migrate_services():
    """Thứ tự + nhãn menu lấy đúng theo menu "DỊCH VỤ" đang có trên trang chủ, không tự đặt lại."""
    home = read(os.path.join(HTML_DIR, "index.html"))
    nav_block = find1(r"<!-- NAV_SERVICES_START -->(.*?)<!-- NAV_SERVICES_END -->", home,
                      "menu dịch vụ trên trang chủ (chạy scaffold_templates.py trước)", re.S)
    nav_items = re.findall(r'<li><a href="/([^/"]+)/">(.*?)</a></li>', nav_block)
    if not nav_items:
        raise SystemExit("Menu dịch vụ trống — kiểm tra lại html/index.html")

    services = []
    for order, (slug, nav_label) in enumerate(nav_items, start=1):
        path = os.path.join(HTML_DIR, slug, "index.html")
        if not os.path.exists(path):
            raise SystemExit(f"Menu trỏ tới /{slug}/ nhưng không có file {path}")
        page = read(path)
        lastmod = sitemap_lastmod(f"{SITE_URL}/{slug}/", "2026-08-11")
        services.append({
            "slug": slug,
            "title": text_of(find1(r'<div class="page-title-banner">\s*<h1>(.*?)</h1>', page, f"h1 của {slug}", re.S)),
            # Giữ NGUYÊN <title> SEO đang có (dài hơn tên hiển thị) - xem GAS.md mục VI.
            "seo_title": text_of(find1(r"<title>(.*?)</title>", page, f"title của {slug}", re.S)),
            "description": meta_content(page, "name", "description"),
            "nav_label": text_of(nav_label),
            "order": order,
            "content_html": article_html(page),
            "created_at": lastmod + "T00:00:00Z",
            "updated_at": lastmod + "T00:00:00Z",
        })
        print("  + dịch vụ:", slug)

    write_json(os.path.join(DATA_DIR, "services.json"), services)
    print(f"  = data/services.json ({len(services)} dịch vụ)")


def main():
    force = "--force" in sys.argv
    posts_json = os.path.join(DATA_DIR, "posts.json")
    if os.path.exists(posts_json) and not force:
        raise SystemExit(
            "data/posts.json đã tồn tại — migrate là thao tác CHẠY MỘT LẦN.\n"
            "Chạy lại sẽ ĐÈ MẤT mọi chỉnh sửa đã làm qua CMS. Dùng --force nếu thực sự muốn."
        )
    print("1) Bài viết:")
    migrate_posts()
    print("2) Dịch vụ:")
    migrate_services()
    print("Xong. Chạy tiếp: python3 scripts/build.py")


if __name__ == "__main__":
    main()
