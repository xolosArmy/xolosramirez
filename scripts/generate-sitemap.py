#!/usr/bin/env python3
"""Generate the sitemap from self-canonical, indexable pages; use --check in review."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.sax.saxutils import escape
import argparse

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://xolosramirez.com'

class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None
        self.noindex = False
        self.redirect = False

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'link' and 'canonical' in attributes.get('rel', '').lower().split():
            self.canonical = attributes.get('href')
        if tag == 'meta':
            if attributes.get('name', '').lower() in ('robots', 'googlebot'):
                self.noindex |= 'noindex' in attributes.get('content', '').lower()
            self.redirect |= attributes.get('http-equiv', '').lower() == 'refresh'

def sitemap_urls():
    files = list(ROOT.glob('*.html'))
    for directory in ('blog', 'en', 'xolo-skin-care'):
        files.extend((ROOT / directory).rglob('*.html'))
    urls = set()
    for path in files:
        metadata = Metadata()
        metadata.feed(path.read_text(encoding='utf-8'))
        if not metadata.canonical or metadata.noindex or metadata.redirect:
            continue
        url = urlsplit(metadata.canonical)
        if url.scheme != 'https' or url.netloc != 'xolosramirez.com' or url.query or url.fragment:
            continue
        target = ROOT / unquote(url.path).lstrip('/')
        if target.is_dir():
            target /= 'index.html'
        # Exclude aliases, archives canonicalized elsewhere, drafts and historical redirects.
        if target.resolve() != path.resolve() or not target.is_file():
            continue
        urls.add(metadata.canonical)
    return sorted(urls)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the committed sitemap is stale')
    args = parser.parse_args()
    urls = sitemap_urls()
    if not urls:
        raise SystemExit('No canonical pages found; refusing to write an empty sitemap')
    output = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    output += ''.join(f'  <url><loc>{escape(url)}</loc></url>\n' for url in urls)
    output += '</urlset>\n'
    path = ROOT / 'sitemap.xml'
    if args.check:
        if path.read_text(encoding='utf-8') != output:
            raise SystemExit('Sitemap is stale. Run python3 scripts/generate-sitemap.py')
    else:
        path.write_text(output, encoding='utf-8')
    print(f'{len(urls)} self-canonical URLs; sitemap {"verified" if args.check else "written"}')

if __name__ == '__main__':
    main()
