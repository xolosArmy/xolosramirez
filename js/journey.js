/* Progressive enhancements for navigation, profiles, current video content and contact routes. */
(() => {
  const english = document.documentElement.lang.startsWith('en');
  const push = (payload) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  };
  const pageType = document.body.classList.contains('journey-home') ? 'home'
    : document.body.classList.contains('journey-available') ? 'available-xolos'
      : document.body.classList.contains('journey-contact') ? 'contact' : 'editorial';

  if (pageType === 'available-xolos') {
    const latestVideoId = '4Wf_OxgWjmU';
    const latestVideoUrl = `https://youtu.be/${latestVideoId}`;
    const latestEmbedUrl = `https://www.youtube.com/embed/${latestVideoId}`;
    const xilonen = document.querySelector('.puppy-card[data-profile-card="xilonen"], #xilonen');

    if (xilonen && !xilonen.querySelector(`[data-xilonen-video="${latestVideoId}"]`)) {
      const firstVideo = xilonen.querySelector('.puppy-video-container[data-xilonen-video], .puppy-video-container');
      const firstFallback = firstVideo?.previousElementSibling?.matches('a.video-fallback')
        ? firstVideo.previousElementSibling
        : null;
      const insertionPoint = firstFallback || firstVideo || xilonen.querySelector('.puppy-card__actions');

      if (insertionPoint?.parentNode) {
        const fallback = document.createElement('a');
        fallback.href = latestVideoUrl;
        fallback.className = 'video-fallback';
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.textContent = english ? 'Open on YouTube' : 'Abrir en YouTube';

        const container = document.createElement('div');
        container.className = 'puppy-video-container';
        container.style.cssText = 'margin: 1rem 0; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9;';
        container.dataset.xilonenVideo = latestVideoId;

        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.src = latestEmbedUrl;
        iframe.title = english ? 'Xilonen Ramirez — latest video' : 'Xilonen Ramirez — video más reciente';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.loading = 'lazy';
        container.appendChild(iframe);

        insertionPoint.parentNode.insertBefore(fallback, insertionPoint);
        insertionPoint.parentNode.insertBefore(container, insertionPoint);
      }
    }

    const latestShow = Array.from(document.querySelectorAll('.live-show')).find((section) => {
      const heading = section.querySelector('h2');
      const text = heading?.textContent.trim();
      return text === 'Último The Xolos Ramirez Show' || text === 'Latest The Xolos Ramirez Show';
    });

    if (latestShow) {
      const iframe = latestShow.querySelector('.live-show__video iframe');
      if (iframe) {
        iframe.src = latestEmbedUrl;
        iframe.title = english ? 'Latest The Xolos Ramirez Show episode' : 'Último episodio de The Xolos Ramirez Show';
      }

      latestShow.querySelectorAll('a[href*="youtu"]').forEach((link) => {
        link.href = latestVideoUrl;
        link.setAttribute(
          'aria-label',
          english ? 'Watch the latest The Xolos Ramirez Show episode on YouTube' : 'Ver el último episodio de The Xolos Ramirez Show en YouTube',
        );
      });

      const description = latestShow.querySelector('.live-show__content p:not(.live-show__eyebrow)');
      if (description) {
        description.innerHTML = english
          ? '<strong>The latest episode of The Xolos Ramirez Show.</strong> Watch the complete conversation on our YouTube channel.'
          : '<strong>El episodio más reciente de The Xolos Ramirez Show.</strong> Mira la conversación completa en nuestro canal de YouTube.';
      }
    }
  }

  // Capture navigation intent only; never collect form content, email addresses or query strings.
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-funnel-step]') : null;
    if (!link || !['view_profiles', 'contact'].includes(link.dataset.funnelStep)) return;
    push({ event: 'xolos_journey_step', step: link.dataset.funnelStep, page_type: pageType, lang: english ? 'en' : 'es' });
  });

  const toolbar = document.querySelector('[data-profile-filters]');
  if (toolbar) {
    const cards = Array.from(document.querySelectorAll('.puppy-card[data-profile-status]'));
    const buttons = Array.from(toolbar.querySelectorAll('[data-filter]'));
    const count = toolbar.querySelector('[data-profile-count]');
    const applyFilter = (filter) => {
      if (!['all', 'available', 'reserved'].includes(filter)) return;
      let total = 0;
      cards.forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.profileStatus !== filter;
        if (!card.hidden) total += 1;
      });
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
      count.textContent = english ? `${total} of ${cards.length} profiles` : `${total} de ${cards.length} perfiles`;
    };
    buttons.forEach((button) => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
    // A shared profile anchor must stay reachable even after a different filter was selected.
    const revealLinkedProfile = () => {
      const target = cards.find((card) => `#${card.id}` === window.location.hash);
      if (target?.hidden) {
        applyFilter('all');
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    };
    toolbar.hidden = false;
    applyFilter('all');
    window.addEventListener('hashchange', revealLinkedProfile);
  }

  document.querySelectorAll('.nav-universe').forEach((details) => {
    document.addEventListener('click', (event) => {
      if (!details.contains(event.target)) details.open = false;
    });
    details.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        details.open = false;
        details.querySelector('summary').focus();
      }
    });
  });

  const form = document.querySelector('form[data-contact-enhanced]');
  if (!form) return;
  const profile = form.querySelector('[name="ejemplar"]');
  const requestedProfile = new URLSearchParams(window.location.search).get('profile');
  // Only known option values can become context; arbitrary URL text is never rendered or submitted.
  if (profile && Array.from(profile.options).some((option) => option.value === requestedProfile)) {
    profile.value = requestedProfile;
    const reason = form.querySelector('[name="motivo"]');
    if (reason) reason.value = 'adopcion';
  }

  if (!window.fetch || !window.FormData || !window.AbortController) return;
  const status = form.querySelector('[data-form-status]');
  const button = form.querySelector('[type="submit"]');
  const initialLabel = button.textContent;
  let pending = false;
  form.addEventListener('submit', async (event) => {
    if (!form.checkValidity()) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.dataset.state = 'pending';
    status.textContent = english ? 'Sending your message…' : 'Enviando tu mensaje…';
    button.textContent = english ? 'Sending…' : 'Enviando…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await window.fetch(form.action, {
        method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('contact_request_failed');
      status.dataset.state = 'success';
      status.textContent = english
        ? 'Thank you. Your message was sent. We will reply by email within 48 business hours. If you wish, you can also choose a video-call time above.'
        : 'Gracias. Tu mensaje se envió. Te responderemos por correo en menos de 48 horas hábiles. Si lo deseas, también puedes elegir un horario de videollamada arriba.';
      form.reset();
      push({ event: 'xolos_contact_success', lead_channel: 'form', page_type: 'contact', lang: english ? 'en' : 'es' });
    } catch {
      status.dataset.state = 'error';
      status.textContent = english
        ? 'We could not confirm delivery. Your message remains in the form. Try again or use the WhatsApp and email links above.'
        : 'No pudimos confirmar el envío. Tu mensaje sigue en el formulario. Intenta de nuevo o usa los enlaces de WhatsApp y correo de arriba.';
    } finally {
      window.clearTimeout(timeout);
      pending = false;
      button.disabled = false;
      button.textContent = initialLabel;
      form.removeAttribute('aria-busy');
      status.focus();
    }
  });
})();
