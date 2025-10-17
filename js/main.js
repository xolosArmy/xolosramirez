const btn = document.querySelector('.hamburger');
const menu = document.querySelector('#menu');
if (btn && menu) {
  const menuLinks = Array.from(menu.querySelectorAll('a'));

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuState(false, { returnFocus: true });
    }
  };

  const setMenuState = (
    open,
    { focusFirstLink = false, returnFocus = false } = {},
  ) => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.dataset.visible = open ? 'true' : 'false';
    menu.classList.toggle('is-open', open);

    if (open) {
      document.addEventListener('keydown', handleKeydown);
      if (focusFirstLink) {
        const firstLink = menuLinks[0];
        if (firstLink) {
          firstLink.focus();
        }
      }
    } else {
      document.removeEventListener('keydown', handleKeydown);
      if (returnFocus) {
        btn.focus();
      }
    }
  };

  btn.addEventListener('click', (event) => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    const triggeredByKeyboard = event.detail === 0;

    setMenuState(!isOpen, {
      focusFirstLink: !isOpen && triggeredByKeyboard,
      returnFocus: isOpen && triggeredByKeyboard,
    });
  });

  menuLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setMenuState(false);
    });
  });

  setMenuState(false);
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
