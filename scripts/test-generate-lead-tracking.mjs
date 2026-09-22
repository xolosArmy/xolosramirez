import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import vm from 'node:vm';

const read = (path) => readFileSync(path, 'utf8');
const main = read('js/main.js');
const leadCode = main.slice(
  main.indexOf('function getLeadElement'),
  main.indexOf('function initializePuppyCarousels')
);
const leadRuntimeCode = main.slice(
  main.indexOf('const CONTACT_FORM_SELECTOR'),
  main.indexOf('function initializePuppyCarousels')
);

function includes(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || 'Expected to find ' + needle);
}

function notMatches(haystack, pattern, message) {
  assert.equal(pattern.test(haystack), false, message || 'Unexpected match: ' + pattern);
}

function formTag(html) {
  const match = html.match(/<form[\s\S]*?data-gtm="contact-form"[\s\S]*?>/);
  assert.ok(match, 'Expected contact form with data-gtm="contact-form"');
  return match[0];
}

includes(main, "document.addEventListener('click'", 'Expected delegated click listener');
includes(main, "target.closest('[data-lead-type=\"generate_lead\"]')", 'Expected closest() based lead lookup');
includes(main, "event: 'xolos_generate_lead'", 'Expected xolos_generate_lead event push');
includes(main, "event: 'qualified_contact_intent'", 'Expected qualified_contact_intent event push');
includes(main, "if (cta === 'video_call') return 'video_call';", 'Expected video_call lead channel');
for (const intent of ['price_inquiry', 'profile_inquiry', 'video_call_request', 'contact_form']) {
  includes(main, `'${intent}'`, 'Expected qualified intent allowlist entry ' + intent);
}
notMatches(main, /contact_received/, 'Frontend must never emit contact_received');

for (const key of [
  'lead_channel',
  'cta_location',
  'lead_intent',
  'profile',
  'profile_status',
  'page_type',
  'lang',
]) {
  includes(leadCode, key, 'Expected payload parameter ' + key);
}

notMatches(leadCode, /^\s*value\s*:/m, 'generate_lead must not send a value parameter');
notMatches(leadCode, /\bcurrency\b/, 'generate_lead must not send currency');
includes(leadCode, "element.querySelector('[name=\"ejemplar\"]')", 'Form activation must read the selected public profile');
notMatches(leadCode, /new FormData|FormData\s*\(/, 'generate_lead must not read submitted form contents');
notMatches(leadCode, /querySelector(?:All)?\(['"](?:input|textarea|select|\[name=(?!["']ejemplar))/, 'generate_lead must not query private form fields');
notMatches(leadCode, /href|Click URL/i, 'generate_lead must not send href or Click URL');
notMatches(leadCode, /\(not set\)/i, 'Analytics resets must use undefined rather than an artificial label');

const leadAnalyticsFields = [
  'profile',
  'profile_status',
  'lead_channel',
  'lead_intent',
  'page_type',
  'cta_location',
  'lang',
];

function trackingFixture() {
  class TestElement {
    constructor(dataset = {}, tagName = 'a') {
      this.dataset = dataset;
      this.tagName = tagName.toUpperCase();
      this.classList = { contains: () => false };
    }

    closest(selector) {
      if (selector === '[data-lead-type="generate_lead"]') {
        return this.dataset.leadType === 'generate_lead' ? this : null;
      }
      if (selector === 'form[data-gtm="contact-form"]') {
        return this instanceof TestForm ? this : null;
      }
      return null;
    }

    getAttribute(name) {
      return name === 'type' ? '' : null;
    }
  }

  class TestForm extends TestElement {
    constructor(dataset, selectedProfile = 'general') {
      super(dataset, 'form');
      this.profileControl = {
        value: selectedProfile,
        options: [
          { value: 'general' },
          { value: 'xilonen' },
          { value: 'tlilxochitl' },
        ],
      };
    }

    matches(selector) {
      return selector === 'form[data-gtm="contact-form"]';
    }

    checkValidity() {
      return true;
    }

    querySelector(selector) {
      return selector === '[name="ejemplar"]' ? this.profileControl : null;
    }
  }

  const listeners = {};
  const rawPushes = [];
  const emittedEvents = [];
  const dataLayerModel = {};
  const dataLayer = [];
  dataLayer.push = (message) => {
    rawPushes.push(message);
    for (const field of leadAnalyticsFields) {
      if (!Object.prototype.hasOwnProperty.call(message, field)) continue;
      if (message[field] === undefined) delete dataLayerModel[field];
      else dataLayerModel[field] = message[field];
    }
    if (message.event) emittedEvents.push({ event: message.event, ...dataLayerModel });
    return rawPushes.length;
  };

  const document = {
    documentElement: { lang: 'es' },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  const window = { dataLayer };
  vm.runInNewContext(leadRuntimeCode, {
    document,
    window,
    Element: TestElement,
    HTMLFormElement: TestForm,
    Set,
    Object,
    Date,
    Boolean,
  });

  return {
    rawPushes,
    emittedEvents,
    click(dataset) {
      listeners.click({ target: new TestElement({ leadType: 'generate_lead', ...dataset }) });
    },
    submit(dataset, selectedProfile) {
      listeners.submit({ target: new TestForm({ leadType: 'generate_lead', ...dataset }, selectedProfile) });
    },
  };
}

function assertAnalyticsContext(event, expected) {
  for (const field of leadAnalyticsFields) {
    if (Object.prototype.hasOwnProperty.call(expected, field)) {
      assert.equal(event[field], expected[field], `${event.event} must set ${field}`);
    } else {
      assert.equal(field in event, false, `${event.event} must clear stale ${field}`);
    }
  }
}

function assertResetBeforeEveryEvent(rawPushes) {
  const eventIndexes = rawPushes
    .map((message, index) => message.event ? index : -1)
    .filter((index) => index >= 0);
  for (const index of eventIndexes) {
    assert.ok(index > 0, 'Every analytics event must have a preceding reset');
    const reset = rawPushes[index - 1];
    assert.equal('event' in reset, false, 'Reset must not emit an analytics event');
    for (const field of leadAnalyticsFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(reset, field), `Reset must include ${field}`);
      assert.equal(reset[field], undefined, `Reset must clear ${field} with undefined`);
    }
    assert.doesNotMatch(JSON.stringify(reset), /\(not set\)/i);
  }
}

const profileContext = {
  lead_channel: 'email',
  lead_intent: 'profile_inquiry',
  page_type: 'available-xolos',
  cta_location: 'profile_card',
  profile: 'xilonen',
  profile_status: 'available',
  lang: 'es',
};
const priceContext = {
  lead_channel: 'whatsapp',
  lead_intent: 'price_inquiry',
  page_type: 'home',
  cta_location: 'floating',
  lang: 'es',
};
const videoCallContext = {
  lead_channel: 'video_call',
  lead_intent: 'video_call_request',
  page_type: 'contact',
  cta_location: 'inline',
  lang: 'es',
};
const contactFormContext = {
  lead_channel: 'form',
  lead_intent: 'contact_form',
  page_type: 'contact',
  cta_location: 'contact_form',
  lang: 'es',
};
const xilonenContactFormContext = {
  ...contactFormContext,
  profile: 'xilonen',
};
const generalContext = {
  lead_channel: 'email',
  lead_intent: 'general_inquiry',
  page_type: 'contact',
  cta_location: 'inline',
  lang: 'es',
};

function activateProfile(fixture) {
  fixture.click({
    cta: 'email',
    leadIntent: 'profile_inquiry',
    pageType: 'available-xolos',
    ctaLocation: 'profile_card',
    profile: 'xilonen',
    status: 'available',
    lang: 'es',
  });
}

function assertQualifiedPair(events, expected) {
  assert.deepEqual(events.map(({ event }) => event), ['xolos_generate_lead', 'qualified_contact_intent']);
  for (const event of events) assertAnalyticsContext(event, expected);
}

{
  const fixture = trackingFixture();
  activateProfile(fixture);
  fixture.click({ cta: 'whatsapp', leadChannel: 'whatsapp', leadIntent: 'price_inquiry', pageType: 'home', ctaLocation: 'floating', lang: 'es' });
  assertQualifiedPair(fixture.emittedEvents.slice(0, 2), profileContext);
  assertQualifiedPair(fixture.emittedEvents.slice(2), priceContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

{
  const fixture = trackingFixture();
  fixture.submit({ cta: 'form', leadIntent: 'contact_form', pageType: 'contact', ctaLocation: 'contact_form', lang: 'es' }, 'xilonen');
  assertQualifiedPair(fixture.emittedEvents, xilonenContactFormContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

for (const noSelectedProfile of ['', 'general']) {
  const fixture = trackingFixture();
  fixture.submit({ cta: 'form', leadIntent: 'contact_form', pageType: 'contact', ctaLocation: 'contact_form', lang: 'es' }, noSelectedProfile);
  assertQualifiedPair(fixture.emittedEvents, contactFormContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

{
  const fixture = trackingFixture();
  activateProfile(fixture);
  fixture.click({ cta: 'video_call', leadIntent: 'video_call_request', pageType: 'contact', ctaLocation: 'inline', lang: 'es' });
  assertQualifiedPair(fixture.emittedEvents.slice(0, 2), profileContext);
  assertQualifiedPair(fixture.emittedEvents.slice(2), videoCallContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

{
  const fixture = trackingFixture();
  activateProfile(fixture);
  fixture.submit({ cta: 'form', leadIntent: 'contact_form', pageType: 'contact', ctaLocation: 'contact_form', lang: 'es' });
  assertQualifiedPair(fixture.emittedEvents.slice(0, 2), profileContext);
  assertQualifiedPair(fixture.emittedEvents.slice(2), contactFormContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

{
  const fixture = trackingFixture();
  fixture.click({ cta: 'email', leadIntent: 'general_inquiry', pageType: 'contact', ctaLocation: 'inline', lang: 'es' });
  activateProfile(fixture);
  assert.deepEqual(fixture.emittedEvents.map(({ event }) => event), [
    'xolos_generate_lead',
    'xolos_generate_lead',
    'qualified_contact_intent',
  ]);
  assertAnalyticsContext(fixture.emittedEvents[0], generalContext);
  assertQualifiedPair(fixture.emittedEvents.slice(1), profileContext);
  assertResetBeforeEveryEvent(fixture.rawPushes);
}

includes(main, 'LEAD_DEDUPLICATION_MS = 1500', 'Expected 1500 ms deduplication window');
includes(main, 'getLeadSignature(payload)', 'Expected signature-based deduplication');
includes(main, "tagName === 'button' && type === 'submit'", 'Click listener must ignore submit buttons');
includes(main, "tagName === 'input' && type === 'submit'", 'Click listener must ignore submit inputs');
includes(main, "element.dataset.cta === 'contact-form'", 'Click listener must ignore contact-form CTA clicks');
includes(main, 'Boolean(element.closest(CONTACT_FORM_SELECTOR))', 'Click listener must ignore leads inside contact forms');
includes(main, "document.addEventListener('submit'", 'Expected delegated submit listener');
includes(main, 'form instanceof HTMLFormElement', 'Submit listener must require HTMLFormElement');
includes(main, "form.matches(CONTACT_FORM_SELECTOR)", 'Submit listener must target contact form');
includes(main, 'form.checkValidity()', 'Submit listener must only measure valid submissions');

const contactEs = read('contacto.html');
const contactEn = read('en/contact.html');
const esForm = formTag(contactEs);
const enForm = formTag(contactEn);
for (const entry of [[esForm, 'es'], [enForm, 'en']]) {
  const tag = entry[0];
  const lang = entry[1];
  includes(tag, 'data-lead-type="generate_lead"');
  includes(tag, 'data-cta="form"');
  notMatches(tag, /data-profile=|data-status=/, 'Generic forms must not invent profile context');
  includes(tag, 'data-page-type="contact"');
  includes(tag, 'data-lang="' + lang + '"');
  includes(tag, 'data-cta-location="contact_form"');
  includes(tag, 'data-lead-intent="contact_form"');
  includes(tag, 'data-gtm="contact-form"');
  includes(tag, 'action="https://formspree.io/f/xbdzegwj"');
  includes(tag, 'method="POST"');
  includes(tag, 'aria-label=');
}

for (const path of ['index.html', 'en/index.html']) {
  const html = read(path);
  assert.ok(/class="[^"]*home-email-float[^"]*"[\s\S]*?data-cta="whatsapp"[\s\S]*?data-lead-type="generate_lead"[\s\S]*?data-lead-channel="whatsapp"/.test(html), path + ' must keep floating WhatsApp lead CTA');
}

const floatingPriceExpectations = [
  {
    path: 'index.html',
    lang: 'es',
    pageType: 'home',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por WhatsApp',
  },
  {
    path: 'en/index.html',
    lang: 'en',
    pageType: 'home',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price on WhatsApp',
  },
  {
    path: 'xolos-disponibles.html',
    lang: 'es',
    pageType: 'available-xolos',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por WhatsApp',
  },
  {
    path: 'en/available-xolos.html',
    lang: 'en',
    pageType: 'available-xolos',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price on WhatsApp',
  },
  {
    path: 'contacto.html',
    lang: 'es',
    pageType: 'contact',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por WhatsApp',
  },
  {
    path: 'en/contact.html',
    lang: 'en',
    pageType: 'contact',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price on WhatsApp',
  },
];

for (const expectation of floatingPriceExpectations) {
  const html = read(expectation.path);

  const matches = html.match(
    /<a(?=[^>]*class="[^"]*\bhome-email-float\b[^"]*")[^>]*>[\s\S]*?<\/a>/g
  ) || [];

  assert.equal(
    matches.length,
    1,
    expectation.path + ' must have exactly one floating price CTA'
  );

  const cta = matches[0];

  includes(
    cta,
    'href="https://wa.me/message/KGKS3MKYMHCWE1"',
    expectation.path + ' must open the official WhatsApp direct link'
  );

  includes(
    cta,
    'class="home-email-float cta-lead cta-email"',
    expectation.path + ' must preserve the existing floating CTA classes'
  );

  includes(
    cta,
    'target="_blank"',
    expectation.path + ' must open WhatsApp in a new tab context'
  );

  includes(
    cta,
    'rel="noopener noreferrer"',
    expectation.path + ' must isolate the new tab'
  );

  includes(
    cta,
    'data-cta="whatsapp"',
    expectation.path + ' must track the WhatsApp CTA'
  );

  includes(
    cta,
    'data-lead-type="generate_lead"',
    expectation.path + ' must keep generate_lead'
  );

  includes(
    cta,
    'data-lead-channel="whatsapp"',
    expectation.path + ' must identify WhatsApp as the lead channel'
  );

  includes(
    cta,
    'data-lead-intent="price_inquiry"',
    expectation.path + ' must declare inquiry intent'
  );

  for (const attribute of [
    'data-cta-location="floating"',
    'data-page-type="' + expectation.pageType + '"',
    'data-lang="' + expectation.lang + '"',
  ]) {
    includes(cta, attribute, expectation.path + ' must keep ' + attribute);
  }

  notMatches(cta, /data-profile=|data-status=/, expectation.path + ' must not invent profile context');

  includes(
    cta,
    'fa-brands fa-whatsapp',
    expectation.path + ' must show the WhatsApp brand icon'
  );

  notMatches(
    cta,
    /✉️|fa-envelope/i,
    expectation.path + ' floating WhatsApp CTA must not show an email icon'
  );

  includes(
    cta,
    'class="home-email-float__text">' + expectation.visibleText + '</span>',
    expectation.path + ' must show the localized inquiry text'
  );

  includes(
    cta,
    'aria-label="' + expectation.accessibleText + '"',
    expectation.path + ' must use the localized aria-label'
  );

  notMatches(
    cta,
    /data-cta="video_call"|data-lead-intent="video_call_request"/i,
    expectation.path + ' must not relabel the floating price CTA as a video call'
  );

  notMatches(cta, /mailto:/i, expectation.path + ' floating price CTA must not use mailto');
}

const profileExpectations = [
  ['tlilxochitl', 'available', 'Tlilxóchitl Ramirez'],
  ['xilonen', 'available', 'Xilonen Ramirez'],
  ['iztli', 'available', 'Iztli Ramirez'],
  ['yohualli', 'reserved', 'Yohualli Ramirez'],
  ['tonalli', 'reserved', 'Tonalli Ramírez'],
  ['xochitl', 'reserved', 'Xochitl Ramirez'],
];
for (const [path, prefix] of [['xolos-disponibles.html', 'Preguntar por '], ['en/available-xolos.html', 'Ask about ']]) {
  const html = read(path);
  for (const [profile, status, name] of profileExpectations) {
    const match = html.match(new RegExp(`<a(?=[^>]*data-profile="${profile}")(?=[^>]*data-cta-location="profile_card")[^>]*>[\\s\\S]*?<\\/a>`));
    assert.ok(match, path + ' must expose the CTA for ' + profile);
    const cta = match[0];
    includes(cta, 'data-cta="email"');
    includes(cta, 'data-lead-intent="profile_inquiry"');
    includes(cta, 'data-status="' + status + '"');
    includes(cta, 'data-page-type="available-xolos"');
    includes(cta, '>' + prefix + name + '</a>');
  }
}

for (const path of [
  'blog/precio-xoloitzcuintle.html',
  'en/blog/xoloitzcuintli-price.html',
  'teyolias-guardiania.html',
  'en/teyolias-guardianship.html',
  'public/xolos-disponibles.html',
  'js/public-xolos-data-adapter.js',
  'js/webmcp-tools.js',
]) {
  notMatches(read(path), /wa\.me\/message\/KGKS3MKYMHCWE1/i, path + ' must not gain the floating WhatsApp route outside the requested surfaces');
}

for (const [path, primaryLabel, secondaryLabel] of [
  ['contacto.html', 'Correo · canal principal', 'Videollamada'],
  ['en/contact.html', 'Email · primary channel', 'Video call'],
]) {
  const html = read(path);
  assert.ok(html.indexOf(primaryLabel) >= 0, path + ' must identify email as primary');
  assert.ok(html.indexOf(primaryLabel) < html.indexOf(secondaryLabel), path + ' must present email before video call');
}

const skinCareHtml = read('xolo-skin-care/index.html');
const skinCareFloating = skinCareHtml.match(/<a(?=[^>]*class="[^"]*sticky-buy__action--email[^"]*")(?=[^>]*data-cta-location="floating")[^>]*>[\s\S]*?<\/a>/);
assert.ok(skinCareFloating, 'Xolo Skin Care must keep its floating guidance CTA');
includes(skinCareFloating[0], 'href="https://wa.me/message/KGKS3MKYMHCWE1"');
includes(skinCareFloating[0], 'data-cta="whatsapp"');
includes(skinCareFloating[0], 'data-lead-channel="whatsapp"');
includes(skinCareFloating[0], 'fa-brands fa-whatsapp');
includes(skinCareFloating[0], 'Pedir orientación');
notMatches(skinCareFloating[0], /mailto:/i, 'Xolo Skin Care floating CTA must not use mailto');
notMatches(skinCareFloating[0], /fa-envelope/i, 'Xolo Skin Care floating CTA must not show an email icon');

const sitemap = read('sitemap.xml');
assert.equal((sitemap.match(/<loc>https:\/\/xolosramirez\.com\/xolos-disponibles\.html<\/loc>/g) || []).length, 1);
assert.equal((sitemap.match(/<loc>https:\/\/xolosramirez\.com\/en\/available-xolos\.html<\/loc>/g) || []).length, 1);
notMatches(sitemap, /<loc>[^<]*\/(?:xolos-disponibles|en\/available-xolos)<\/loc>/, 'Sitemap must not contain extensionless availability aliases');

for (const [path, alias, canonical] of [
  ['xolos-disponibles.html', '/xolos-disponibles', '/xolos-disponibles.html'],
  ['en/available-xolos.html', '/en/available-xolos', '/en/available-xolos.html'],
]) {
  const html = read(path);
  includes(html, `window.location.pathname === '${alias}'`, path + ' must detect the extensionless alias');
  includes(html, `window.location.replace('${canonical}' + window.location.search + window.location.hash)`, path + ' must preserve query and fragment when consolidating');
  includes(html, `rel="canonical" href="https://xolosramirez.com${canonical}"`);
}

function walkHtml(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'reports', 'import'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(path));
    else if (extname(entry.name) === '.html') files.push(path);
  }
  return files;
}
for (const path of walkHtml('.')) {
  const html = read(path);
  for (const match of html.matchAll(/\b(?:href|content)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (/xolos-disponibles/i.test(value) && !/^mailto:/i.test(value)) {
      assert.match(value, /xolos-disponibles\.html(?:[?#]|$)/, path + ' has a non-canonical availability link: ' + value);
    }
    if (/available-xolos/i.test(value)) {
      assert.match(value, /available-xolos\.html(?:[?#]|$)/, path + ' has a non-canonical English availability link: ' + value);
    }
  }
}

for (const path of [
  'index.html',
  'en/index.html',
  'xolos-disponibles.html',
  'en/available-xolos.html',
  'contacto.html',
  'en/contact.html',
]) {
  const html = read(path);
  includes(html, 'GTM-MGTMWN7T', path + ' must keep GTM container');
}

for (const path of ['index.html', 'en/index.html', 'xolos-disponibles.html', 'en/available-xolos.html', 'contacto.html', 'en/contact.html']) {
  const html = read(path);
  const inlineLeadPattern = new RegExp('onclick=[^>]*' +
    'generate_lead', 'i');
  const inlineLeadMessage = path + ' must not add inline onclick ' +
    'generate_lead';
  notMatches(html, inlineLeadPattern, inlineLeadMessage);
}

const repoFiles = [
  'js/main.js',
  'index.html',
  'en/index.html',
  'xolos-disponibles.html',
  'en/available-xolos.html',
  'contacto.html',
  'en/contact.html',
];
for (const path of repoFiles) {
  notMatches(read(path), /gtag\(\s*['"]event['"]\s*,\s*['"]generate_lead['"]/i, path + ' must not send generate_lead through gtag');
}

console.log('generate_lead tracking checks passed');
