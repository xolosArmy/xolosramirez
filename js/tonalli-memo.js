(function () {
  'use strict';

  // Public, read-only configuration. See docs/tonalli-memo-home-feed.md.
  const CONFIG = Object.freeze({
    apiBase: 'https://memo-api.xolosarmy.xyz/api/v1',
    publicUi: 'https://app.tonalli.cash/memo',
    limit: 6,
    timeoutMs: 8000,
    maxResponseBytes: 131072,
    maxMessageChars: 16384
  });
  const COPY = {
    es: {
      loading: 'Cargando publicaciones de Tonalli Memo…',
      available: (count) => `${count} ${count === 1 ? 'publicación reciente' : 'publicaciones recientes'}. Estados según el indexador.`,
      empty: 'Todavía no hay publicaciones en el feed oficial indexado.',
      unavailable: 'El servicio no está disponible por ahora. Puedes continuar en Tonalli Memo.',
      verified: 'Protocolo verificado',
      verificationNote: 'Verificación informada por el indexador de Tonalli Memo; no es una comprobación independiente de consenso.',
      confirmed: 'Confirmada en cadena',
      unconfirmed: 'Sin confirmar en cadena',
      unknown: 'Confirmación no disponible',
      blockDate: 'Fecha de bloque',
      seenDate: 'Primera observación',
      authorAddress: 'Dirección autora',
      authorHash: 'ID de autor',
      post: 'Consultar publicación',
      locale: 'es-MX'
    },
    en: {
      loading: 'Loading Tonalli Memo posts…',
      available: (count) => `${count} recent ${count === 1 ? 'post' : 'posts'}. Status reported by the indexer.`,
      empty: 'There are no posts in the official indexed feed yet.',
      unavailable: 'The service is currently unavailable. You can continue on Tonalli Memo.',
      verified: 'Protocol verified',
      verificationNote: 'Verification reported by the Tonalli Memo indexer; this is not independent consensus verification.',
      confirmed: 'Confirmed on chain',
      unconfirmed: 'Unconfirmed on chain',
      unknown: 'Confirmation unavailable',
      blockDate: 'Block date',
      seenDate: 'First seen',
      authorAddress: 'Author address',
      authorHash: 'Author ID',
      post: 'View post',
      locale: 'en-US'
    }
  };
  const TXID = /^[0-9a-f]{64}$/;
  const HASH160 = /^[0-9a-f]{40}$/;
  const ADDRESS = /^ecash:[qp][a-z0-9]{41}$/;
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const height = (value) => Number.isSafeInteger(value) && value >= 0;

  function feedUrl(base) {
    const url = new URL(base.trim());
    if (url.origin !== 'https://memo-api.xolosarmy.xyz' || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid public API configuration');
    }
    const path = url.pathname.replace(/\/+$/, '').replace(/(?:\/api\/v1)+$/, '');
    if (path !== '') throw new Error('Invalid public API path');
    url.pathname = '/api/v1/feed';
    url.searchParams.set('limit', String(CONFIG.limit));
    return url.href;
  }

  function timestamp(value) {
    // The API uses Unix seconds. Indexing timestamps are not publication dates.
    if (!Number.isSafeInteger(value) || value <= 0 || value > Date.now() / 1000 + 7200) return null;
    return new Date(value * 1000);
  }

  function parseItem(value) {
    if (!record(value) || !record(value.transaction) || !record(value.verification)) return null;
    const tx = value.transaction;
    const verification = value.verification;
    if (typeof tx.txid !== 'string' || !TXID.test(tx.txid) || verification.txid !== tx.txid || verification.status !== 'VERIFIED') return null;
    if (!['TM0', 'TM1'].includes(verification.protocol) || verification.protocolVersion !== (verification.protocol === 'TM0' ? 0 : 1)) return null;
    if (!['confirmed', 'unconfirmed'].includes(tx.chainStatus)) return null;
    if (typeof verification.payload !== 'string' || verification.payload.length > CONFIG.maxMessageChars) return null;
    // displayPayload is the API's original message without its NFT wire directive.
    const message = verification.displayPayload == null || verification.displayPayload === '' ? verification.payload : verification.displayPayload;
    if (typeof message !== 'string' || message.length > CONFIG.maxMessageChars || !message.trim()) return null;

    let author = null;
    if (typeof verification.authorizingAddress === 'string' && ADDRESS.test(verification.authorizingAddress)) {
      author = { type: 'authorAddress', value: verification.authorizingAddress };
    } else if (verification.protocol === 'TM1' && record(verification.tm1Authorship)) {
      const identity = verification.tm1Authorship;
      if (typeof identity.publicKeyHashHex === 'string' && HASH160.test(identity.publicKeyHashHex) &&
          identity.trustModel === 'trusted-chronik' && [65, 193].includes(identity.sighashByte)) {
        author = { type: 'authorHash', value: identity.publicKeyHashHex };
      }
    }
    const confirmed = tx.chainStatus === 'confirmed' && height(tx.blockHeight);
    const blockDate = confirmed ? timestamp(tx.blockTimestamp) : null;
    return {
      txid: tx.txid, message, author,
      chain: confirmed ? 'confirmed' : tx.chainStatus === 'unconfirmed' ? 'unconfirmed' : 'unknown',
      date: blockDate || timestamp(tx.firstSeenAt),
      dateLabel: blockDate ? 'blockDate' : 'seenDate'
    };
  }

  function parseFeed(value) {
    if (!record(value) || !Array.isArray(value.items) || !Number.isInteger(value.limit) ||
        value.limit < 1 || value.limit > 100 || value.items.length > value.limit) throw new Error('Invalid feed');
    const seen = new Set();
    const items = [];
    for (const raw of value.items) {
      const item = parseItem(raw);
      if (!item || seen.has(item.txid)) continue;
      seen.add(item.txid);
      items.push(item);
      if (items.length === CONFIG.limit) break;
    }
    if (value.items.length && !items.length) throw new Error('No valid records');
    return items; // Keep canonical API order; no project filter or client sorting.
  }

  async function readLimitedBody(response, controller) {
    const limit = CONFIG.maxResponseBytes;
    const declared = response.headers.get('content-length');
    if (declared != null && declared !== '') {
      const length = Number(declared);
      if (!Number.isFinite(length) || length < 0 || length > limit) {
        controller.abort();
        if (response.body && typeof response.body.cancel === 'function') {
          try { await response.body.cancel(); } catch (_) {}
        }
        throw new Error('Invalid response');
      }
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      controller.abort();
      throw new Error('Unavailable');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    const cancelReader = () => { reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    try {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new Error('Aborted');
        if (done) break;
        if (!value || !value.byteLength) continue;
        received += value.byteLength;
        if (received > limit) {
          controller.abort();
          throw new Error('Invalid response');
        }
        chunks.push(new Uint8Array(value));
      }
      if (controller.signal.aborted) throw new Error('Aborted');
    } finally {
      controller.signal.removeEventListener('abort', cancelReader);
      try { await reader.cancel(); } catch (_) {}
      try { reader.releaseLock(); } catch (_) {}
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderItem(item, copy) {
    const row = element('li', 'tonalli-memo__item');
    const article = element('article', 'tonalli-memo__post');
    if (item.author) {
      const author = element('p', 'tonalli-memo__author', `${copy[item.author.type]}: ${item.author.value}`);
      article.append(author);
    }
    article.append(element('p', 'tonalli-memo__message', item.message));
    if (item.date) {
      const date = element('p', 'tonalli-memo__date', `${copy[item.dateLabel]}: `);
      const time = element('time', '', new Intl.DateTimeFormat(copy.locale, {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
      }).format(item.date) + ' UTC');
      time.dateTime = item.date.toISOString();
      date.append(time);
      article.append(date);
    }
    const states = element('div', 'tonalli-memo__states');
    const verified = element('span', 'tonalli-memo__badge', copy.verified);
    verified.title = copy.verificationNote;
    states.append(verified, element('span', 'tonalli-memo__chain', copy[item.chain]));
    article.append(states);
    const link = element('a', 'tonalli-memo__link', `${copy.post} →`);
    link.href = `${CONFIG.publicUi}/tx/${item.txid}`;
    link.setAttribute('aria-label', `${copy.post}: ${item.txid.slice(0, 10)}…${item.txid.slice(-8)}`);
    article.append(link);
    row.append(article);
    return row;
  }

  const root = document.getElementById('tonalli-memo');
  if (!root || root.dataset.memoInitialized) return;
  root.dataset.memoInitialized = 'true';
  const copy = COPY[document.documentElement.lang.startsWith('en') ? 'en' : 'es'];
  const status = root.querySelector('[data-memo-status]');
  const list = root.querySelector('[data-memo-posts]');
  if (!status || !list) return;
  let started = false;

  function setState(state, text) {
    root.dataset.memoState = state;
    status.hidden = false;
    status.textContent = text;
  }

  async function load() {
    if (started) return;
    started = true;
    setState('loading', copy.loading);
    list.setAttribute('aria-busy', 'true');
    let timer;
    try {
      const controller = new AbortController();
      timer = window.setTimeout(() => controller.abort(), CONFIG.timeoutMs);
      const response = await window.fetch(feedUrl(CONFIG.apiBase), {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal
      });
      if (!response.ok) throw new Error('Unavailable');
      const body = await readLimitedBody(response, controller);
      if (controller.signal.aborted) throw new Error('Invalid response');
      const items = parseFeed(JSON.parse(body));
      const cards = items.map((item) => renderItem(item, copy));
      list.replaceChildren(...cards);
      list.hidden = items.length === 0;
      setState(items.length ? 'available' : 'empty', items.length ? copy.available(items.length) : copy.empty);
    } catch (_) {
      list.replaceChildren();
      list.hidden = true;
      setState('unavailable', copy.unavailable);
    } finally {
      window.clearTimeout(timer);
      list.setAttribute('aria-busy', 'false');
    }
  }

  function observe() {
    if (!('IntersectionObserver' in window)) { load(); return; }
    const observer = new window.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '300px' });
    observer.observe(root);
  }
  // Do not compete with the homepage's initial images and navigation.
  if (document.readyState === 'complete') observe();
  else window.addEventListener('load', observe, { once: true });
})();
