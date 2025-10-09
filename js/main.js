const menuToggle = document.querySelector('[data-menu-toggle]');
const menuList = document.querySelector('[data-menu-list]');

const setMenuState = (isOpen) => {
  if (!menuList) return;
  menuList.setAttribute('data-open', String(isOpen));
  menuList.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (menuToggle) {
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  }
};

const syncMenuWithViewport = (mediaQuery) => {
  if (!menuList) return;
  if (mediaQuery.matches) {
    setMenuState(true);
    return;
  }
  const expanded =
    menuToggle && menuToggle.getAttribute('aria-expanded') === 'true';
  setMenuState(Boolean(expanded));
};

if (menuToggle && menuList) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuList.getAttribute('data-open') === 'true';
    setMenuState(!isOpen);
  });

  const mediaQuery = window.matchMedia('(min-width: 769px)');
  syncMenuWithViewport(mediaQuery);

  const handleViewportChange = (event) => {
    syncMenuWithViewport(event);
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleViewportChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleViewportChange);
  }
} else if (menuList) {
  setMenuState(true);
}

const yearElement = document.getElementById('year');
if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');

if (menuList) {
  const links = menuList.querySelectorAll('a');
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
