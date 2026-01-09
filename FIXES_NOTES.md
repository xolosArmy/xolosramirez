# Mobile layout/UI fixes

## What was broken
- Mobile hero sections were causing horizontal overflow and a shifted layout due to full-bleed `100vw` sizing combined with translated layouts.
- Mobile navigation had conflicting legacy styles and did not consistently open/close or prevent background scrolling.
- The testimonials page lost its intended styling because the expected `#testimonios` wrapper was missing.
- Some card media classes were misspelled, preventing media styling from applying.
- Video hero backgrounds could introduce instability on mobile without a safe fallback.

## What changed
- Added mobile-specific overrides to keep hero/CTA sections within the viewport and hide background video iframes on small screens.
- Hardened the hamburger menu behavior (ARIA state, body scroll lock, outside/Escape close) and neutralized legacy mobile `nav ul` rules.
- Restored the testimonials wrapper and grid structure so existing `#testimonios` styles apply again.
- Corrected `card_media` to `card__media` in card markup.
- Added consistent language switches to Spanish pages to match the English navigation.

## How to test quickly (mobile)
1. Open DevTools and emulate a mobile viewport (e.g., 360×800).
2. Verify there is no horizontal scroll and the hero is centered.
3. Tap the hamburger menu: the panel should slide in, links are tappable, and the page behind should not scroll.
4. Confirm testimonials display as styled cards inside the restored wrapper.
5. Run Lighthouse (mobile) and confirm CLS and layout stability remain healthy.

## Legacy nav CSS removed/neutralized
- Conflicting legacy `nav ul { transform: scale(0) }` mobile rules were overridden to ensure the `.nav-menu` system remains the single source of truth.
