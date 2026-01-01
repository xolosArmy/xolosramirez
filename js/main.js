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
