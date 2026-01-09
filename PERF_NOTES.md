# Performance Notes (Core Web Vitals)

This document summarizes the performance-focused changes applied to the site, how to maintain them, and how to validate improvements.

## What changed
- **Critical CSS inline + non-blocking stylesheets**  
  Each HTML page now inlines a minimal critical CSS block and loads `css/styles.css` (and other styles like AOS or `blog.css` where present) via `preload` + `onload`, with a `noscript` fallback.
- **Image loading consistency**  
  All `<img>` tags now include `width`, `height`, and `decoding="async"`.  
  Hero/LCP images are marked `loading="eager"` and `fetchpriority="high"`, and are preloaded in `<head>`.  
  Below-the-fold images default to `loading="lazy"`.
- **Hero video deferral on mobile**  
  Background YouTube heroes now render a lightweight poster first. The iframe is loaded only after the hero is near the viewport and after idle/first interaction (mobile), while still loading immediately on desktop.
- **Script loading improvements**  
  Local scripts and AOS are loaded with `defer`, and AOS initialization waits for `DOMContentLoaded`.
- **Below-the-fold rendering**  
  `content-visibility: auto` is applied to non-hero sections to reduce initial rendering work.

## How to maintain
- **New images**: always add `width`, `height`, `decoding="async"`, and appropriate `loading` values.  
  - Hero/LCP: `loading="eager"` + `fetchpriority="high"` and add a `<link rel="preload" as="image" href="...">` in `<head>`.  
  - Below-the-fold: `loading="lazy"`.
- **New hero videos**:  
  - Keep the YouTube `<iframe>` but move its URL to `data-src` and set `src="about:blank"`.  
  - Add a `background-image` poster (JPG/PNG) on the hero container.  
  - The lazy-load behavior is in `js/main.js` and requires `data-src` to work.
- **New stylesheets**: load them non-blocking using the same `preload` + `onload` pattern and add a `noscript` fallback.
- **AOS**: keep `AOS.init(...)` inside a `DOMContentLoaded` handler.

## How to test (Lighthouse, mobile)
1. Open Chrome DevTools → Lighthouse.
2. Select **Mobile**, check **Performance**.
3. Run Lighthouse on:
   - `index.html`
   - `xolos-disponibles.html`
   - `testimonios.html`
   - representative blog posts under `/blog/`
4. Confirm:
   - LCP is the hero image/poster and is preloaded.
   - CLS is near 0 (image dimensions reserved).
   - Third-party iframes load after interaction on mobile.

## Future WebP preparation (optional)
When WebP/AVIF versions are available, wrap hero and other key images in `<picture>` and add a TODO `source` element (kept commented until files exist). Example:

```html
<picture>
  <!-- TODO: add <source srcset="img/hero.webp" type="image/webp"> once created -->
  <img src="img/hero.jpg" width="1600" height="900" loading="eager" decoding="async" fetchpriority="high" alt="...">
</picture>
```

## Optional caching notes (static hosting)
- Consider putting Cloudflare in front of GitHub Pages to cache HTML at the edge.
- If your host allows headers, set long-lived caching for `/img`, `/css`, and `/js`.
