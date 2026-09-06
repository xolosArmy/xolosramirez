import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/journey.js', import.meta.url), 'utf8');
class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  async emit(type, props = {}) {
    const event = { target: this, preventDefault() {}, ...props };
    await Promise.all((this.listeners[type] || []).map((listener) => listener(event)));
  }
}
function fixture({ lang = 'es', query = '', withForm = false, fetch } = {}) {
  const buttons = ['all', 'available', 'reserved'].map((filter) => new Element({ filter }));
  const cards = [['tlilxochitl','available'],['xilonen','available'],['oce','reserved']].map(([id, profileStatus]) => Object.assign(new Element({ profileStatus }), { id }));
  const count = new Element();
  const toolbar = new Element();
  toolbar.hidden = true;
  toolbar.querySelectorAll = () => buttons;
  toolbar.querySelector = () => count;
  const status = new Element();
  const button = new Element(); button.textContent = 'Enviar mensaje';
  const profile = { options: [{ value: 'general' }, { value: 'xilonen' }], value: 'general' };
  const reason = { value: '' };
  const form = new Element();
  form.action = 'https://formspree.io/f/xbdzegwj';
  form.querySelector = (selector) => ({ '[name="ejemplar"]': profile, '[name="motivo"]': reason, '[data-form-status]': status, '[type="submit"]': button })[selector];
  form.valid = true;
  form.checkValidity = () => form.valid;
  form.message = 'Private family note, private@example.test';
  form.reset = () => { form.message = ''; form.resets = (form.resets || 0) + 1; };
  const document = new Element();
  document.documentElement = { lang };
  document.body = { classList: { contains: (name) => name === (withForm ? 'journey-contact' : 'journey-available') } };
  document.querySelector = (selector) => selector === '[data-profile-filters]' ? toolbar : withForm ? form : null;
  document.querySelectorAll = (selector) => selector.startsWith('.puppy-card') ? cards : [];
  const window = new Element();
  window.location = { hash: '', search: query };
  window.dataLayer = [];
  window.fetch = fetch;
  window.FormData = class { constructor(form) { this.content = form.message; } };
  window.AbortController = AbortController;
  window.setTimeout = (callback) => { window.timeout = callback; return 1; };
  window.clearTimeout = () => { window.timeout = null; };
  const context = { document, window, Element, URLSearchParams, FormData: window.FormData, AbortController };
  vm.runInNewContext(source, context);
  return { window, document, cards, buttons, count, toolbar, status, button, form, profile, reason };
}

test('filters show all initially, preserve order and correctly announce both subsets', async () => {
  const f = fixture();
  assert.equal(f.toolbar.hidden, false);
  assert.equal(f.count.textContent, '3 de 3 perfiles');
  await f.buttons[1].emit('click');
  assert.deepEqual(f.cards.map((c) => c.hidden), [false, false, true]);
  assert.equal(f.count.textContent, '2 de 3 perfiles');
  assert.equal(f.buttons[1].attributes['aria-pressed'], 'true');
  await f.buttons[2].emit('click');
  assert.deepEqual(f.cards.map((c) => c.hidden), [true, true, false]);
  await f.buttons[0].emit('click');
  assert.deepEqual(f.cards.map((c) => c.hidden), [false, false, false]);
});
test('a shared profile hash restores a profile hidden by a filter', async () => {
  const f = fixture({ lang: 'en' });
  await f.buttons[2].emit('click');
  f.window.location.hash = '#xilonen';
  await f.window.emit('hashchange');
  assert.equal(f.cards[1].hidden, false);
  assert.equal(f.cards[1].scrolled, true);
  assert.equal(f.count.textContent, '3 of 3 profiles');
});
test('contact accepts a known profile and rejects arbitrary query content', () => {
  const known = fixture({ withForm: true, query: '?profile=xilonen' });
  assert.equal(known.profile.value, 'xilonen');
  assert.equal(known.reason.value, 'adopcion');
  const unknown = fixture({ withForm: true, query: '?profile=%3Cscript%3Eprivate%40example.test' });
  assert.equal(unknown.profile.value, 'general');
  assert.equal(unknown.reason.value, '');
  assert.equal(unknown.form.listeners.submit, undefined, 'native POST remains when fetch is unavailable');
});
test('invalid input never starts a request', async () => {
  let requests = 0;
  const f = fixture({ withForm: true, fetch: async () => { requests++; return { ok: true }; } });
  f.form.valid = false;
  await f.form.emit('submit');
  assert.equal(requests, 0);
});
test('duplicate clicks send once; confirmed success clears the form and records no personal data', async () => {
  let resolve, requests = 0;
  const f = fixture({ withForm: true, fetch: () => { requests++; return new Promise((r) => { resolve = r; }); } });
  const first = f.form.emit('submit');
  await f.form.emit('submit');
  assert.equal(requests, 1);
  assert.equal(f.button.disabled, true);
  assert.equal(f.form.attributes['aria-busy'], 'true');
  assert.equal(f.window.dataLayer.length, 0, 'no success event before response');
  resolve({ ok: true }); await first;
  assert.equal(f.form.resets, 1);
  assert.equal(f.status.dataset.state, 'success');
  assert.equal(f.button.disabled, false);
  assert.equal(f.status.focused, true);
  assert.equal(f.window.dataLayer.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.window.dataLayer[0])), { event: 'xolos_contact_success', lead_channel: 'form', page_type: 'contact', lang: 'es' });
  assert.doesNotMatch(JSON.stringify(f.window.dataLayer), /Private|example|profile|href/);
});
test('HTTP rejection preserves the message and permits a successful retry', async () => {
  let requests = 0;
  const f = fixture({ withForm: true, lang: 'en', fetch: async () => ({ ok: ++requests > 1 }) });
  await f.form.emit('submit');
  assert.equal(f.status.dataset.state, 'error');
  assert.match(f.form.message, /Private/);
  assert.equal(f.form.resets, undefined);
  assert.equal(f.window.dataLayer.length, 0);
  assert.equal(f.button.disabled, false);
  await f.form.emit('submit');
  assert.equal(f.status.dataset.state, 'success');
  assert.equal(f.window.dataLayer[0].lang, 'en');
});
test('network failure retains input and offers direct contact alternatives', async () => {
  const f = fixture({ withForm: true, fetch: async () => { throw new Error('offline'); } });
  await f.form.emit('submit');
  assert.equal(f.status.dataset.state, 'error');
  assert.match(f.status.textContent, /WhatsApp y correo/);
  assert.match(f.form.message, /Private/);
  assert.equal(f.button.disabled, false);
});
test('timeout aborts the request, keeps input and never confirms delivery', async () => {
  const f = fixture({ withForm: true, fetch: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))) });
  const pending = f.form.emit('submit');
  f.window.timeout(); await pending;
  assert.equal(f.status.dataset.state, 'error');
  assert.match(f.form.message, /Private/);
  assert.equal(f.window.dataLayer.length, 0);
});
test('journey analytics use a fixed step vocabulary and omit URL/profile details', async () => {
  const f = fixture();
  const link = new Element({ funnelStep: 'contact', profile: 'private@example.test' });
  link.closest = () => link;
  await f.document.emit('click', { target: link });
  assert.deepEqual(JSON.parse(JSON.stringify(f.window.dataLayer)), [{ event: 'xolos_journey_step', step: 'contact', page_type: 'available-xolos', lang: 'es' }]);
  link.dataset.funnelStep = 'private@example.test';
  await f.document.emit('click', { target: link });
  assert.equal(f.window.dataLayer.length, 1);
});
