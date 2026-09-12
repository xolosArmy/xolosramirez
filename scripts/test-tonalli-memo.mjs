import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../js/tonalli-memo.js', import.meta.url), 'utf8');
// Synthetic contract fixtures, never loaded by the homepages.
function post(n = 1, options = {}) {
  const txid = n.toString(16).padStart(64, '0');
  return {
    transaction: { txid, chainStatus: 'confirmed', blockHeight: 900000, blockTimestamp: 1700000000, ...options.transaction },
    verification: { txid, status: 'VERIFIED', protocol: 'TM1', protocolVersion: 1,
      payload: `TEST ONLY: message ${n}`, ...options.verification }
  };
}
const feed = (...items) => ({ items, limit: 6 });
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.hidden = true; this.value = ''; }
  set textContent(value) { this.value = String(value); this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Unsafe HTML insertion'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.value = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
function fixture({ json = feed(post()), fetch, lang = 'es', readyState = 'complete', observer = true, base } = {}) {
  const root = new Element('section'), status = new Element('p'), list = new Element('ol');
  const intro = new Element('p'), explore = new Element('a'), sibling = new Element('article');
  intro.textContent = 'INTRO PRESERVED';
  explore.href = 'https://app.tonalli.cash/memo';
  explore.textContent = 'Explorar Tonalli Memo';
  sibling.textContent = 'Guías e historias del linaje';
  root.querySelector = (selector) => selector === '[data-memo-status]' ? status : selector === '[data-memo-posts]' ? list : null;
  const document = {
    readyState, documentElement: { lang }, getElementById: () => root,
    createElement: (tag) => new Element(tag), body: { children: [root, sibling] }
  };
  let intersect, onLoad, timer, calls = 0, options, url, disconnected = false;
  const window = {
    fetch: async (...args) => {
      calls++; [url, options] = args;
      return fetch ? fetch(...args) : new Response(JSON.stringify(json));
    },
    setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout: () => { timer = null; },
    addEventListener: (event, fn) => { assert.equal(event, 'load'); onLoad = fn; }
  };
  if (observer) window.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe(node) { assert.equal(node, root); }
    disconnect() { disconnected = true; }
  };
  const context = vm.createContext({
    document, window, URL, AbortController, Intl, Date, TextDecoder, Uint8Array
  });
  const code = base ? source.replace("apiBase: 'https://memo-api.xolosarmy.xyz/api/v1'", `apiBase: ${JSON.stringify(base)}`) : source;
  const run = () => vm.runInContext(code, context);
  run();
  return {
    root, status, list, intro, explore, sibling, window, run,
    load: () => onLoad?.(), visible: () => intersect?.([{ isIntersecting: true }]),
    hidden: () => intersect?.([{ isIntersecting: false }]), timeout: () => timer?.(),
    get calls() { return calls; }, get options() { return options; }, get url() { return url; },
    get disconnected() { return disconnected; }, get timer() { return timer; }
  };
}
function streamedResponse(chunks, { headers, signal, onCancel, onPull, onEnqueue, hangAfter } = {}) {
  const encoder = new TextEncoder();
  let pulls = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      pulls++;
      onPull?.(pulls);
      if (signal?.aborted) {
        try { controller.error(signal.reason || new DOMException('Aborted', 'AbortError')); } catch (_) {}
        return;
      }
      if (hangAfter != null && pulls > hangAfter) {
        await new Promise((resolve) => {
          if (!signal) return;
          signal.addEventListener('abort', resolve, { once: true });
        });
        try { controller.error(signal?.reason || new DOMException('Aborted', 'AbortError')); } catch (_) {}
        return;
      }
      const chunk = chunks[pulls - 1];
      if (chunk === undefined) { controller.close(); return; }
      controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      onEnqueue?.(pulls);
    },
    cancel(reason) { onCancel?.(reason); }
  });
  return new Response(stream, { headers: headers || undefined });
}
function jsonOfBytes(target, extra = {}) {
  const make = (pad) => JSON.stringify({ items: [post(1, extra)], limit: 6, pad });
  const empty = make('');
  const size = Buffer.byteLength(empty);
  assert.ok(size <= target, 'base JSON exceeds target');
  const body = make('x'.repeat(target - size));
  assert.equal(Buffer.byteLength(body), target);
  return body;
}
async function settle() { for (let i = 0; i < 6; i++) await new Promise(setImmediate); }
async function render(options) { const f = fixture(options); f.visible(); await settle(); return f; }
function nodes(element, tag) { return [element, ...element.children.flatMap((child) => nodes(child, tag))].filter((child) => !tag || child.tagName === tag); }

test('public GET is deferred until page load and proximity; no duplicate requests or polling', async () => {
  const f = fixture({ readyState: 'interactive' });
  assert.equal(f.calls, 0); f.load(); f.hidden(); assert.equal(f.calls, 0);
  f.visible(); f.visible(); f.run(); await settle();
  assert.equal(f.calls, 1); assert.equal(f.disconnected, true); assert.equal(f.timer, null);
  assert.equal(f.url, 'https://memo-api.xolosarmy.xyz/api/v1/feed?limit=6');
  assert.equal(f.options.method, 'GET'); assert.equal(f.options.credentials, 'omit');
  assert.equal(f.options.mode, 'cors'); assert.equal(f.options.cache, 'no-store');
  assert.equal(f.options.headers, undefined);
});
test('loads after page load when IntersectionObserver is unavailable', async () => {
  const f = fixture({ observer: false }); await settle(); assert.equal(f.calls, 1); assert.equal(f.root.dataset.memoState, 'available');
});
test('renders up to six records in canonical order without project filtering', async () => {
  const items = [8, 2, 7, 1, 9, 3, 4].map((n) => post(n));
  const f = await render({ json: { items, limit: 25 } });
  assert.equal(f.list.children.length, 6);
  assert.deepEqual(nodes(f.list, 'a').map((a) => a.href.split('/').pop()), items.slice(0, 6).map((item) => item.transaction.txid));
  assert.equal(f.root.dataset.memoState, 'available'); assert.match(f.status.textContent, /^6 publicaciones/);
});
test('displayPayload is used unchanged; no translation or NFT media loading', async () => {
  const text = 'Original message: café\n  Δ 🐕 https://example.test/file';
  const f = await render({ json: feed(post(1, { verification: { displayPayload: text, attachment: { type: 'NFT', tokenId: 'a'.repeat(64) }, image: 'https://example.test/x.svg' } })) });
  assert.ok(nodes(f.list, 'p').some((p) => p.textContent === text));
  assert.equal(nodes(f.list, 'img').length, 0); assert.equal(nodes(f.list, 'iframe').length, 0);
  assert.equal(nodes(f.list, 'a').length, 1);
});
test('VERIFIED is independent of chain confirmation and isFinal', async () => {
  const f = await render({ lang: 'en', json: feed(
    post(1, { transaction: { chainStatus: 'unconfirmed', blockHeight: null, blockTimestamp: null, isFinal: true } }),
    post(2, { transaction: { isFinal: false } }),
    post(3, { transaction: { blockHeight: null } })
  ) });
  assert.match(f.list.children[0].textContent, /Protocol verified.*Unconfirmed on chain/);
  assert.doesNotMatch(f.list.children[0].textContent, /Confirmed on chain/);
  assert.match(f.list.children[1].textContent, /Confirmed on chain/);
  assert.match(f.list.children[2].textContent, /Confirmation unavailable/);
});
test('a valid attachment-only post retains its original payload when displayPayload is empty', async () => {
  const payload = '@nft1:' + 'a'.repeat(64);
  const f = await render({ json: feed(post(1, { verification: { payload, displayPayload: '' } })) });
  assert.equal(f.list.children.length, 1); assert.ok(nodes(f.list, 'p').some((p) => p.textContent === payload));
});
test('optional author, date and displayPayload fields may be absent; indexing dates are not displayed', async () => {
  const f = await render({ json: feed(post(1, { transaction: { blockTimestamp: undefined, firstSeenAt: undefined, firstIndexedAt: 1700000000 } })) });
  assert.equal(f.root.dataset.memoState, 'available'); assert.equal(nodes(f.list, 'time').length, 0);
  assert.doesNotMatch(f.list.textContent, /autor|Perfil oficial|2023/);
});
test('TM0 and TM1 remain supported; author IDs are only shown when structurally supported', async () => {
  const f = await render({ json: feed(
    post(1, { verification: { protocol: 'TM0', protocolVersion: 0, profileCode: 'XR', profileAlias: 'Invented alias' } }),
    post(2, { verification: { tm1Authorship: { publicKeyHashHex: 'a'.repeat(40), sighashByte: 65, trustModel: 'trusted-chronik' } } })
  ) });
  assert.equal(f.list.children.length, 2); assert.doesNotMatch(f.list.children[0].textContent, /Invented alias|XR/);
  assert.match(f.list.children[1].textContent, /ID de autor: a{40}/);
});
test('Unix seconds are labeled as block date or first seen in UTC; invalid timestamps are omitted', async () => {
  const f = await render({ lang: 'en', json: feed(
    post(1), post(2, { transaction: { blockTimestamp: null, firstSeenAt: 1700000000 } }),
    post(3, { transaction: { blockTimestamp: 1700000000000, firstSeenAt: 'not-a-date' } })
  ) });
  assert.match(f.list.children[0].textContent, /Block date:/); assert.match(f.list.children[1].textContent, /First seen:/);
  assert.equal(nodes(f.list.children[2], 'time').length, 0);
  assert.equal(nodes(f.list, 'time')[0].dateTime, '2023-11-14T22:13:20.000Z');
});
test('empty feed is distinct from unavailable in ES and EN', async () => {
  for (const lang of ['es', 'en']) {
    const f = await render({ lang, json: feed() });
    assert.equal(f.root.dataset.memoState, 'empty'); assert.equal(f.list.hidden, true);
    assert.match(f.status.textContent, lang === 'en' ? /no posts/ : /no hay publicaciones/);
  }
});
test('loading is localized and does not hide the component', async () => {
  const f = fixture({ lang: 'en', fetch: () => new Promise(() => {}) });
  f.visible(); assert.equal(f.root.dataset.memoState, 'loading'); assert.equal(f.status.textContent, 'Loading Tonalli Memo posts…');
  assert.equal(f.list.attributes['aria-busy'], 'true');
});
for (const [name, fetch] of [
  ['HTTP error', async () => new Response('PRIVATE SERVER ERROR', { status: 503 })],
  ['network failure', async () => { throw new Error('PRIVATE INTERNAL NETWORK ERROR'); }],
  ['invalid JSON', async () => new Response('<html>PRIVATE INTERNAL ERROR</html>')],
  ['unexpected structure', async () => new Response(JSON.stringify({ data: [] }))],
  ['invalid limit', async () => new Response(JSON.stringify({ items: [], limit: 0 }))],
  ['oversized response', async () => new Response('x'.repeat(131073))]
]) test(`${name}: safe unavailable state, no internal error body, ES and EN`, async () => {
  for (const lang of ['es', 'en']) {
    const f = await render({ fetch, lang });
    assert.equal(f.root.dataset.memoState, 'unavailable'); assert.equal(f.list.hidden, true);
    assert.doesNotMatch(f.status.textContent, /PRIVATE|INTERNAL|<html>/);
    assert.equal(f.list.attributes['aria-busy'], 'false'); assert.equal(f.timer, null);
  }
});
test('timeout aborts the request and never renders a late successful response', async () => {
  let resolve;
  const f = fixture({ fetch: () => new Promise((done) => { resolve = done; }) });
  f.visible(); f.timeout(); assert.equal(f.options.signal.aborted, true);
  resolve(new Response(JSON.stringify(feed(post())))); await settle();
  assert.equal(f.root.dataset.memoState, 'unavailable'); assert.equal(f.list.children.length, 0);
});
test('native fetch abort rejection settles timeout into an unavailable state', async () => {
  const f = fixture({ fetch: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) });
  f.visible(); f.timeout(); await settle(); assert.equal(f.root.dataset.memoState, 'unavailable'); assert.equal(f.timer, null);
});
test('HTML, scripts and post-supplied URLs stay inert text; links use the fixed HTTPS destination', async () => {
  const message = '<img src=x onerror=alert(1)><script>throw 1</script> javascript:alert(1)';
  const f = await render({ json: feed(post(1, { verification: { payload: message, url: 'javascript:alert(2)' } })) });
  assert.ok(nodes(f.list, 'p').some((p) => p.textContent === message));
  assert.deepEqual([...new Set(nodes(f.list).map((n) => n.tagName))].sort(), ['a', 'article', 'div', 'li', 'ol', 'p', 'span', 'time']);
  assert.match(nodes(f.list, 'a')[0].href, /^https:\/\/app\.tonalli\.cash\/memo\/tx\/[0-9a-f]{64}$/);
});
test('invalid TXIDs, mismatches, non-VERIFIED states and duplicate rows never become valid cards', async () => {
  for (const invalid of [
    post(1, { transaction: { txid: '../evil' } }),
    post(1, { verification: { txid: 'f'.repeat(64) } }),
    ...['UNAUTHORIZED', 'NO_MEMO', 'INVALID_MEMO', 'MULTIPLE_MEMOS'].map((status) => post(1, { verification: { status } })),
    post(1, { verification: { displayPayload: {} } }),
    post(1, { verification: { protocol: 'unknown' } })
  ]) {
    const f = await render({ json: feed(invalid, post(2), post(2)) });
    assert.equal(f.list.children.length, 1); assert.match(f.list.textContent, /message 2/);
    const allInvalid = await render({ json: feed(invalid) }); assert.equal(allInvalid.root.dataset.memoState, 'unavailable');
  }
});
test('long messages remain exact text; implausibly large messages are rejected', async () => {
  const message = 'x'.repeat(12000);
  const f = await render({ json: feed(post(1, { verification: { payload: message } })) });
  assert.ok(nodes(f.list, 'p').some((p) => p.textContent === message));
  const large = await render({ json: feed(post(1, { verification: { payload: 'x'.repeat(16385) } })) });
  assert.equal(large.root.dataset.memoState, 'unavailable');
});
test('API normalization avoids duplicate versions and rejects localhost or unexpected origins/paths', async () => {
  for (const base of ['https://memo-api.xolosarmy.xyz', 'https://memo-api.xolosarmy.xyz/', ' https://memo-api.xolosarmy.xyz/api/v1/api/v1/// ']) {
    const f = await render({ base }); assert.equal(f.url, 'https://memo-api.xolosarmy.xyz/api/v1/feed?limit=6');
  }
  for (const base of ['http://localhost:3000', 'https://evil.example/api/v1', 'https://memo-api.xolosarmy.xyz/admin', 'https://user@memo-api.xolosarmy.xyz/api/v1']) {
    const f = await render({ base }); assert.equal(f.calls, 0); assert.equal(f.root.dataset.memoState, 'unavailable');
  }
});
test('chunked responses without Content-Length are assembled and still bounded in bytes', async () => {
  const body = JSON.stringify(feed(post()));
  const mid = Math.ceil(body.length / 3);
  const f = await render({
    fetch: () => streamedResponse([body.slice(0, mid), body.slice(mid, mid * 2), body.slice(mid * 2)])
  });
  assert.equal(f.root.dataset.memoState, 'available');
  assert.match(f.list.textContent, /message 1/);
});
test('missing or lying Content-Length does not replace the byte cap or block a valid body', async () => {
  const valid = JSON.stringify(feed(post()));
  const missing = await render({ fetch: () => streamedResponse([valid]) });
  assert.equal(missing.root.dataset.memoState, 'available');
  const lyingSmall = await render({
    fetch: () => streamedResponse([valid], { headers: { 'Content-Length': '8' } })
  });
  assert.equal(lyingSmall.root.dataset.memoState, 'available');
  let cancelled = false, restEnqueued = false;
  const over = await render({
    fetch: (_, { signal }) => streamedResponse(
      [new Uint8Array(131073), new Uint8Array(2048)],
      {
        signal,
        headers: { 'Content-Length': '12' },
        hangAfter: 1,
        onEnqueue: (n) => { if (n > 1) restEnqueued = true; },
        onCancel: () => { cancelled = true; }
      }
    )
  });
  assert.equal(over.root.dataset.memoState, 'unavailable');
  assert.equal(cancelled, true);
  assert.equal(restEnqueued, false);
});
test('exactly 128 KiB is accepted; one extra byte is rejected even when Content-Length is absent', async () => {
  const exact = jsonOfBytes(131072);
  const f = await render({ fetch: () => streamedResponse([exact]) });
  assert.equal(f.root.dataset.memoState, 'available');
  assert.match(f.list.textContent, /message 1/);
  const over = await render({ fetch: () => streamedResponse([jsonOfBytes(131073)]) });
  assert.equal(over.root.dataset.memoState, 'unavailable');
  assert.equal(over.list.children.length, 0);
});
test('UTF-8 multibyte text and characters split across chunks decode as original text', async () => {
  const text = 'café 🐕 Δ — Tlilxóchitl';
  const body = JSON.stringify(feed(post(1, { verification: { payload: text, displayPayload: text } })));
  const bytes = new TextEncoder().encode(body);
  const splitAt = bytes.indexOf(0xC3) + 1;
  assert.ok(splitAt > 0 && splitAt < bytes.length);
  const f = await render({
    fetch: () => streamedResponse([bytes.slice(0, splitAt), bytes.slice(splitAt)])
  });
  assert.equal(f.root.dataset.memoState, 'available');
  assert.ok(nodes(f.list, 'p').some((p) => p.textContent === text));
});
test('byte limit counts UTF-8 bytes, not UTF-16 code units', async () => {
  const chars = 'é'.repeat(70000);
  assert.ok(chars.length < 131072);
  assert.ok(Buffer.byteLength(chars) > 131072);
  const body = JSON.stringify({ items: [post(1, { verification: { payload: chars, displayPayload: chars } })], limit: 6 });
  assert.ok(Buffer.byteLength(body) > 131072);
  const f = await render({ fetch: () => streamedResponse([body]) });
  assert.equal(f.root.dataset.memoState, 'unavailable');
});
test('timeout during body reading aborts and never renders a late remaining chunk', async () => {
  let pulls = 0, cancelled = false, delivered = 0;
  const body = JSON.stringify(feed(post()));
  const f = fixture({
    fetch: (_, { signal }) => streamedResponse(
      [body.slice(0, 8), body.slice(8)],
      {
        signal,
        hangAfter: 1,
        onPull: (n) => { pulls = n; if (n === 1) delivered = 1; },
        onCancel: () => { cancelled = true; }
      }
    )
  });
  f.visible();
  await settle();
  assert.equal(f.root.dataset.memoState, 'loading');
  assert.equal(delivered, 1);
  f.timeout();
  await settle();
  assert.equal(f.options.signal.aborted, true);
  assert.equal(cancelled, true);
  assert.ok(pulls >= 1);
  assert.equal(f.root.dataset.memoState, 'unavailable');
  assert.equal(f.list.children.length, 0);
  assert.equal(f.timer, null);
});
test('exceeding the limit cancels the reader before consuming the rest of the response', async () => {
  let cancelled = false, restEnqueued = false;
  const f = await render({
    fetch: (_, { signal }) => streamedResponse(
      [new Uint8Array(131073).fill(0x78), new Uint8Array(4096).fill(0x79)],
      {
        signal,
        hangAfter: 1,
        onEnqueue: (n) => { if (n > 1) restEnqueued = true; },
        onCancel: () => { cancelled = true; }
      }
    )
  });
  assert.equal(f.root.dataset.memoState, 'unavailable');
  assert.equal(cancelled, true);
  assert.equal(restEnqueued, false);
  assert.equal(f.options.signal.aborted, true);
});
test('missing streams are unavailable and never fall back to unlimited text() or arrayBuffer()', async () => {
  let unlimited = false;
  const f = await render({
    fetch: async () => ({
      ok: true,
      headers: { get: () => null },
      body: null,
      text: async () => { unlimited = true; return JSON.stringify(feed(post())); },
      arrayBuffer: async () => { unlimited = true; return new TextEncoder().encode(JSON.stringify(feed(post()))); }
    })
  });
  assert.equal(f.root.dataset.memoState, 'unavailable');
  assert.equal(unlimited, false);
});
test('localized unavailable state does not alter sibling page content or the public explore link', async () => {
  for (const lang of ['es', 'en']) {
    const f = await render({
      lang,
      fetch: () => streamedResponse([new Uint8Array(131073)])
    });
    assert.equal(f.root.dataset.memoState, 'unavailable');
    assert.equal(f.list.hidden, true);
    assert.equal(f.list.children.length, 0);
    assert.equal(f.status.hidden, false);
    assert.match(f.status.textContent, lang === 'en' ? /currently unavailable/ : /no está disponible/);
    assert.doesNotMatch(f.status.textContent, /PRIVATE|INTERNAL|131073|AbortError/);
    assert.equal(f.intro.textContent, 'INTRO PRESERVED');
    assert.equal(f.explore.href, 'https://app.tonalli.cash/memo');
    assert.equal(f.explore.textContent, 'Explorar Tonalli Memo');
    assert.equal(f.sibling.textContent, 'Guías e historias del linaje');
  }
});
