const btn = document.querySelector('.hamburger');
const menu = document.querySelector('#menu');
const mobileQuery = window.matchMedia('(max-width: 900px)');

if (btn && menu) {
  let isMenuOpen = false;
  let previousFocus = null;

  const applyAriaHidden = () => {
    if (mobileQuery.matches) {
      menu.setAttribute('aria-hidden', isMenuOpen ? 'false' : 'true');
    } else {
      menu.removeAttribute('aria-hidden');
    }
  };

  const focusFirstLink = () => {
    const firstLink = menu.querySelector('a');
    if (firstLink) {
      firstLink.focus({ preventScroll: true });
    }
  };

  const handleOutsideClick = (event) => {
    if (!isMenuOpen) return;
    if (!menu.contains(event.target) && !btn.contains(event.target)) {
      closeMenu();
    }
  };

  const handleKeydown = (event) => {
    if (!isMenuOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  const openMenu = () => {
    if (isMenuOpen) return;
    isMenuOpen = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Cerrar menú de navegación');
    applyAriaHidden();

    if (mobileQuery.matches) {
      document.addEventListener('click', handleOutsideClick);
      document.addEventListener('keydown', handleKeydown);
      focusFirstLink();
    }
  };

  const closeMenu = (returnFocus = true) => {
    if (!isMenuOpen && mobileQuery.matches) {
      applyAriaHidden();
      return;
    }
    if (!isMenuOpen) return;

    isMenuOpen = false;
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Abrir menú de navegación');
    applyAriaHidden();

    if (mobileQuery.matches) {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeydown);
    }

    if (returnFocus) {
      const target = previousFocus && previousFocus.focus ? previousFocus : btn;
      target?.focus({ preventScroll: true });
    }

    previousFocus = null;
  };

  btn.addEventListener('click', () => {
    if (isMenuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  btn.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isMenuOpen) {
      event.preventDefault();
      closeMenu();
    }
  });

  menu.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (link && isMenuOpen && mobileQuery.matches) {
      closeMenu(false);
    }
  });

  const handleMediaChange = (event) => {
    if (!event.matches) {
      closeMenu(false);
    }
    applyAriaHidden();
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', handleMediaChange);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(handleMediaChange);
  }

  applyAriaHidden();
}

const yearElement = document.getElementById('year');
if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');

if (menu) {
  const links = menu.querySelectorAll('a');
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
