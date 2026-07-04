// Frontend behaviour test — loads the real app.js in a jsdom DOM and drives interactions.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
const check = (name, cond, detail) => { if (cond) pass++; else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); } };

// Mock fetch so app.js can "load" without a real server
const CLINICS = [
  { id: 1, name: 'Ancoats Dental House', type: 'nhs', area: 'City Centre', postcode: 'M4 5AB', phone: '0161 555 0101', description: 'Test', accepting_new: 1, featured: 1, verified: 1, rating: 5, review_count: 2 },
  { id: 2, name: 'Didsbury Smile Studio', type: 'private', area: 'South', postcode: 'M20 2YZ', phone: '0161 555 0102', description: 'Test', accepting_new: 1, featured: 0, verified: 0, rating: null, review_count: 0 },
];
function mockFetch(url, opts) {
  const u = url.replace('/api', '');
  let body = {};
  if (u.startsWith('/auth/me')) return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'no' }) });
  if (u.startsWith('/clinics?')) body = { clinics: CLINICS };
  else if (u.match(/^\/clinics\/\d+$/)) body = { clinic: CLINICS[0], reviews: [] };
  else if (u.startsWith('/practice-leads')) body = { ok: true, message: 'Thanks' };
  else body = { clinics: CLINICS };
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
global.window = window; global.document = window.document;
window.fetch = mockFetch;
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
if (!window.navigator.serviceWorker) Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: () => Promise.resolve() }, configurable: true });

// Inject CSS so getComputedStyle can read cursor rules
const styleEl = window.document.createElement('style');
styleEl.textContent = css;
window.document.head.appendChild(styleEl);

// Run app.js inside the window context
const scriptEl = window.document.createElement('script');
scriptEl.textContent = appjs;
window.document.body.appendChild(scriptEl);
// jsdom outside-only won't auto-run; execute manually in window scope:
const vm = require('vm');
vm.runInContext(appjs, dom.getInternalVMContext());

setTimeout(() => {
  const doc = window.document;

  // TEST: nav rendered
  check('nav links render', doc.getElementById('nav').children.length > 0);

  // Navigate to For Practices
  window.location.hash = '#/for-practices';
  window.dispatchEvent(new window.Event('hashchange'));

  setTimeout(() => {
    const tiers = doc.querySelectorAll('.tier');
    check('two pricing tiers render', tiers.length === 2, 'found ' + tiers.length);
    check('tiers have role=button', [...tiers].every(t => t.getAttribute('role') === 'button'));
    check('tiers are keyboard-focusable', [...tiers].every(t => t.getAttribute('tabindex') === '0'));
    check('tiers start unselected', [...tiers].every(t => t.getAttribute('aria-pressed') === 'false'));

    // CLICK the £29 Standard tier (the exact bug reported)
    tiers[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('clicking Standard selects it', tiers[0].getAttribute('aria-pressed') === 'true');
    check('Featured stays unselected after Standard click', tiers[1].getAttribute('aria-pressed') === 'false');

    // Switch to Featured
    tiers[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('clicking Featured switches selection', tiers[1].getAttribute('aria-pressed') === 'true');
    check('Standard deselects when Featured picked', tiers[0].getAttribute('aria-pressed') === 'false');

    // Switch BACK to Standard (the "won't let me switch" complaint)
    tiers[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('can switch back to Standard', tiers[0].getAttribute('aria-pressed') === 'true');

    // hidden field carries the choice
    const hidden = doc.getElementById('selected_tier');
    check('hidden selected_tier field exists', !!hidden);
    check('selected tier recorded in field', hidden && hidden.value === 'Standard', 'val=' + (hidden && hidden.value));

    // CURSOR checks via computed style
    const cur = (sel) => { const e = doc.querySelector(sel); return e ? window.getComputedStyle(e).cursor : 'none'; };
    check('tier cursor is pointer', cur('.tier') === 'pointer', cur('.tier'));
    check('button cursor is pointer', cur('.btn') === 'pointer', cur('.btn'));

    // Navigate to clinics list and check cards + cursor
    window.location.hash = '#/clinics';
    window.dispatchEvent(new window.Event('hashchange'));
    setTimeout(() => {
      const cards = doc.querySelectorAll('.clinic-card');
      check('clinic cards render on list', cards.length >= 1, 'found ' + cards.length);
      check('clinic card cursor is pointer', cards[0] && window.getComputedStyle(cards[0]).cursor === 'pointer');
      check('featured card has featured class', [...cards].some(c => c.classList.contains('featured')));
      check('cards are links (href set)', cards[0] && cards[0].getAttribute('href')?.startsWith('#/clinic/'));

      // filter chips
      const chips = doc.querySelectorAll('.chip');
      check('filter chips render', chips.length >= 4);
      check('chip cursor is pointer', chips[0] && window.getComputedStyle(chips[0]).cursor === 'pointer');

      console.log(`\n${'='.repeat(50)}`);
      console.log(`FRONTEND: ${pass} passed, ${fail} failed`);
      if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); }
      else console.log('✓ ALL FRONTEND TESTS PASSED');
      console.log('='.repeat(50));
      process.exit(fail > 0 ? 1 : 0);
    }, 300);
  }, 300);
}, 500);
