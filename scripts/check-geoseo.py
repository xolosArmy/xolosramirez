#!/usr/bin/env python3
"""Validate the GeoSEO review manifest without fetching or modifying production."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote, urljoin
import csv
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://xolosramirez.com/'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.canonical = []
        self.alternates = {}
        self.links = []
        self.meta = {}
        self.h1 = 0
        self.json_blocks = []
        self.buffer = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'h1':
            self.h1 += 1
        if tag == 'meta':
            self.meta[a.get('name', a.get('property', ''))] = a.get('content', '')
        if tag == 'link':
            if a.get('rel') == 'canonical':
                self.canonical.append(a['href'])
            if a.get('hreflang'):
                self.alternates[a['hreflang']] = a['href']
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.buffer = ''

    def handle_data(self, data):
        if self.buffer is not None:
            self.buffer += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.buffer is not None:
            self.json_blocks.append(json.loads(self.buffer))
            self.buffer = None

def local(url):
    path = ROOT / unquote(urlsplit(url).path).lstrip('/')
    return path / 'index.html' if path.is_dir() else path

def main():
    rows = list(csv.DictReader((ROOT/'docs/xr-geoseo-01/comparativo-cambios.csv').open()))
    failures = []
    for row in rows:
        url = row['url']
        page = Page(local(url).read_text())
        # Navigation-only edits retain unrelated page contracts.
        if '/blog/' in url and not url.endswith('/index.html') or url.endswith(('entregas.html','deliveries.html')):
            if page.canonical != [url]: failures.append((url,'canonical',page.canonical))
            if page.h1 != 1: failures.append((url,'H1 count',page.h1))
            if not page.meta.get('description'): failures.append((url,'missing description'))
            if not page.json_blocks: failures.append((url,'missing structured data'))
            for lang, alternate in page.alternates.items():
                if not local(alternate).is_file():
                    failures.append((url,'missing alternate',alternate)); continue
                other = Page(local(alternate).read_text())
                if url not in other.alternates.values(): failures.append((url,'nonreciprocal alternate',lang))
        # Only new links are a release regression for navigation-only pages.
        for href in filter(None,row['internal_links_added'].split(' | ')):
            target=urljoin(url,href)
            if urlsplit(target).netloc in ('xolosramirez.com','www.xolosramirez.com') and not local(target).is_file():
                failures.append((url,'new missing internal target',href))
    sitemap = ET.parse(ROOT/'sitemap.xml')
    urls=[n.text for n in sitemap.findall('.//{*}loc')]
    if len(urls)!=len(set(urls)):failures.append(('sitemap','duplicates'))
    for url in urls:
        if not local(url).is_file():failures.append(('sitemap','missing',url))
    # Guard the two most consequential negative cases.
    for path in ['entregas.html','en/deliveries.html']:
        text=(ROOT/path).read_text()
        if 'Xóchitl' in text or 'Xochitl' in text:failures.append((path,'pending delivery included'))
        if 'LocalBusiness' in text:failures.append((path,'fictional local business'))
    print(json.dumps({'pages':len(rows),'sitemap_urls':len(urls),'failures':failures},ensure_ascii=False,indent=2))
    raise SystemExit(bool(failures))

if __name__ == '__main__':
    main()
