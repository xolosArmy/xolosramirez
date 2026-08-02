const navMenu = document.getElementById('menu');
const navToggle = document.querySelector('.hamburger');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const visibility = navMenu.getAttribute('data-visible');

    if (visibility === 'false') {
      navMenu.setAttribute('data-visible', 'true');
      navToggle.setAttribute('aria-expanded', 'true');
    } else {
      navMenu.setAttribute('data-visible', 'false');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navMenu.setAttribute('data-visible', 'false');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const yearElement = document.getElementById('year');
if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');

if (navMenu) {
  const links = navMenu.querySelectorAll('a');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const targetPath = new URL(
      href,
      window.location.origin + window.location.pathname,
    )
      .pathname.replace(/\/index\.html$/, '/');

    const isCurrentPage =
      (targetPath !== '/' && currentPath.endsWith(targetPath)) ||
      (targetPath === '/' && currentPath === '/');

    if (isCurrentPage) {
      link.setAttribute('aria-current', 'page');
    }
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
let lastGenerateLeadSignature = '';
let lastGenerateLeadAt = 0;

function getLeadElement(target) {
  if (!(target instanceof Element)) return null;

  return target.closest('[data-lead-type="generate_lead"]');
}

function getDatasetField(element, key, fallback = 'unknown') {
  return element.dataset[key] || fallback;
}

function getLeadChannel(element) {
  const cta = getDatasetField(element, 'cta', '').toLowerCase();

  if (cta === 'whatsapp') return 'whatsapp';
  if (cta === 'email') return 'email';
  if (cta === 'video_call') return 'video_call';
  if (cta === 'contact-form' || cta === 'form') return 'form';

  return 'unknown';
}

function getCtaLocation(element) {
  if (element.dataset.ctaLocation) return element.dataset.ctaLocation;
  if (element.classList.contains('wa-float')) return 'floating';
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

  return 'unknown';
}

function getLeadIntent(element) {
  if (element.dataset.leadIntent) return element.dataset.leadIntent;

  const leadChannel = getLeadChannel(element);
  const profile = getDatasetField(element, 'profile', 'general');
  const profileStatus = getDatasetField(element, 'status', 'not_applicable');
  const pageType = getDatasetField(element, 'pageType', 'unknown');
  const ctaLocation = getCtaLocation(element);

  if (leadChannel === 'whatsapp' && pageType === 'available-xolos') {
    return 'price_inquiry';
  }

  if (leadChannel === 'email' && profileStatus === 'reserved') {
    return 'similar_xolos';
  }

  if (leadChannel === 'email' && profile !== 'general') {
    return 'profile_inquiry';
  }

  if (leadChannel === 'email' && pageType === 'home') {
    return 'general_inquiry';
  }

  if (ctaLocation === 'contact_form') {
    return 'contact_form';
  }

  return 'lead_inquiry';
}

function buildLeadPayload(element) {
  const lang = element.dataset.lang || document.documentElement.lang;

  return {
    event: 'generate_lead',
    lead_channel: getLeadChannel(element),
    cta_location: getCtaLocation(element),
    lead_intent: getLeadIntent(element),
    profile: getDatasetField(element, 'profile', 'general'),
    profile_status: getDatasetField(element, 'status', 'not_applicable'),
    page_type: getDatasetField(element, 'pageType', 'unknown'),
    lang: normalizeLang(lang),
  };
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

function pushGenerateLead(payload) {
  const now = Date.now();
  const signature = getLeadSignature(payload);

  if (
    signature === lastGenerateLeadSignature &&
    now - lastGenerateLeadAt < LEAD_DEDUPLICATION_MS
  ) {
    return;
  }

  lastGenerateLeadSignature = signature;
  lastGenerateLeadAt = now;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
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
  if (!leadElement) return;
  if (shouldIgnoreLeadClick(leadElement)) return;

  pushGenerateLead(buildLeadPayload(leadElement));
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches(CONTACT_FORM_SELECTOR)) return;
  if (!form.checkValidity()) return;

  pushGenerateLead(buildLeadPayload(form));
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
      track.scrollTo({ left: slides[nextIndex].offsetLeft, behavior: 'smooth' });
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

    previousButton?.addEventListener('click', () => goToSlide(activeIndex - 1));
    nextButton?.addEventListener('click', () => goToSlide(activeIndex + 1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToSlide(activeIndex - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); goToSlide(activeIndex + 1); }
    });
    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        const closestIndex = slides.reduce((closest, slide, index) => (
          Math.abs(slide.offsetLeft - track.scrollLeft) < Math.abs(slides[closest].offsetLeft - track.scrollLeft)
            ? index : closest
        ), 0);
        if (closestIndex !== activeIndex) updateActiveSlide(closestIndex);
      });
    }, { passive: true });
  });
}

initializePuppyCarousels();
