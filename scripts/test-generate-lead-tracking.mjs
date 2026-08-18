import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const main = read('js/main.js');
const leadCode = main.slice(main.indexOf('function getLeadElement'));

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
includes(main, "if (cta === 'video_call') return 'video_call';", 'Expected video_call lead channel');

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

notMatches(leadCode, /\bvalue\b/, 'generate_lead must not send value');
notMatches(leadCode, /\bcurrency\b/, 'generate_lead must not send currency');
notMatches(leadCode, /\.value\b|new FormData|FormData\s*\(/, 'generate_lead must not read field values');
notMatches(leadCode, /querySelector(?:All)?\(['"](?:input|textarea|select)/, 'generate_lead must not query form fields');
notMatches(leadCode, /href|Click URL/i, 'generate_lead must not send href or Click URL');

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
  includes(tag, 'data-profile="general"');
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
  assert.ok(/class="[^"]*(wa-float|home-email-float)[^"]*"[\s\S]*?data-cta="email"[\s\S]*?data-lead-type="generate_lead"/.test(html), path + ' must keep floating email lead CTA');
}

const floatingVideoCallExpectations = [
  {
    path: 'xolos-disponibles.html',
    lang: 'es',
    visibleText: 'Agendar videollamada',
    accessibleText: 'Agendar videollamada con Xolos Ramírez',
  },
  {
    path: 'en/available-xolos.html',
    lang: 'en',
    visibleText: 'Book a video call',
    accessibleText: 'Book a video call with Xolos Ramírez',
  },
];

for (const expectation of floatingVideoCallExpectations) {
  const html = read(expectation.path);

  const matches = html.match(
    /<a(?=[^>]*class="[^"]*\bvideo-call-float\b[^"]*")[^>]*>[\s\S]*?<\/a>/g
  ) || [];

  assert.equal(
    matches.length,
    1,
    expectation.path + ' must have exactly one floating video-call CTA'
  );

  const cta = matches[0];

  includes(
    cta,
    'href="https://calendar.app.google/1PXNvJM42iZ3JMHC8"',
    expectation.path + ' must use the exact Calendar booking URL'
  );

  includes(
    cta,
    'class="home-email-float video-call-float cta-lead"',
    expectation.path + ' must keep the visual class and add the semantic class'
  );

  includes(
    cta,
    'target="_blank"',
    expectation.path + ' must open the booking page in a new tab'
  );

  includes(
    cta,
    'rel="noopener noreferrer"',
    expectation.path + ' must isolate the new tab'
  );

  includes(
    cta,
    'data-cta="video_call"',
    expectation.path + ' must track the video-call channel'
  );

  includes(
    cta,
    'data-lead-type="generate_lead"',
    expectation.path + ' must keep generate_lead'
  );

  includes(
    cta,
    'data-lead-intent="video_call_request"',
    expectation.path + ' must declare booking intent'
  );

  for (const attribute of [
    'data-cta-location="floating"',
    'data-profile="general"',
    'data-status="not_applicable"',
    'data-page-type="available-xolos"',
    'data-lang="' + expectation.lang + '"',
  ]) {
    includes(cta, attribute, expectation.path + ' must keep ' + attribute);
  }

  includes(
    cta,
    'class="home-email-float__text">' + expectation.visibleText + '</span>',
    expectation.path + ' must show the localized booking text'
  );

  includes(
    cta,
    'aria-label="' + expectation.accessibleText + '"',
    expectation.path + ' must use the localized aria-label'
  );

  includes(
    cta,
    'title="' + expectation.accessibleText + '"',
    expectation.path + ' must use the localized title'
  );

  notMatches(
    cta,
    /mailto:|data-cta="email"|data-lead-intent="price_inquiry"/i,
    expectation.path + ' must not retain floating email behavior'
  );

  assert.equal(
    /(?:wa\.me|api\.whatsapp\.com|whatsapp:\/\/)/i.test(cta),
    false,
    expectation.path + ' must not keep floating WhatsApp'
  );

  includes(
    html,
    'href="https://wa.me/525518555993"',
    expectation.path + ' must keep the non-floating WhatsApp CTA'
  );

  assert.ok(
    /mailto:/i.test(html),
    expectation.path + ' must keep internal email links'
  );

  assert.ok(
    /data-profile="(?!general)[^"]+"/.test(html),
    expectation.path + ' must keep profile slugs'
  );

  assert.ok(
    /data-status="(?:available|reserved|delivered|teyolia)"/.test(html),
    expectation.path + ' must keep profile statuses'
  );
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
