#!/usr/bin/env python3
import os
import re
import hashlib
from urllib.parse import urljoin, urlparse, unquote
from datetime import datetime

import feedparser
import requests
from bs4 import BeautifulSoup
from dateutil import parser as dtparser
from slugify import slugify
from markdownify import markdownify as md


RSS_PATH = "import/jimdo-blog.xml"
POSTS_DIR = "_posts"
IMG_ROOT = "assets/images/blog"

# Ajusta si quieres, pero -0600 funciona para México centro la mayor parte del año.
TIMEZONE_SUFFIX = "-0600"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "xolosramirez-migrator/1.0"})


def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def extract_date_and_slug_from_link(link: str):
    """
    Espera links tipo /YYYY/MM/DD/slug/  (Jimdo)
    Devuelve (datetime, raw_slug) o (None, None)
    """
    if not link:
        return None, None
    path = urlparse(link).path.strip("/")
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 4 and re.fullmatch(r"\d{4}", parts[0]) and re.fullmatch(r"\d{1,2}", parts[1]) and re.fullmatch(r"\d{1,2}", parts[2]):
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        raw_slug = parts[3]
        try:
            return datetime(y, m, d), raw_slug
        except ValueError:
            return None, None
    return None, None


def pick_date(entry, link: str) -> datetime:
    d, _ = extract_date_and_slug_from_link(link)
    if d:
        return d

    # Feedparser suele proveer published/updated
    for field in ("published", "updated"):
        v = getattr(entry, field, None)
        if v:
            try:
                return dtparser.parse(v)
            except Exception:
                pass

    # fallback
    return datetime.now()


def normalize_slug(raw_slug: str, title: str) -> str:
    base = raw_slug or title or "entrada"
    s = slugify(base, lowercase=True)
    return s or "entrada"


def safe_post_filename(date_obj: datetime, slug: str) -> str:
    return f"{date_obj.strftime('%Y-%m-%d')}-{slug}.md"


def download_image(img_url: str, dest_dir: str):
    ensure_dir(dest_dir)

    parsed = urlparse(img_url)
    ext = os.path.splitext(parsed.path)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]:
        ext = ".jpg"

    h = hashlib.sha1(img_url.encode("utf-8")).hexdigest()[:10]
    filename = f"{h}{ext}"
    out_path = os.path.join(dest_dir, filename)

    if os.path.exists(out_path):
        return out_path

    try:
        r = SESSION.get(img_url, timeout=25)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(r.content)
        return out_path
    except Exception:
        return None


def localize_images(html: str, base_url: str, date_obj: datetime, slug: str):
    """
    - Descarga imágenes a assets/images/blog/YYYY/MM/DD/slug/
    - Reescribe src a ruta local /assets/images/...
    """
    soup = BeautifulSoup(html or "", "lxml")
    img_tags = soup.find_all("img")

    downloaded = 0
    failures = 0

    rel_dir = f"{date_obj.strftime('%Y/%m/%d')}/{slug}"
    abs_dir = os.path.join(IMG_ROOT, rel_dir)
    ensure_dir(abs_dir)

    for img in img_tags:
        src = img.get("src") or img.get("data-src")
        if not src:
            continue

        abs_url = urljoin(base_url or "https://www.xolosramirez.com/", src)

        # ignora data URIs
        if abs_url.startswith("data:"):
            continue

        saved = download_image(abs_url, abs_dir)
        if saved:
            downloaded += 1
            web_path = "/" + saved.replace("\\", "/")
            img["src"] = web_path
            if img.has_attr("data-src"):
                del img["data-src"]
        else:
            failures += 1

    return str(soup), downloaded, failures


def html_to_markdown_preserve_iframes(html: str) -> str:
    """
    Convierte HTML a Markdown y preserva iframes como HTML.
    """
    soup = BeautifulSoup(html or "", "lxml")

    placeholders = []
    for iframe in soup.find_all("iframe"):
        token = f"__IFRAME_PLACEHOLDER_{len(placeholders)}__"
        placeholders.append(str(iframe))
        iframe.replace_with(token)

    md_text = md(str(soup), heading_style="ATX")

    for i, iframe_html in enumerate(placeholders):
        md_text = md_text.replace(f"__IFRAME_PLACEHOLDER_{i}__", "\n\n" + iframe_html + "\n\n")

    return md_text.strip() + "\n"


def get_entry_html(entry) -> str:
    # Preferir entry.content si existe; si no, summary.
    if getattr(entry, "content", None) and len(entry.content) > 0:
        return entry.content[0].value
    if getattr(entry, "summary", None):
        return entry.summary
    return ""


def main():
    ensure_dir(POSTS_DIR)
    ensure_dir(IMG_ROOT)
    ensure_dir("scripts")

    feed = feedparser.parse(RSS_PATH)
    entries = feed.entries

    report = []
    report.append(f"RSS: {RSS_PATH}")
    report.append(f"Items: {len(entries)}")

    created = 0
    conflicts = 0
    img_total = 0
    img_fail = 0
    items_no_link = 0

    for entry in entries:
        title = (getattr(entry, "title", "") or "").strip()
        link = (getattr(entry, "link", "") or "").strip()

        if not link:
            items_no_link += 1

        date_obj = pick_date(entry, link)
        _, raw_slug = extract_date_and_slug_from_link(link)
        raw_slug = unquote(raw_slug) if raw_slug else raw_slug
        slug = normalize_slug(raw_slug, title)

        html = get_entry_html(entry)

        # Baja y relocaliza imágenes
        html2, dcount, fcount = localize_images(html, link, date_obj, slug)
        img_total += dcount
        img_fail += fcount

        body_md = html_to_markdown_preserve_iframes(html2)

        permalink = urlparse(link).path
        if not permalink.startswith("/"):
            permalink = "/" + permalink
        if not permalink.endswith("/"):
            permalink += "/"

        filename = safe_post_filename(date_obj, slug)
        out_path = os.path.join(POSTS_DIR, filename)

        # Evitar sobreescribir: si existe, añade sufijo
        if os.path.exists(out_path):
            conflicts += 1
            k = 2
            while True:
                filename2 = filename.replace(".md", f"-{k}.md")
                out_path2 = os.path.join(POSTS_DIR, filename2)
                if not os.path.exists(out_path2):
                    out_path = out_path2
                    break
                k += 1

        frontmatter = [
            "---",
            "layout: post",
            f'title: "{title.replace(chr(34), chr(39))}"',
            f"date: {date_obj.strftime('%Y-%m-%d')} 12:00:00 {TIMEZONE_SUFFIX}",
            f"permalink: {permalink}",
            f'original_url: "{link}"',
            "---",
            "",
            f"<!-- Imported from Jimdo RSS. Original: {link} -->",
            "",
        ]

        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(frontmatter))
            f.write(body_md)

        created += 1

    report.append(f"Posts created: {created}")
    report.append(f"Filename conflicts handled: {conflicts}")
    report.append(f"Images downloaded: {img_total}")
    report.append(f"Image download failures: {img_fail}")
    report.append(f"Items without link: {items_no_link}")

    with open("scripts/import_report.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(report) + "\n")

    print("\n".join(report))


if __name__ == "__main__":
    main()
