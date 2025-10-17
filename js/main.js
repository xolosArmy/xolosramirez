const btn = document.querySelector('.hamburger');
const menu = document.querySelector('#menu');
if (btn && menu) {
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
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
