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
    const xilonenLatestVideoId = '4Wf_OxgWjmU';
    const xilonenLatestVideoUrl = `https://youtu.be/${xilonenLatestVideoId}`;
    const xilonenLatestEmbedUrl = `https://www.youtube.com/embed/${xilonenLatestVideoId}`;
    const xilonen = document.querySelector('.puppy-card[data-profile-card="xilonen"], #xilonen');
    if (xilonen) {
      const refreshedVideos = [
        {
          oldId: 'nrZ-PhE4bHA',
          newId: 'VLiFbDu0rDg',
          titleEs: 'Xilonen Ramirez — video reciente',
          titleEn: 'Xilonen Ramirez — recent video',
        },
        {
          oldId: 'rYDusjW9Gi0',
          newId: '-XXPMtM9vvA',
          titleEs: 'Xilonen Ramirez — video reciente',
          titleEn: 'Xilonen Ramirez — recent video',
        },
      ];

      refreshedVideos.forEach(({ oldId, newId, titleEs, titleEn }) => {
        const iframe = xilonen.querySelector(`iframe[src*="/embed/${oldId}"]`);
        const container = iframe?.closest('.puppy-video-container');
        if (!iframe || !container) return;

        container.dataset.xilonenVideo = newId;
        container.style.aspectRatio = '9 / 16';
        container.style.maxWidth = '360px';
        iframe.src = `https://www.youtube.com/embed/${newId}`;
        iframe.title = english ? titleEn : titleEs;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

        const fallback = container.nextElementSibling?.matches('a.video-fallback')
          ? container.nextElementSibling
          : null;
        if (fallback) fallback.href = `https://youtube.com/shorts/${newId}`;
      });
    }

    if (xilonen && !xilonen.querySelector(`[data-xilonen-video="${xilonenLatestVideoId}"]`)) {
      const firstVideo = xilonen.querySelector('.puppy-video-container[data-xilonen-video], .puppy-video-container');
      const firstFallback = firstVideo?.previousElementSibling?.matches('a.video-fallback')
        ? firstVideo.previousElementSibling
        : null;
      const insertionPoint = firstFallback || firstVideo || xilonen.querySelector('.puppy-card__actions');

      if (insertionPoint?.parentNode) {
        const fallback = document.createElement('a');
        fallback.href = xilonenLatestVideoUrl;
        fallback.className = 'video-fallback';
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.textContent = english ? 'Open on YouTube' : 'Abrir en YouTube';

        const container = document.createElement('div');
        container.className = 'puppy-video-container';
        container.style.cssText = 'margin: 1rem 0; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9;';
        container.dataset.xilonenVideo = xilonenLatestVideoId;

        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.src = xilonenLatestEmbedUrl;
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
  const canonicalRequestedProfile = requestedProfile === 'oce' ? 'iztli' : requestedProfile;
  // Only known option values can become context; arbitrary URL text is never rendered or submitted.
  // Normalize deprecated deep-link profile keys before selecting the canonical profile.
  if (profile && Array.from(profile.options).some((option) => option.value === canonicalRequestedProfile)) {
    profile.value = canonicalRequestedProfile;
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
      const formData = new FormData(form);
      const submittedProfileValue = formData.get('ejemplar');
      const submittedProfile = typeof submittedProfileValue === 'string'
        && submittedProfileValue !== ''
        && submittedProfileValue !== 'general'
        ? submittedProfileValue
        : '';
      const response = await window.fetch(form.action, {
        method: 'POST', body: formData, headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('contact_request_failed');
      status.dataset.state = 'success';
      status.textContent = english
        ? 'Thank you. Your message was sent. We will reply by email within 48 business hours. If you wish, you can also choose a video-call time above.'
        : 'Gracias. Tu mensaje se envió. Te responderemos por correo en menos de 48 horas hábiles. Si lo deseas, también puedes elegir un horario de videollamada arriba.';
      form.reset();
      const submitPayload = {
        event: 'contact_form_submit',
        lead_channel: 'form',
        lead_intent: 'contact_form',
        cta_location: 'contact_form',
        page_type: 'contact',
        lang: english ? 'en' : 'es',
      };
      if (submittedProfile) submitPayload.profile = submittedProfile;
      push(submitPayload);
    } catch {
      status.dataset.state = 'error';
      status.textContent = english
        ? 'We could not confirm delivery. Your message remains in the form. Try again or use the email link above.'
        : 'No pudimos confirmar el envío. Tu mensaje sigue en el formulario. Intenta de nuevo o usa el enlace de correo de arriba.';
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
