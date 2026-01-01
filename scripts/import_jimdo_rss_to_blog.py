#!/usr/bin/env python3
"""Importador de artículos desde el RSS de Jimdo al blog estático.

Tareas principales:
- Leer /import/jimdo-blog.xml.
- Generar un HTML por artículo usando blog/plantilla-entrada.html.
- Actualizar blog/index.html con todas las entradas ordenadas por fecha desc.
- Registrar un reporte en scripts/import_report.txt.
"""

from __future__ import annotations

import email.utils
import html
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup, Comment


REPO_ROOT = Path(__file__).resolve().parents[1]
RSS_PATH = REPO_ROOT / "import" / "jimdo-blog.xml"
BLOG_DIR = REPO_ROOT / "blog"
TEMPLATE_PATH = BLOG_DIR / "plantilla-entrada.html"
INDEX_PATH = BLOG_DIR / "index.html"
REPORT_PATH = REPO_ROOT / "scripts" / "import_report.txt"
CANONICAL_BASE = "https://xolosarmy.github.io/xolosramirez/blog/"
MONTH_NAMES = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
]


@dataclass
class RSSItem:
    title: str
    link: str
    pub_date: Optional[datetime]
    description_html: str

    @property
    def slug(self) -> str:
        parsed = urlparse(self.link)
        last_segment = unquote(parsed.path.rstrip("/ ").split("/")[-1]) or self.title
        normalized = (
            unicodedata.normalize("NFD", last_segment)
            .encode("ascii", "ignore")
            .decode("ascii")
        )
        normalized = re.sub(r"[^a-zA-Z0-9\-]+", "-", normalized.lower()).strip("-")
        return normalized or "entrada"

    def preferred_date(self) -> Optional[datetime]:
        path_date = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", self.link)
        if path_date:
            y, m, d = map(int, path_date.groups())
            try:
                return datetime(y, m, d)
            except ValueError:
                pass
        return self.pub_date


def read_rss_items() -> List[RSSItem]:
    import xml.etree.ElementTree as ET

    root = ET.parse(RSS_PATH).getroot()
    items = []
    for node in root.findall(".//item"):
        title = (node.findtext("title") or "").strip()
        link = (node.findtext("link") or "").strip()
        pub_raw = node.findtext("pubDate")
        pub_date = None
        if pub_raw:
            try:
                pub_date = email.utils.parsedate_to_datetime(pub_raw)
            except (TypeError, ValueError):
                pub_date = None
        desc = node.findtext("description") or ""
        # Jimdo envía un encabezado XML dentro del CDATA; eliminamos si aparece.
        desc = re.sub(r"^\s*<\?xml[^>]*>", "", desc).strip()
        items.append(RSSItem(title=title, link=link, pub_date=pub_date, description_html=desc))
    return items


def load_template_soup() -> BeautifulSoup:
    html_text = TEMPLATE_PATH.read_text(encoding="utf-8")
    return BeautifulSoup(html_text, "html.parser")


def plain_excerpt(html_content: str, limit: int = 160) -> str:
    soup = BeautifulSoup(html_content, "html.parser")
    text = " ".join(soup.get_text(separator=" ").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def format_date_display(dt: datetime) -> str:
    return f"{dt.day} {MONTH_NAMES[dt.month - 1]} {dt.year}"


def build_article_html(item: RSSItem, template_soup: BeautifulSoup, filename: str) -> str:
    soup = BeautifulSoup(str(template_soup), "html.parser")

    doc_title = soup.find("title")
    if doc_title:
        doc_title.string = f"{item.title} | Xolos Ramírez"

    meta_desc = soup.find("meta", attrs={"name": "description"})
    excerpt = plain_excerpt(item.description_html)
    if meta_desc:
        meta_desc["content"] = excerpt
    else:
        new_meta = soup.new_tag("meta", attrs={"name": "description", "content": excerpt})
        soup.head.append(new_meta)

    canonical_href = CANONICAL_BASE + filename
    existing_canonical = soup.find("link", attrs={"rel": "canonical"})
    if existing_canonical:
        existing_canonical["href"] = canonical_href
    else:
        soup.head.append(soup.new_tag("link", rel="canonical", href=canonical_href))

    hero = soup.find("section", class_="hero")
    if hero:
        h1 = hero.find("h1")
        if h1:
            h1.string = item.title
        p = hero.find("p")
        if p:
            p.string = excerpt

    date_value = item.preferred_date()
    main_container = soup.find("section", class_="container")
    if main_container:
        main_container.clear()
        main_container["data-aos"] = main_container.get("data-aos", "fade-up")
        main_container["data-aos-duration"] = main_container.get("data-aos-duration", "1000")

        meta_div = soup.new_tag("div", **{"class": "article-meta"})
        if date_value:
            time_tag = soup.new_tag("time")
            time_tag["datetime"] = date_value.strftime("%Y-%m-%d")
            time_tag.string = format_date_display(date_value)
            meta_div.append(time_tag)
            meta_div.append(soup.new_tag("span")).string = "•"
        author_span = soup.new_tag("span")
        author_span.string = "Autor/a: Xolos Ramírez"
        meta_div.append(author_span)
        main_container.append(meta_div)

        main_container.append(Comment(f" Original URL: {item.link} "))

        content_frag = BeautifulSoup(item.description_html, "html.parser")
        for child in content_frag.contents:
            main_container.append(child)

    # También actualizamos el <main> hero meta si existe sección con clase hero__copy
    hero_copy = soup.find("div", class_="hero__copy")
    if hero_copy:
        hero_copy_title = hero_copy.find("h1")
        if hero_copy_title:
            hero_copy_title.string = item.title
        hero_copy_excerpt = hero_copy.find("p")
        if hero_copy_excerpt:
            hero_copy_excerpt.string = excerpt
        meta_p = hero_copy.find("p", class_="meta")
        if meta_p and date_value:
            meta_p.string = f"{format_date_display(date_value)}"

    return ensure_single_doctype(soup.prettify(formatter="minimal"))


def derive_filename(item: RSSItem, existing_names: set[str]) -> Tuple[str, Optional[str]]:
    conflict_note = None
    date_value = item.preferred_date()
    base = f"{date_value.strftime('%Y-%m-%d')}-" if date_value else ""
    candidate = base + item.slug
    name = candidate
    suffix = 1
    while f"{name}.html" in existing_names:
        suffix += 1
        name = f"{candidate}-{suffix}"
        conflict_note = f"Conflicto de nombre para {candidate}.html, se creó {name}.html"
    return f"{name}.html", conflict_note


@dataclass
class Report:
    total_items: int = 0
    created: int = 0
    skipped_identical: int = 0
    conflicts: List[str] = None
    missing_date: List[str] = None

    def __post_init__(self):
        self.conflicts = [] if self.conflicts is None else self.conflicts
        self.missing_date = [] if self.missing_date is None else self.missing_date

    def write(self):
        lines = [
            f"Total items RSS: {self.total_items}",
            f"Total posts creados: {self.created}",
            f"Posts idénticos omitidos: {self.skipped_identical}",
            f"Conflictos/duplicados: {len(self.conflicts)}",
        ]
        lines += ["- " + c for c in self.conflicts]
        lines.append(f"Items sin fecha/slug de link: {len(self.missing_date)}")
        lines += ["- " + m for m in self.missing_date]
        REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate_posts(items: List[RSSItem]) -> None:
    template_soup = load_template_soup()
    existing_names = {p.name for p in BLOG_DIR.glob("*.html")}
    report = Report(total_items=len(items))

    for item in items:
        filename, conflict = derive_filename(item, existing_names)
        target_path = BLOG_DIR / filename
        existing_names.add(filename)
        if conflict:
            report.conflicts.append(conflict)
        if not item.preferred_date():
            report.missing_date.append(item.link or item.title)

        article_html = build_article_html(item, template_soup, filename)
        if target_path.exists():
            if target_path.read_text(encoding="utf-8") == article_html:
                report.skipped_identical += 1
                continue
        target_path.write_text(article_html, encoding="utf-8")
        report.created += 1

    report.write()


def parse_post_metadata(html_path: Path) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    title_tag = soup.find("h1") or soup.find("title")
    title = (title_tag.get_text(strip=True) if title_tag else html_path.stem).split("|")[0].strip()

    meta_desc = soup.find("meta", attrs={"name": "description"})
    excerpt = meta_desc["content"].strip() if meta_desc and meta_desc.get("content") else ""
    if not excerpt:
        excerpt = plain_excerpt(str(soup.find("main") or soup))

    time_tag = soup.find("time")
    date_value = None
    if time_tag and time_tag.has_attr("datetime"):
        try:
            date_value = datetime.fromisoformat(time_tag["datetime"])
        except ValueError:
            date_value = None
    if not date_value:
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})-", html_path.name)
        if match:
            y, m, d = map(int, match.groups())
            try:
                date_value = datetime(y, m, d)
            except ValueError:
                date_value = None

    hero_img = None
    hero = soup.find("section", class_="hero")
    if hero:
        img_tag = hero.find("img")
        if img_tag and img_tag.get("src"):
            hero_img = (img_tag["src"], img_tag.get("alt") or title)
    if not hero_img:
        hero_img = ("../img/hero/hero-placeholder.svg", title)

    return {
        "title": title,
        "excerpt": excerpt,
        "date": date_value,
        "image": hero_img,
        "link": html_path.name,
    }


def rebuild_index():
    soup = BeautifulSoup(INDEX_PATH.read_text(encoding="utf-8"), "html.parser")
    grid_section = soup.find("section", class_="grid")
    if not grid_section:
        raise RuntimeError("No se encontró la sección grid en blog/index.html")

    # Limpiamos artículos existentes
    for article in grid_section.find_all("article", class_="post-card"):
        article.decompose()

    posts = []
    for html_file in BLOG_DIR.glob("*.html"):
        if html_file.name in {"index.html", "plantilla-entrada.html"}:
            continue
        if html_file.name.endswith("blog.css"):
            continue
        posts.append(parse_post_metadata(html_file))

    def sort_key(p):
        return (p["date"] is not None, p["date"] or datetime.min, p["title"].lower())

    posts.sort(key=sort_key, reverse=True)

    for post in posts:
        article = soup.new_tag("article", **{"class": "post-card"})
        media_link = soup.new_tag(
            "a",
            **{
                "class": "post-card__media",
                "href": post["link"],
                "aria-label": f"Leer: {post['title']}",
            },
        )
        img_src, img_alt = post["image"]
        img_tag = soup.new_tag(
            "img",
            src=img_src,
            alt=img_alt,
            width="640",
            height="360",
            loading="lazy",
            decoding="async",
        )
        media_link.append(img_tag)
        article.append(media_link)

        body = soup.new_tag("div", **{"class": "post-card__body"})
        if post["date"]:
            time_tag = soup.new_tag(
                "time",
                datetime=post["date"].strftime("%Y-%m-%d"),
                **{"class": "post-card__date"},
            )
            time_tag.string = format_date_display(post["date"])
            body.append(time_tag)

        title_tag = soup.new_tag("h2", **{"class": "post-card__title"})
        title_link = soup.new_tag("a", href=post["link"])
        title_link.string = post["title"]
        title_tag.append(title_link)
        body.append(title_tag)

        excerpt_p = soup.new_tag("p", **{"class": "post-card__excerpt"})
        excerpt_p.string = post["excerpt"]
        body.append(excerpt_p)

        btn = soup.new_tag("a", **{"class": "btn btn--sm", "href": post["link"]})
        btn.string = "Leer más"
        body.append(btn)

        article.append(body)
        grid_section.append(article)

    INDEX_PATH.write_text(ensure_single_doctype(soup.prettify(formatter="minimal")), encoding="utf-8")


def ensure_single_doctype(html_text: str) -> str:
    return re.sub(r"^<!DOCTYPE html>\\s*<!DOCTYPE html>", "<!DOCTYPE html>", html_text.strip(), flags=re.IGNORECASE)


def main():
    items = read_rss_items()
    generate_posts(items)
    rebuild_index()


if __name__ == "__main__":
    main()
