#!/usr/bin/env python3
"""
Script CHẠY MỘT LẦN — dựng templates/ từ chính các trang HTML thật đã có sẵn của site, và
gắn mốc neo NAV_SERVICES vào mọi trang để build.py vá lại menu Dịch vụ về sau.

Vì sao không tự vẽ lại design: templates/ phải là design GỐC do người viết tay, script chỉ
thay các giá trị cụ thể (tiêu đề, mô tả, URL...) bằng placeholder {{...}}. Sau bước này,
templates/*.html là NGUỒN THIẾT KẾ SỐNG — sửa design thì sửa thẳng ở đó, KHÔNG chạy lại
script này (chạy lại sẽ đè mất tuỳ biến, nên có cờ --force chặn).

    python3 scripts/scaffold_templates.py [--force]

Bước gắn mốc neo NAV_SERVICES là idempotent (chạy lại nhiều lần vô hại) nên luôn chạy.
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_DIR = os.path.join(BASE, "html")
TEMPLATES_DIR = os.path.join(BASE, "templates")

SUBMENU_RE = re.compile(r'(<ul class="sub-menu">)(.*?)(</ul>)', re.S)
DRAWER_RE = re.compile(r'(<div class="drawer-submenu-inner">)(.*?)(</div>)', re.S)

NAV_START = "<!-- NAV_SERVICES_START -->"
NAV_END = "<!-- NAV_SERVICES_END -->"
DRAWER_START = "<!-- NAV_SERVICES_DRAWER_START -->"
DRAWER_END = "<!-- NAV_SERVICES_DRAWER_END -->"


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def inject_nav_anchors(content):
    """Bọc phần danh sách dịch vụ trong menu desktop + drawer mobile bằng mốc neo comment.
    Idempotent: đã có mốc neo thì bỏ qua."""
    changed = False

    if NAV_START not in content:
        def sub_menu(m):
            inner = m.group(2).rstrip()
            return m.group(1) + "\n          " + NAV_START + inner + "\n          " + NAV_END + "\n        " + m.group(3)
        content, n = SUBMENU_RE.subn(sub_menu, content, count=1)
        changed = changed or bool(n)

    if DRAWER_START not in content:
        def drawer(m):
            inner = m.group(2).rstrip()
            return m.group(1) + "\n        " + DRAWER_START + inner + "\n        " + DRAWER_END + "\n      " + m.group(3)
        content, n = DRAWER_RE.subn(drawer, content, count=1)
        changed = changed or bool(n)

    return content, changed


def nav_to_placeholder(content):
    """Trong TEMPLATE: thay hẳn nội dung giữa 2 mốc neo bằng placeholder."""
    content = re.sub(
        re.escape(NAV_START) + r".*?" + re.escape(NAV_END),
        NAV_START + "{{NAV_SERVICES}}" + NAV_END,
        content, flags=re.S)
    content = re.sub(
        re.escape(DRAWER_START) + r".*?" + re.escape(DRAWER_END),
        DRAWER_START + "{{NAV_SERVICES_DRAWER}}" + DRAWER_END,
        content, flags=re.S)
    return content


def step_inject_anchors():
    count = 0
    for root, _dirs, files in os.walk(HTML_DIR):
        for name in files:
            if name != "index.html":
                continue
            path = os.path.join(root, name)
            content = read(path)
            new_content, changed = inject_nav_anchors(content)
            if changed:
                write(path, new_content)
                count += 1
                print("  + mốc neo NAV_SERVICES:", os.path.relpath(path, BASE))
    print(f"  Đã gắn mốc neo vào {count} trang (các trang đã có sẵn thì bỏ qua).")


def replace_once(content, old, new, label):
    if old not in content:
        raise SystemExit(f"KHÔNG tìm thấy đoạn cần thay ({label}) — trang gốc có thể đã đổi.")
    return content.replace(old, new, 1)


def scaffold_post_template():
    src = read(os.path.join(HTML_DIR, "blog", "kinh-nghiem-don-xe-san-bay-noi-bai", "index.html"))
    title = "Kinh Nghiệm Đặt Xe Đưa Đón Sân Bay Nội Bài Giá Rẻ, Đúng Giờ"
    seo_title = title + " - Xe VIP Sân Bay"
    desc = ("Kinh nghiệm đặt xe đưa đón sân bay Nội Bài giá rẻ, đúng giờ, không lo chặt chém. "
            "Bảng giá tham khảo và checklist chọn nhà xe uy tín từ Xe VIP Sân Bay.")
    url = "https://xevipsanbay.com/blog/kinh-nghiem-don-xe-san-bay-noi-bai/"
    og_image = "https://xevipsanbay.com/images/san-bay-noi-bai-home.jpg"

    out = src
    out = out.replace(seo_title, "{{SEO_TITLE}}")
    out = out.replace(desc, "{{DESCRIPTION}}")
    out = out.replace(url, "{{CANONICAL_URL}}")
    out = out.replace(og_image, "{{OG_IMAGE}}")
    # 2 khối JSON-LD động (breadcrumb + BlogPosting) - thay nguyên khối, build.py tự sinh lại.
    out = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema\.org","@type":"BreadcrumbList".*?</script>',
                 '<script type="application/ld+json">{{JSONLD_BREADCRUMB}}</script>', out, count=1, flags=re.S)
    out = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema\.org","@type":"BlogPosting".*?</script>',
                 '<script type="application/ld+json">{{JSONLD_ARTICLE}}</script>', out, count=1, flags=re.S)
    out = replace_once(out, "<h1>" + title + "</h1>", "<h1>{{TITLE}}</h1>", "h1 banner")
    out = re.sub(r"<article>.*?</article>", "<article>\n{{CONTENT_HTML}}\n    </article>", out, count=1, flags=re.S)
    out = nav_to_placeholder(out)
    return out


def scaffold_blog_index_template():
    src = read(os.path.join(HTML_DIR, "blog", "index.html"))
    out = re.sub(r'(<div class="blog-grid">).*?(</div>\s*\n\s*</div>)',
                 r'\1\n{{POST_CARDS}}\n    \2', src, count=1, flags=re.S)
    if "{{POST_CARDS}}" not in out:
        raise SystemExit("KHÔNG tìm thấy .blog-grid trong html/blog/index.html")
    return nav_to_placeholder(out)


def scaffold_service_template():
    src = read(os.path.join(HTML_DIR, "dich-vu-xe-san-bay", "index.html"))
    seo_title = "Dịch vụ xe taxi sân bay chuyên nghiệp, giá rẻ, đón đúng giờ"
    desc = ("Dịch vụ taxi sân bay uy tín, chuyên nghiệp tại Xe VIP Sân Bay, phục vụ tất cả các "
            "sân bay lớn trên toàn quốc. Đặt xe siêu nhanh, giá cước siêu rẻ, có hóa đơn VAT.")
    url = "https://xevipsanbay.com/dich-vu-xe-san-bay/"
    og_image = "https://xevipsanbay.com/images/taxi-san-bay-noi-bai-03.jpg"

    out = src
    out = out.replace(seo_title, "{{SEO_TITLE}}")
    out = out.replace(desc, "{{DESCRIPTION}}")
    out = out.replace(url, "{{CANONICAL_URL}}")
    out = out.replace(og_image, "{{OG_IMAGE}}")
    out = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema\.org","@type":"BreadcrumbList".*?</script>',
                 '<script type="application/ld+json">{{JSONLD_BREADCRUMB}}</script>', out, count=1, flags=re.S)
    out = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema\.org","@type":"Service".*?</script>',
                 '<script type="application/ld+json">{{JSONLD_SERVICE}}</script>', out, count=1, flags=re.S)
    out = replace_once(out, "<h1>Dịch vụ xe taxi sân bay</h1>", "<h1>{{TITLE}}</h1>", "h1 banner")
    out = re.sub(r"<article>.*?</article>", "<article>\n{{CONTENT_HTML}}\n    </article>", out, count=1, flags=re.S)
    out = nav_to_placeholder(out)
    return out


def main():
    force = "--force" in sys.argv

    print("1) Gắn mốc neo NAV_SERVICES vào các trang html/ (idempotent):")
    step_inject_anchors()

    print("2) Dựng templates/:")
    targets = {
        "post.html": scaffold_post_template,
        "blog-index.html": scaffold_blog_index_template,
        "service.html": scaffold_service_template,
    }
    for name, builder in targets.items():
        path = os.path.join(TEMPLATES_DIR, name)
        if os.path.exists(path) and not force:
            print(f"  = bỏ qua {name} (đã tồn tại — dùng --force nếu THỰC SỰ muốn ghi đè bản đã tuỳ biến)")
            continue
        write(path, builder())
        print("  +", os.path.relpath(path, BASE))


if __name__ == "__main__":
    main()
