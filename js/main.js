const LEGACY_CONTACT_EMAIL = 'fernando@xolosramirez.com';
const CURRENT_CONTACT_EMAIL = 'contacto@xolosarmy.xyz';

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
  const nextSibling = link.nextSibling;
  link.remove();
  if (nextSibling instanceof HTMLBRElement) nextSibling.remove();
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

function updateGlobalContactEmail() {
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || !href.includes(LEGACY_CONTACT_EMAIL)) return;
    link.setAttribute('href', href.replaceAll(LEGACY_CONTACT_EMAIL, CURRENT_CONTACT_EMAIL));
  });
}

const navMenu = document.getElementById('menu');
const navToggle = document.querySelector('.hamburger');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const isVisible = navMenu.getAttribute('data-visible') === 'true';
    navMenu.setAttribute('data-visible', String(!isVisible));
    navToggle.setAttribute('aria-expanded', String(!isVisible));
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navMenu.setAttribute('data-visible', 'false');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const yearElement = document.getElementById('year');
if (yearElement) yearElement.textContent = String(new Date().getFullYear());

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
if (navMenu) {
  navMenu.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const targetPath = new URL(href, window.location.origin + window.location.pathname)
      .pathname.replace(/\/index\.html$/, '/');
    const isCurrentPage =
      (targetPath !== '/' && currentPath.endsWith(targetPath)) ||
      (targetPath === '/' && currentPath === '/');

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
let lastGenerateLeadSignature = '';
let lastGenerateLeadAt = 0;

function getLeadElement(target) {
  return target instanceof Element
    ? target.closest('[data-lead-type="generate_lead"]')
    : null;
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

  if (leadChannel === 'whatsapp' && pageType === 'available-xolos') return 'price_inquiry';
  if (leadChannel === 'email' && profileStatus === 'reserved') return 'similar_xolos';
  if (leadChannel === 'email' && profile !== 'general') return 'profile_inquiry';
  if (leadChannel === 'email' && pageType === 'home') return 'general_inquiry';
  if (ctaLocation === 'contact_form') return 'contact_form';
  return 'lead_inquiry';
}

function buildLeadPayload(element) {
  const lang = element.dataset.lang || document.documentElement.lang;
  return {
    event: 'xolos_generate_lead',
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
  if (signature === lastGenerateLeadSignature && now - lastGenerateLeadAt < LEAD_DEDUPLICATION_MS) return;

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
  if (!leadElement || shouldIgnoreLeadClick(leadElement)) return;
  pushGenerateLead(buildLeadPayload(leadElement));
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches(CONTACT_FORM_SELECTOR) || !form.checkValidity()) return;
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

function getAvailableXolosGrid() {
  return document.querySelector('main .puppy-grid');
}

function isAvailableXolosPage() {
  return Boolean(getAvailableXolosGrid());
}

function isEnglishAvailableXolosPage() {
  return isAvailableXolosPage() && document.documentElement.lang.toLowerCase().startsWith('en');
}

function updateAvailableXolosCtas() {
  if (!isAvailableXolosPage()) return;

  const isEnglishPage = isEnglishAvailableXolosPage();
  const language = isEnglishPage ? 'en' : 'es';
  const labels = isEnglishPage
    ? {
        video: 'Book a video call',
        videoAria: 'Book a video call with Xolos Ramírez',
        whatsapp: 'Contact by WhatsApp',
        whatsappAria: 'Contact Xolos Ramírez by WhatsApp',
      }
    : {
        video: 'Agendar videollamada',
        videoAria: 'Agendar videollamada con Xolos Ramírez',
        whatsapp: 'Consultar por WhatsApp',
        whatsappAria: 'Consultar por WhatsApp con Xolos Ramírez',
      };

  const commercialSection = document.getElementById(
    isEnglishPage ? 'commercial-info-en' : 'commercial-info-es',
  )?.closest('section');
  const actions = commercialSection?.querySelector('.puppy-card__actions');
  const firstAction = actions?.querySelector('a');

  if (firstAction) {
    firstAction.href = 'https://calendar.app.google/1PXNvJM42iZ3JMHC8';
    firstAction.target = '_blank';
    firstAction.rel = 'noopener noreferrer';
    firstAction.textContent = labels.video;
    firstAction.setAttribute('aria-label', labels.videoAria);
    firstAction.dataset.cta = 'video_call';
    firstAction.dataset.leadType = 'generate_lead';
    firstAction.dataset.leadIntent = 'video_call_request';
    firstAction.dataset.profile = 'general';
    firstAction.dataset.pageType = 'available-xolos';
    firstAction.dataset.lang = language;
    firstAction.classList.remove('cta-email');
    firstAction.classList.add('video-call-cta');
  }

  const floatingCta = document.querySelector(
    'a.home-email-float.video-call-float, a.home-email-float[data-cta="video_call"]',
  );
  if (floatingCta) {
    floatingCta.href = 'https://wa.me/message/435RTKGJLTX2J1';
    floatingCta.target = '_blank';
    floatingCta.rel = 'noopener noreferrer';
    floatingCta.setAttribute('aria-label', labels.whatsappAria);
    floatingCta.setAttribute('title', labels.whatsappAria);
    floatingCta.dataset.cta = 'whatsapp';
    floatingCta.dataset.leadType = 'generate_lead';
    floatingCta.dataset.leadIntent = 'price_inquiry';
    floatingCta.dataset.ctaLocation = 'floating';
    floatingCta.dataset.profile = 'general';
    floatingCta.dataset.status = 'not_applicable';
    floatingCta.dataset.pageType = 'available-xolos';
    floatingCta.dataset.lang = language;
    floatingCta.classList.remove('video-call-float');
    floatingCta.classList.add('wa-float');

    const icon = floatingCta.querySelector('.home-email-float__icon');
    const text = floatingCta.querySelector('.home-email-float__text');
    if (icon) icon.textContent = '💬';
    if (text) text.textContent = labels.whatsapp;
  }
}

function updateXilonenProfileVideo() {
  const existingVideoUrl = 'https://www.youtube.com/embed/nrZ-PhE4bHA?autoplay=1&mute=1';
  const shortVideos = [
    {
      id: 'cDpeJ2UQNHE',
      url: 'https://www.youtube.com/embed/cDpeJ2UQNHE?autoplay=1&mute=1',
      titleEn: 'Xilonen Ramirez miniature Xoloitzcuintli puppy exploring the world',
      titleEs: 'Xilonen Ramirez, bebé xoloitzcuintle miniatura explorando el mundo',
    },
    {
      id: 'pZ-Qfy8TDRw',
      url: 'https://www.youtube.com/embed/pZ-Qfy8TDRw?autoplay=1&mute=1',
      titleEn: 'Xilonen Ramirez miniature Xoloitzcuintli puppy',
      titleEs: 'Xilonen Ramirez, bebé xoloitzcuintle miniatura',
    },
    {
      id: 'rYDusjW9Gi0',
      url: 'https://www.youtube.com/embed/rYDusjW9Gi0?autoplay=1&mute=1',
      titleEn: 'Xilonen Ramirez miniature Xoloitzcuintli puppy playing with Oce',
      titleEs: 'Xilonen Ramirez, cachorra xoloitzcuintle miniatura jugando con Oce',
    },
  ];
  const grid = getAvailableXolosGrid();
  if (!grid) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');

  Array.from(grid.querySelectorAll('.puppy-card')).forEach((card) => {
    const name = card.querySelector('.puppy-card__name')?.textContent.trim();
    if (name !== 'Xilonen Ramirez') return;

    const existingVideo = card.querySelector('.puppy-video-container');
    const existingIframe = existingVideo?.querySelector('iframe');
    if (existingIframe) existingIframe.setAttribute('src', existingVideoUrl);
    if (!existingVideo) return;

    let insertAfter = existingVideo;
    shortVideos.forEach((video) => {
      const currentVideo = card.querySelector(`[data-xilonen-video="${video.id}"]`);
      if (currentVideo) {
        insertAfter = currentVideo;
        return;
      }

      const newVideo = existingVideo.cloneNode(true);
      newVideo.dataset.xilonenVideo = video.id;
      const newIframe = newVideo.querySelector('iframe');
      if (newIframe) {
        newIframe.setAttribute('src', video.url);
        newIframe.setAttribute('title', isEnglish ? video.titleEn : video.titleEs);
      }
      insertAfter.insertAdjacentElement('afterend', newVideo);
      insertAfter = newVideo;
    });
  });
}

function updateXilonenPersonality() {
  const grid = getAvailableXolosGrid();
  if (!grid) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const personality = isEnglish
    ? 'Personality: curious, alert and exploratory. Xilonen is an observant little puppy who confidently investigates her surroundings and enjoys approaching people.'
    : 'Personalidad: curiosa, despierta y exploradora. Xilonen es una cachorrita observadora que investiga su entorno con confianza y disfruta acercarse a las personas.';

  Array.from(grid.querySelectorAll('.puppy-card')).forEach((card) => {
    const name = card.querySelector('.puppy-card__name')?.textContent.trim();
    if (name !== 'Xilonen Ramirez') return;
    if (card.querySelector('[data-profile-personality="xilonen"]')) return;

    const details = card.querySelector('.puppy-card__details');
    if (!details) return;
    const paragraph = document.createElement('p');
    paragraph.dataset.profilePersonality = 'xilonen';
    paragraph.className = 'puppy-card__personality';
    paragraph.textContent = personality;
    details.insertAdjacentElement('afterend', paragraph);
  });
}

function updateYohualliProfileVideo() {
  const oldVideoUrl = 'https://www.youtube.com/embed/Rv1AIlVnE6s';
  const newVideoUrl = 'https://www.youtube.com/embed/rBWNyLjg31Q';
  document.querySelectorAll(`iframe[src="${oldVideoUrl}"]`).forEach((iframe) => {
    iframe.setAttribute('src', newVideoUrl);
  });
}

function insertTlilxochitlProfile() {
  const grid = getAvailableXolosGrid();
  if (!grid || grid.querySelector('[data-profile-card="tlilxochitl"]')) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const imagePrefix = isEnglish ? '../img/xolos/' : 'img/xolos/';
  const labels = isEnglish
    ? {
        status: 'Available',
        carousel: 'Tlilxóchitl Ramirez photo carousel',
        role: 'carousel',
        previous: 'Previous photo',
        next: 'Next photo',
        select: 'Select photo',
        ageLabel: 'Age',
        age: 'Newborn · August 3, 2026',
        genderLabel: 'Gender',
        gender: 'Female',
        sizeLabel: 'Size',
        size: 'Intermediate / Medium',
        colorLabel: 'Color',
        color: 'Black',
        alt1: 'Tlilxóchitl Ramirez, female Xoloitzcuintli puppy with her head tilted',
        alt2: 'Tlilxóchitl Ramirez, female Xoloitzcuintli puppy facing the camera',
        videoTitle: 'Tlilxóchitl Ramirez, baby Xoloitzcuintli in a close-up portrait',
        latestVideoTitle: 'Tlilxóchitl Ramirez, Xoloitzcuintli puppy resting and exploring',
        newestVideoTitle: 'Tlilxóchitl Ramirez, Xoloitzcuintli puppy in a tender close-up',
        personality: 'Personality: calm, affectionate, and observant. Tlilxóchitl is a curious and confident puppy who enjoys human contact and explores her surroundings with a sweet, serene energy.',
        subject: 'Inquiry about Tlilxóchitl Ramirez [Ref: tlilxochitl-en-available]',
        body: 'Hello, I saw Tlilxóchitl Ramirez on the Xolos Ramírez website and would like to learn more about her availability, price, and reservation process.',
        cta: 'Contact via Email',
        aria: 'Contact by email about Tlilxóchitl',
        lang: 'en',
        buttonStyle: '',
      }
    : {
        status: 'Disponible',
        carousel: 'Carrusel de fotos de Tlilxóchitl Ramirez',
        role: 'carrusel',
        previous: 'Foto anterior',
        next: 'Foto siguiente',
        select: 'Seleccionar foto',
        ageLabel: 'Edad',
        age: 'Recién nacida · 3 de agosto de 2026',
        genderLabel: 'Género',
        gender: 'Hembra',
        sizeLabel: 'Talla',
        size: 'Intermedia',
        colorLabel: 'Color',
        color: 'Negro',
        alt1: 'Tlilxóchitl Ramírez, bebé xoloitzcuintle hembra con la cabeza inclinada',
        alt2: 'Tlilxóchitl Ramírez, bebé xoloitzcuintle hembra de frente mirando a la cámara',
        videoTitle: 'Tlilxóchitl Ramírez, bebé xoloitzcuintle en un retrato cercano',
        latestVideoTitle: 'Tlilxóchitl Ramírez, cachorra xoloitzcuintle descansando y explorando',
        newestVideoTitle: 'Tlilxóchitl Ramírez, cachorra xoloitzcuintle en un tierno primer plano',
        personality: 'Personalidad: tranquila, cariñosa y observadora. Tlilxóchitl es una bebé curiosa y confiada, disfruta el contacto humano y explora su entorno con una energía dulce y serena.',
        subject: 'Consulta sobre Tlilxóchitl Ramirez [Ref: tlilxochitl-es-available]',
        body: 'Hola, vi el perfil de Tlilxóchitl Ramirez en Xolos Ramírez y me interesa conocer más sobre su disponibilidad, precio y proceso de reserva.',
        cta: 'Correo directo ✉️',
        aria: 'Escribir por correo sobre Tlilxóchitl',
        lang: 'es',
        buttonStyle: 'background-color: #25D366; border-color: #25D366; width: 100%; justify-content: center;',
      };

  const article = document.createElement('article');
  article.className = 'puppy-card';
  article.dataset.profileCard = 'tlilxochitl';
  article.dataset.aos = 'fade-up';
  article.dataset.aosDuration = '800';
  article.dataset.aosDelay = '200';
  article.innerHTML = `
    <div class="puppy-card__image-wrapper">
      <span class="puppy-card__status status-disponible">${labels.status}</span>
      <div class="puppy-carousel" data-puppy-carousel role="region" aria-roledescription="${labels.role}" aria-label="${labels.carousel}">
        <div class="puppy-carousel__track" tabindex="0">
          <div class="puppy-carousel__slide">
            <img src="${imagePrefix}tlilxochitl-ramirez-agosto-2026-cabeza-inclinada.webp" alt="${labels.alt1}" class="puppy-card__image" width="960" height="1200" loading="lazy" decoding="async" draggable="false" style="object-fit: contain;" />
          </div>
          <div class="puppy-carousel__slide">
            <img src="${imagePrefix}tlilxochitl-ramirez-agosto-2026-frontal.webp" alt="${labels.alt2}" class="puppy-card__image" width="960" height="1200" loading="lazy" decoding="async" draggable="false" style="object-fit: contain;" />
          </div>
        </div>
        <button class="puppy-carousel__button puppy-carousel__button--previous" type="button" aria-label="${labels.previous}">&#8592;</button>
        <button class="puppy-carousel__button puppy-carousel__button--next" type="button" aria-label="${labels.next}">&#8594;</button>
        <div class="puppy-carousel__dots" aria-label="${labels.select}"></div>
        <p class="puppy-carousel__live" aria-live="polite" aria-atomic="true"></p>
      </div>
    </div>
    <div class="puppy-card__content">
      <h3 class="puppy-card__name">Tlilxóchitl Ramirez</h3>
      <ul class="puppy-card__details">
        <li><strong>${labels.ageLabel}</strong>${labels.age}</li>
        <li><strong>${labels.genderLabel}</strong>${labels.gender}</li>
        <li><strong>${labels.sizeLabel}</strong>${labels.size}</li>
        <li><strong>${labels.colorLabel}</strong>${labels.color}</li>
      </ul>
      <p class="puppy-card__personality" data-profile-personality="tlilxochitl">${labels.personality}</p>
      <div class="puppy-video-container" data-profile-video="qdUfdKWn5aI" style="margin: 1rem 0; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9;">
        <iframe width="100%" height="100%" src="https://www.youtube.com/embed/qdUfdKWn5aI?autoplay=1&mute=1" title="${labels.videoTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
      </div>
      <div class="puppy-video-container" data-profile-video="UAvsWVJu8M0" style="margin: 1rem 0; border-radius: 8px; overflow: hidden; aspect-ratio: 9/16; max-width: 360px;">
        <iframe width="100%" height="100%" src="https://www.youtube.com/embed/UAvsWVJu8M0?autoplay=1&mute=1" title="${labels.latestVideoTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>
      </div>
      <div class="puppy-video-container" data-profile-video="Drl7obSEm5E" style="margin: 1rem 0; border-radius: 8px; overflow: hidden; aspect-ratio: 9/16; max-width: 360px;">
        <iframe width="100%" height="100%" src="https://www.youtube.com/embed/Drl7obSEm5E?autoplay=1&mute=1&playsinline=1" title="${labels.newestVideoTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>
      </div>
      <div class="puppy-card__actions">
        <a href="mailto:${CURRENT_CONTACT_EMAIL}?subject=${encodeURIComponent(labels.subject)}&body=${encodeURIComponent(labels.body)}" class="btn-small btn-primary-small cta-lead cta-email" style="${labels.buttonStyle}" data-cta="email" data-lead-type="generate_lead" data-profile="tlilxochitl" data-page-type="available-xolos" data-lang="${labels.lang}" aria-label="${labels.aria}" data-status="available">${labels.cta}</a>
      </div>
    </div>`;

  grid.prepend(article);
}

function updateXilonenAge() {
  const grid = getAvailableXolosGrid();
  if (!grid) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const ageLabel = isEnglish ? 'Age' : 'Edad';
  const ageValue = isEnglish ? '1 month' : '1 mes';

  Array.from(grid.querySelectorAll('.puppy-card')).forEach((card) => {
    const name = card.querySelector('.puppy-card__name')?.textContent.trim();
    if (name !== 'Xilonen Ramirez') return;

    const ageItem = Array.from(card.querySelectorAll('.puppy-card__details li')).find((item) => (
      item.querySelector('strong')?.textContent.trim() === ageLabel
    ));
    if (ageItem) ageItem.innerHTML = `<strong>${ageLabel}</strong>${ageValue}`;
  });
}

function prioritizeAvailableProfiles() {
  const grid = getAvailableXolosGrid();
  if (!grid) return;

  const cards = Array.from(grid.children).filter((child) => child.matches('article.puppy-card'));
  const isAvailable = (card) => {
    const badgeText = card.querySelector('.puppy-card__status')?.textContent.trim().toLowerCase() || '';
    return badgeText === 'disponible' || badgeText === 'available';
  };

  cards.sort((left, right) => Number(isAvailable(right)) - Number(isAvailable(left)));
  cards.forEach((card) => grid.appendChild(card));
}

updateGlobalContactEmail();
updateAvailableXolosCtas();
updateXilonenProfileVideo();
updateXilonenPersonality();
updateYohualliProfileVideo();
insertTlilxochitlProfile();
updateXilonenAge();
prioritizeAvailableProfiles();
initializePuppyCarousels();
