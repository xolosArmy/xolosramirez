const navMenu = document.getElementById('menu');
const navToggle = document.querySelector('.hamburger');

if (navToggle && navMenu) {
  const openMenu = () => {
    navMenu.setAttribute('data-visible', 'true');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  };

  const closeMenu = () => {
    navMenu.setAttribute('data-visible', 'false');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  navToggle.addEventListener('click', () => {
    const visibility = navMenu.getAttribute('data-visible');
    if (visibility === 'true') {
      closeMenu();
      return;
    }
    openMenu();
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', (event) => {
    if (navMenu.getAttribute('data-visible') !== 'true') return;
    if (navMenu.contains(event.target) || navToggle.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (navMenu.getAttribute('data-visible') !== 'true') return;
    closeMenu();
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

document.addEventListener('DOMContentLoaded', () => {
  const langLinks = document.querySelectorAll('.lang-switch a');

  langLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const selectedLang = link.getAttribute('lang');
      if (!selectedLang) return;

      localStorage.setItem('preferredLang', selectedLang);
    });
  });

  const savedLang = localStorage.getItem('preferredLang');
  const pageLang = document.documentElement.getAttribute('lang');

  if (savedLang && savedLang !== pageLang) {
    const preferredLink = document.querySelector(`.lang-switch a[lang="${savedLang}"]`);
    if (preferredLink) {
      window.location.href = preferredLink.href;
    }
  }

  const lazyIframes = document.querySelectorAll('iframe[data-src]');
  if (!lazyIframes.length) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const loadIframe = (iframe) => {
    if (iframe.dataset.loaded) return;
    const src = iframe.dataset.src;
    if (!src) return;
    iframe.src = src;
    iframe.dataset.loaded = 'true';
  };

  if (!isMobile) {
    lazyIframes.forEach(loadIframe);
    return;
  }

  const pending = new Set();
  let interacted = false;
  const onInteraction = () => {
    interacted = true;
    pending.forEach((iframe) => loadIframe(iframe));
    pending.clear();
  };

  const scheduleLoad = (iframe) => {
    if (iframe.dataset.scheduled) return;
    iframe.dataset.scheduled = 'true';
    if (interacted) {
      loadIframe(iframe);
      return;
    }
    pending.add(iframe);
    const run = () => {
      loadIframe(iframe);
      pending.delete(iframe);
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 200);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          scheduleLoad(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '200px 0px' },
  );

  lazyIframes.forEach((iframe) => observer.observe(iframe));
  ['touchstart', 'pointerdown', 'keydown', 'scroll'].forEach((event) => {
    window.addEventListener(event, onInteraction, { once: true, passive: true });
  });
});
