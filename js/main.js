const menuToggle = document.querySelector('[data-menu-toggle]');
const menuList = document.querySelector('[data-menu-list]');

if (menuToggle && menuList) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuList.getAttribute('data-open') === 'true';
    menuList.setAttribute('data-open', String(!isOpen));
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
  });
}

const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');

if (menuList) {
  [...menuList.querySelectorAll('a')].forEach((link) => {
    const targetPath = new URL(link.getAttribute('href'), window.location.origin + window.location.pathname)
      .pathname.replace(/\/index\.html$/, '/');
    if (targetPath !== '/' && currentPath.endsWith(targetPath)) {
      link.setAttribute('aria-current', 'page');
    } else if (targetPath === '/' && currentPath === '/') {
      link.setAttribute('aria-current', 'page');
    }
  });
}
