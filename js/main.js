const FOOTER_SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://www.facebook.com/share/1DYZWxYmqp/' },
  { label: 'YouTube', href: 'https://www.youtube.com/@xolosramirez' },
  { label: 'X / Twitter', href: 'https://x.com/xolosramirez1' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@xolosramirezoficial' },
  {
    label: 'Snapchat',
    href: 'https://www.snapchat.com/add/xolos_ramirez?share_id=UFcVV_Fb_l8&locale=es-US',
  },
];

const FOOTER_SOCIAL_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'tiktok.com',
  'www.tiktok.com',
  'snapchat.com',
  'www.snapchat.com',
  't.me',
  'telegram.me',
]);

function removeSocialLink(link) {
  const separator = link.nextElementSibling;
  link.remove();
  if (separator instanceof HTMLBRElement) separator.remove();
}

function updateGlobalFooterSocialLinks() {
  document.querySelectorAll('footer').forEach((footer) => {
    footer.querySelectorAll('a[href]').forEach((link) => {
      let hostname;
      try {
        hostname = new URL(link.href).hostname.toLowerCase();
      } catch {
        return;
      }

      if (hostname === 't.me' || hostname === 'telegram.me') removeSocialLink(link);
    });

    const heading = Array.from(footer.querySelectorAll('h4')).find((candidate) => {
      const text = candidate.textContent.trim().toLowerCase();
      return ['redes', 'redes sociales', 'social', 'social networks'].includes(text);
    });
    if (!heading) return;

    const section = heading.parentElement;
    if (!section) return;

    const existingSocialLinks = Array.from(section.querySelectorAll('a[href]')).filter((link) => {
      try {
        return FOOTER_SOCIAL_HOSTS.has(new URL(link.href).hostname.toLowerCase());
      } catch {
        return false;
      }
    });
    const linksParent = existingSocialLinks[0]?.parentElement || section;
    existingSocialLinks.forEach(removeSocialLink);

    const fragment = document.createDocumentFragment();
    FOOTER_SOCIAL_LINKS.forEach(({ label, href }) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      fragment.append(link, document.createElement('br'));
    });

    const firstRemainingLink = linksParent.querySelector('a[href]');
    if (firstRemainingLink) {
      linksParent.insertBefore(fragment, firstRemainingLink);
    } else if (linksParent === section) {
      heading.after(fragment);
    } else {
      linksParent.prepend(fragment);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateGlobalFooterSocialLinks, { once: true });
} else {
  updateGlobalFooterSocialLinks();
}

const navMenu = document.getElementById('menu');
const navToggle = document.querySelector('.hamburger');

if (navToggle && navMenu) {
  navMenu.dataset.enhanced = 'true';
  navToggle.dataset.enhanced = 'true';
  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const setMenu = (visible, restoreFocus = false) => {
    navMenu.setAttribute('data-visible', String(visible));
    navToggle.setAttribute('aria-expanded', String(visible));
    navToggle.setAttribute('aria-label', isEnglish
      ? (visible ? 'Close navigation' : 'Open navigation')
      : (visible ? 'Cerrar navegación' : 'Abrir navegación'));
    if (restoreFocus) navToggle.focus();
  };
  setMenu(false);
  navToggle.addEventListener('click', () => setMenu(navMenu.getAttribute('data-visible') !== 'true'));
  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.getAttribute('data-visible') === 'true') setMenu(false, true);
  });
  document.addEventListener('click', (event) => {
    if (!navMenu.contains(event.target) && !navToggle.contains(event.target)) setMenu(false);
  });
}

const yearElement = document.getElementById('year');
if (yearElement) yearElement.textContent = String(new Date().getFullYear());

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
if (navMenu) {
  navMenu.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const targetUrl = new URL(href, window.location.origin + window.location.pathname);
    const targetPath = targetUrl.pathname.replace(/\/index\.html$/, '/');
    const isCurrentPage = targetUrl.origin === window.location.origin
      && !targetUrl.hash && targetPath === currentPath;

    if (isCurrentPage) link.setAttribute('aria-current', 'page');
  });
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const naturalsLink = target.closest('a[data-gtm^="naturals"]');
  if (!naturalsLink) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'click_naturals',
    element: naturalsLink.dataset.gtm || '',
    origin: naturalsLink.dataset.gtmOrigin || '',
    href: naturalsLink.getAttribute('href') || '',
  });
});

const CONTACT_FORM_SELECTOR = 'form[data-gtm="contact-form"]';
const LEAD_DEDUPLICATION_MS = 1500;
const QUALIFIED_CONTACT_INTENTS = new Set([
  'price_inquiry',
  'profile_inquiry',
  'video_call_request',
  'contact_form',
]);
const LEAD_ANALYTICS_FIELDS = [
  'profile',
  'profile_status',
  'lead_channel',
  'lead_intent',
  'page_type',
  'cta_location',
  'lang',
];
let lastGenerateLeadSignature = '';
let lastGenerateLeadAt = 0;

function getLeadElement(target) {
  return target instanceof Element
    ? target.closest('[data-lead-type="generate_lead"]')
    : null;
}

function getDatasetField(element, key) {
  return element.dataset[key] || '';
}

function getLeadChannel(element) {
  if (element.dataset.leadChannel) return element.dataset.leadChannel;
  const cta = getDatasetField(element, 'cta', '').toLowerCase();
  if (cta === 'email') return 'email';
  if (cta === 'video_call') return 'video_call';
  if (cta === 'contact-form' || cta === 'form') return 'form';
  return '';
}

function getCtaLocation(element) {
  if (element.dataset.ctaLocation) return element.dataset.ctaLocation;
  if (element.classList.contains('home-email-float')) return 'floating';
  if (element.closest('.puppy-card')) return 'profile_card';
  if (element.closest('footer')) return 'footer';
  if (element.closest(CONTACT_FORM_SELECTOR)) return 'contact_form';
  return 'inline';
}

function normalizeLang(rawLang) {
  const lang = (rawLang || '').toLowerCase();
  if (lang === 'es' || lang.startsWith('es-')) return 'es';
  if (lang === 'en' || lang.startsWith('en-')) return 'en';
  return '';
}

function getProfileStatus(element) {
  return element.dataset.profileStatus || element.dataset.status || '';
}

function getLeadProfile(element) {
  if (!(element instanceof HTMLFormElement) || !element.matches(CONTACT_FORM_SELECTOR)) {
    return getDatasetField(element, 'profile');
  }

  const control = element.querySelector('[name="ejemplar"]');
  const selectedProfile = typeof control?.value === 'string' ? control.value : '';
  const isValidProfile = selectedProfile !== ''
    && selectedProfile !== 'general'
    && Array.from(control?.options || []).some((option) => option.value === selectedProfile);
  return isValidProfile ? selectedProfile : '';
}

function getLeadIntent(element) {
  if (element.dataset.leadIntent) return element.dataset.leadIntent;

  const leadChannel = getLeadChannel(element);
  const profile = getDatasetField(element, 'profile');
  const profileStatus = getProfileStatus(element);
  const ctaLocation = getCtaLocation(element);

  if (leadChannel === 'email' && profile && profile !== 'general') return 'profile_inquiry';
  if (ctaLocation === 'contact_form') return 'contact_form';
  if (profileStatus === 'reserved') return 'profile_inquiry';
  return '';
}

function buildLeadPayload(element) {
  const lang = element.dataset.lang || document.documentElement.lang;
  const fields = {
    event: 'xolos_generate_lead',
    lead_channel: getLeadChannel(element),
    cta_location: getCtaLocation(element),
    lead_intent: getLeadIntent(element),
    profile: getLeadProfile(element),
    profile_status: getProfileStatus(element),
    page_type: getDatasetField(element, 'pageType'),
    lang: normalizeLang(lang),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, parameter]) => parameter !== ''));
}

function getLeadSignature(payload) {
  return [
    payload.lead_channel,
    payload.cta_location,
    payload.lead_intent,
    payload.profile,
    payload.profile_status,
    payload.page_type,
    payload.lang,
  ].join('|');
}

function pushLeadEvent(payload) {
  const reset = Object.fromEntries(LEAD_ANALYTICS_FIELDS.map((field) => [field, undefined]));
  window.dataLayer.push(reset);
  window.dataLayer.push(payload);
}

function pushLeadActivation(payload) {
  const now = Date.now();
  const signature = getLeadSignature(payload);
  if (signature === lastGenerateLeadSignature && now - lastGenerateLeadAt < LEAD_DEDUPLICATION_MS) return;

  lastGenerateLeadSignature = signature;
  lastGenerateLeadAt = now;
  window.dataLayer = window.dataLayer || [];
  pushLeadEvent(payload);
  if (QUALIFIED_CONTACT_INTENTS.has(payload.lead_intent)) {
    pushLeadEvent({ ...payload, event: 'qualified_contact_intent' });
  }
}

function shouldIgnoreLeadClick(element) {
  const tagName = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') || '').toLowerCase();
  return (
    (tagName === 'button' && type === 'submit') ||
    (tagName === 'input' && type === 'submit') ||
    element.dataset.cta === 'contact-form' ||
    Boolean(element.closest(CONTACT_FORM_SELECTOR))
  );
}

document.addEventListener('click', (event) => {
  const leadElement = getLeadElement(event.target);
  if (!leadElement || shouldIgnoreLeadClick(leadElement)) return;
  pushLeadActivation(buildLeadPayload(leadElement));
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches(CONTACT_FORM_SELECTOR) || !form.checkValidity()) return;
  pushLeadActivation(buildLeadPayload(form));
});

function initializePuppyCarousels() {
  document.querySelectorAll('[data-puppy-carousel]').forEach((carousel) => {
    if (carousel.dataset.puppyCarouselInitialized === 'true') return;

    const track = carousel.querySelector('.puppy-carousel__track');
    const slides = Array.from(carousel.querySelectorAll('.puppy-carousel__slide'));
    if (!track || slides.length === 0) return;

    carousel.dataset.puppyCarouselInitialized = 'true';
    const previousButton = carousel.querySelector('.puppy-carousel__button--previous');
    const nextButton = carousel.querySelector('.puppy-carousel__button--next');
    const dots = carousel.querySelector('.puppy-carousel__dots');
    const liveRegion = carousel.querySelector('.puppy-carousel__live');
    const isSpanish = document.documentElement.lang.toLowerCase().startsWith('es');
    let activeIndex = 0;
    let scrollFrame;
    const messageFor = (index) => isSpanish
      ? `Foto ${index + 1} de ${slides.length}`
      : `Photo ${index + 1} of ${slides.length}`;

    const updateActiveSlide = (index, announce = true) => {
      activeIndex = Math.max(0, Math.min(index, slides.length - 1));
      if (dots) {
        dots.querySelectorAll('button').forEach((dot, dotIndex) => {
          dot.setAttribute('aria-current', String(dotIndex === activeIndex));
        });
      }
      if (announce && liveRegion) liveRegion.textContent = messageFor(activeIndex);
    };

    const goToSlide = (index) => {
      const nextIndex = (index + slides.length) % slides.length;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({ left: slides[nextIndex].offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
      updateActiveSlide(nextIndex);
    };

    if (slides.length === 1) {
      carousel.classList.add('puppy-carousel--single');
      updateActiveSlide(0, false);
      return;
    }

    if (dots) {
      slides.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', messageFor(index));
        dot.setAttribute('aria-current', String(index === 0));
        dot.addEventListener('click', () => goToSlide(index));
        dots.appendChild(dot);
      });
    }

    if (previousButton) previousButton.hidden = false;
    if (nextButton) nextButton.hidden = false;
    previousButton?.addEventListener('click', () => goToSlide(activeIndex - 1));
    nextButton?.addEventListener('click', () => goToSlide(activeIndex + 1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToSlide(activeIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToSlide(activeIndex + 1);
      }
    });
    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        const closestIndex = slides.reduce((closest, slide, index) => (
          Math.abs(slide.offsetLeft - track.scrollLeft) < Math.abs(slides[closest].offsetLeft - track.scrollLeft)
            ? index
            : closest
        ), 0);
        if (closestIndex !== activeIndex) updateActiveSlide(closestIndex);
      });
    }, { passive: true });
  });
}

// Current profiles and media are authored in both HTML pages for reliable crawlability.
initializePuppyCarousels();
