/* DentaLink Manchester — front-end app (no framework, XSS-safe DOM building) */
'use strict';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let ME = null;

/* ---------- tiny DOM helper (uses textContent — never innerHTML with user data) ---------- */
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3800);
}

const TYPE_LABEL = { nhs: 'NHS / free-eligible', mixed: 'Mixed NHS & private', private: 'Private' };

function starsEl(rating, count) {
  if (!count) return el('span', { class: 'stars' }, el('span', { class: 'n' }, 'No reviews yet'));
  const full = Math.round(rating);
  return el('span', { class: 'stars', 'aria-label': rating + ' out of 5 stars' },
    '\u2605'.repeat(full) + '\u2606'.repeat(5 - full), ' ',
    el('span', { class: 'n' }, `${rating} (${count})`));
}

/* ---------- navigation ---------- */
function renderNav() {
  nav.replaceChildren(
    el('a', { href: '#/clinics' }, 'Find a dentist'),
    el('a', { href: '#/how-it-works' }, 'How it works'),
    el('a', { href: '#/for-practices' }, 'For practices'),
    ...(ME ? [
      ME.role === 'patient' ? el('a', { href: '#/my-registrations' }, 'My registrations') : null,
      ME.role === 'clinic' ? el('a', { href: '#/clinic-dashboard' }, 'Clinic dashboard') : null,
      ME.role === 'admin' ? el('a', { href: '#/admin' }, 'Admin') : null,
      el('a', { href: '#/', class: 'cta', onclick: async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }); ME = null; renderNav(); location.hash = '#/'; toast('Logged out.'); } }, 'Log out'),
    ] : [
      el('a', { href: '#/login' }, 'Log in'),
      el('a', { href: '#/signup', class: 'cta' }, 'Sign up'),
    ])
  );
}

/* ---------- pages ---------- */
function pageHome() {
  main.replaceChildren(
    el('section', { class: 'hero' },
      el('h1', {}, 'Every dentist near you, ', el('span', { class: 'u' }, 'sorted by what you\u2019ll pay'), '.'),
      el('p', {}, 'NHS, mixed and private practices in one place across Greater Manchester. See who\u2019s accepting new patients, register online in minutes, then ring the practice to book your first appointment.'),
      el('div', { class: 'search-bar' },
        el('input', { type: 'search', id: 'homeq', placeholder: 'Search by area or postcode \u2014 e.g. Didsbury, M20', 'aria-label': 'Search by area or postcode' }),
        el('button', { class: 'btn primary', onclick: () => { const v = document.getElementById('homeq').value; location.hash = '#/clinics?q=' + encodeURIComponent(v); } }, 'Search practices'),
      ),
      el('div', { class: 'band-legend' },
        el('span', {}, el('i', { class: 'b-nhs' }), 'NHS \u2014 free if exempt'),
        el('span', {}, el('i', { class: 'b-mixed' }), 'Mixed NHS & private'),
        el('span', {}, el('i', { class: 'b-private' }), 'Private'),
      ),
    ),
    el('h2', { class: 'page-title' }, 'Currently accepting new patients'),
    el('div', { class: 'clinic-list', id: 'homelist' }, el('p', { class: 'muted' }, 'Loading practices\u2026')),
  );
  api('/clinics?accepting=1').then(d => {
    const list = document.getElementById('homelist');
    if (list) list.replaceChildren(...d.clinics.slice(0, 4).map(clinicCard),
      el('p', {}, el('a', { href: '#/clinics' }, 'See all practices \u2192')));
  }).catch(e => toast(e.message));
}

function clinicCard(c) {
  return el('a', { class: 'clinic-card' + (c.featured ? ' featured' : ''), href: '#/clinic/' + c.id },
    el('span', { class: 'spine ' + c.type, 'aria-hidden': 'true' }),
    el('div', { class: 'clinic-body' },
      c.featured ? el('span', { class: 'featured-flag' }, '\u2726 Featured') : null,
      el('div', { class: 'card-top' },
        el('h3', {}, c.name, c.verified ? el('span', { class: 'vtick', title: 'Verified by DentaLink' }, ' \u2713') : null),
        el('span', { class: 'type-tag ' + c.type }, c.type === 'mixed' ? 'Mixed' : c.type === 'nhs' ? 'NHS' : 'Private')),
      starsEl(c.rating, c.review_count),
      el('p', { class: 'clinic-meta' }, `${c.area} \u00B7 ${c.postcode}`),
      el('p', { class: 'clinic-desc' }, c.description || ''),
      el('div', { class: 'badges' },
        el('span', { class: 'badge ' + (c.accepting_new ? 'open' : 'closed') }, c.accepting_new ? '\u2713 Accepting new patients' : 'List currently full'),
        el('span', { class: 'badge plain' }, '\u260E ' + c.phone),
      ),
    ),
  );
}

function pageClinics(params) {
  const state = { type: params.get('type') || '', accepting: params.get('accepting') === '1', q: params.get('q') || '' };
  const chips = [
    ['', 'All'], ['nhs', 'NHS'], ['mixed', 'Mixed'], ['private', 'Private'],
  ];
  const load = () => {
    const qs = new URLSearchParams();
    if (state.type) qs.set('type', state.type);
    if (state.accepting) qs.set('accepting', '1');
    if (state.q) qs.set('q', state.q);
    api('/clinics?' + qs).then(d => {
      document.getElementById('count').textContent = `${d.clinics.length} practice${d.clinics.length === 1 ? '' : 's'} found`;
      document.getElementById('list').replaceChildren(
        ...(d.clinics.length ? d.clinics.map(clinicCard)
          : [el('p', { class: 'muted' }, 'No practices match those filters yet. Try widening your search.')]));
    }).catch(e => toast(e.message));
  };
  main.replaceChildren(
    el('h1', { class: 'page-title' }, 'Find a dental practice'),
    el('div', { class: 'search-bar' },
      el('input', { type: 'search', value: state.q, placeholder: 'Area, postcode or practice name', 'aria-label': 'Search practices', oninput: (e) => { state.q = e.target.value; load(); } }),
    ),
    el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by cost type' },
      ...chips.map(([val, label]) => el('button', {
        class: 'chip', 'aria-pressed': String(state.type === val),
        onclick: (e) => { state.type = val; [...e.target.parentNode.querySelectorAll('.chip')].forEach(c => c.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); load(); },
      }, label)),
      el('button', { class: 'chip', 'aria-pressed': String(state.accepting), onclick: (e) => { state.accepting = !state.accepting; e.target.setAttribute('aria-pressed', String(state.accepting)); load(); } }, 'Accepting new patients'),
    ),
    el('p', { class: 'result-count', id: 'count' }, '\u2026'),
    el('div', { class: 'clinic-list', id: 'list' }),
  );
  load();
}

function pageClinic(id) {
  main.replaceChildren(el('p', { class: 'muted', style: 'margin-top:2rem' }, 'Loading\u2026'));
  api('/clinics/' + id).then(({ clinic: c, reviews }) => {
    let hours = null;
    try { hours = JSON.parse(c.opening_hours); } catch {}
    main.replaceChildren(
      el('div', { class: 'detail-head' },
        el('div', {},
          el('h1', {}, c.name, c.verified ? el('span', { class: 'vtick', title: 'Verified by DentaLink' }, ' \u2713') : null),
          starsEl(c.rating, c.review_count),
          el('p', { class: 'muted' }, `${c.address}, ${c.postcode} \u00B7 ${c.area}`)),
        el('span', { class: 'type-pill ' + c.type }, TYPE_LABEL[c.type]),
      ),
      el('div', { class: 'badges' },
        el('span', { class: 'badge ' + (c.accepting_new ? 'open' : 'closed') }, c.accepting_new ? 'Accepting new patients' : 'New patient list currently full')),
      el('div', { class: 'detail-grid' },
        el('div', { class: 'panel' },
          el('h2', {}, 'About this practice'),
          el('p', {}, c.description || 'No description provided yet.'),
          c.services ? el('div', {},
            el('h2', {}, 'Services'),
            el('div', { class: 'services' }, ...c.services.split(',').map(s => el('span', { class: 'service-chip' }, s.trim())))) : null,
          c.photo_url ? el('img', { class: 'clinic-photo', src: c.photo_url, alt: 'Photo of ' + c.name, loading: 'lazy' }) : null,
          hours ? el('div', {},
            el('h2', {}, 'Opening hours'),
            el('table', { class: 'hours' }, ...Object.entries(hours).map(([d, h]) => el('tr', {}, el('td', {}, d), el('td', {}, h))))) : null,
        ),
        el('div', { class: 'panel' },
          el('h2', {}, 'Register, then ring to book'),
          el('p', { class: 'muted' }, '1. Register online so the practice has your details.'),
          el('p', { class: 'muted' }, '2. Ring them to book your first appointment.'),
          el('a', { class: 'call-num', href: 'tel:' + c.phone.replace(/\s/g, '') }, c.phone),
          c.accepting_new
            ? el('a', { class: 'btn primary', href: '#/register/' + c.id, style: 'width:100%' }, 'Register with this practice')
            : el('p', { class: 'form-error' }, 'This practice isn\u2019t taking new patients right now. You can still ring them to join their waiting list.'),
        ),
      ),
      reviewsPanel(c, reviews),
    );
  }).catch(e => { main.replaceChildren(el('p', { class: 'form-error', style: 'margin-top:2rem' }, e.message)); });
}

function reviewsPanel(c, reviews) {
  let picked = 0;
  const starBtns = [1, 2, 3, 4, 5].map(n =>
    el('button', { type: 'button', 'aria-label': n + ' stars', onclick: (e) => {
      picked = n;
      [...e.target.parentNode.children].forEach((b, i) => b.classList.toggle('on', i < n));
    } }, '\u2605'));
  const err = el('div', { class: 'form-error', hidden: true });
  const commentBox = el('textarea', { rows: 3, placeholder: 'How was registering and your first visit? (optional)', maxlength: 600 });
  const writeForm = (ME && ME.role === 'patient') ? el('div', { style: 'margin-top:1rem' },
    el('h2', {}, 'Leave a review'),
    el('p', { class: 'muted', style: 'font-size:.9rem' }, 'Reviews are only accepted from patients who registered with this practice through DentaLink.'),
    err,
    el('div', { class: 'star-pick' }, ...starBtns),
    commentBox,
    el('button', { class: 'btn ghost small', style: 'margin-top:.6rem', onclick: async (e) => {
      try {
        await api('/clinics/' + c.id + '/reviews', { method: 'POST', body: { rating: picked, comment: commentBox.value } });
        toast('Thanks for your review!');
        pageClinic(String(c.id));
      } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    } }, 'Post review'),
  ) : el('p', { class: 'muted', style: 'margin-top:1rem' }, el('a', { href: '#/login' }, 'Log in'), ' to leave a review (patients who registered here only).');

  return el('div', { class: 'panel', style: 'margin-top:1.2rem' },
    el('h2', {}, `Patient reviews${reviews.length ? ' (' + reviews.length + ')' : ''}`),
    reviews.length === 0 ? el('p', { class: 'muted' }, 'No reviews yet \u2014 be the first once you\u2019ve registered.') :
      el('div', {}, ...reviews.map(r => el('div', { class: 'review' },
        el('div', {}, el('span', { class: 'stars' }, '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating)), '  ',
          el('span', { class: 'who' }, r.author_name), ' ', el('span', { class: 'when' }, '\u00B7 ' + r.created_at.slice(0, 10))),
        r.comment ? el('p', {}, r.comment) : null))),
    writeForm,
  );
}

/* ---------- auth pages ---------- */
function field(label, input, hint) {
  return el('div', { class: 'field' }, el('label', { for: input.id }, label, hint ? el('span', { class: 'hint' }, ' \u2014 ' + hint) : null), input);
}
function inp(id, attrs = {}) { return el('input', { id, name: id, ...attrs }); }

function pageSignup() {
  const err = el('div', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api('/auth/signup', { method: 'POST', body: {
        full_name: f.get('full_name'), email: f.get('email'), phone: f.get('phone'), password: f.get('password') } });
      ME = d.user; renderNav(); toast('Welcome to DentaLink!');
      location.hash = sessionStorage.getItem('afterAuth') || '#/clinics';
      sessionStorage.removeItem('afterAuth');
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  } },
    err,
    field('Full name', inp('full_name', { required: true, autocomplete: 'name', maxlength: 100 })),
    field('Email', inp('email', { type: 'email', required: true, autocomplete: 'email' })),
    field('UK mobile or landline', inp('phone', { type: 'tel', autocomplete: 'tel', placeholder: '07\u2026 or 0161\u2026' }), 'optional'),
    field('Password', inp('password', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' }), 'at least 10 characters with letters and numbers'),
    el('button', { class: 'btn primary' }, 'Create my account'),
    el('p', { class: 'muted' }, 'Already have an account? ', el('a', { href: '#/login' }, 'Log in')),
  );
  main.replaceChildren(el('h1', { class: 'page-title center' }, 'Create your account'),
    el('p', { class: 'muted center', style: 'text-align:center' }, 'One account lets you register with any practice on DentaLink and track your registrations.'),
    el('div', { class: 'card-page' }, form));
}

function pageLogin() {
  const err = el('div', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
      ME = d.user; renderNav(); toast('Logged in.');
      location.hash = sessionStorage.getItem('afterAuth')
        || (ME.role === 'admin' ? '#/admin' : ME.role === 'clinic' ? '#/clinic-dashboard' : '#/clinics');
      sessionStorage.removeItem('afterAuth');
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  } },
    err,
    field('Email', inp('email', { type: 'email', required: true, autocomplete: 'email' })),
    field('Password', inp('password', { type: 'password', required: true, autocomplete: 'current-password' })),
    el('button', { class: 'btn primary' }, 'Log in'),
    el('p', { class: 'muted' }, 'New here? ', el('a', { href: '#/signup' }, 'Create an account')),
  );
  main.replaceChildren(el('h1', { class: 'page-title center' }, 'Log in'), el('div', { class: 'card-page' }, form));
}

/* ---------- patient registration form ---------- */
function pageRegister(clinicId) {
  if (!ME) { sessionStorage.setItem('afterAuth', '#/register/' + clinicId); location.hash = '#/signup'; return; }
  if (ME.role !== 'patient') { main.replaceChildren(el('p', { class: 'form-error', style: 'margin-top:2rem' }, 'Only patient accounts can register with a practice.')); return; }

  api('/clinics/' + clinicId).then(({ clinic: c }) => {
    const err = el('div', { class: 'form-error', hidden: true });
    const submitBtn = el('button', { class: 'btn primary' }, 'Register with ' + c.name);
    const form = el('form', { class: 'stack', style: 'max-width:640px;margin:0 auto', onsubmit: async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      submitBtn.disabled = true;
      try {
        const body = Object.fromEntries(f.entries());
        body.clinic_id = c.id;
        body.consent = f.get('consent') === 'on';
        const d = await api('/registrations', { method: 'POST', body });
        main.replaceChildren(
          el('h1', { class: 'page-title' }, 'You\u2019re registered \u2714'),
          el('div', { class: 'card-page' },
            el('p', {}, d.next_step),
            el('a', { class: 'call-num', href: 'tel:' + c.phone.replace(/\s/g, '') }, c.phone),
            el('p', { class: 'muted' }, 'The practice has been notified and can see your details in their dashboard. You can track the status any time in ', el('a', { href: '#/my-registrations' }, 'My registrations'), '.'),
          ));
        window.scrollTo(0, 0);
      } catch (ex) { err.hidden = false; err.textContent = ex.message; submitBtn.disabled = false; window.scrollTo(0, 0); }
    } },
      err,
      el('fieldset', {}, el('legend', {}, 'Your details'),
        el('div', { class: 'stack' },
          field('Full name', inp('full_name', { required: true, value: ME.full_name || '', autocomplete: 'name' })),
          field('Date of birth', inp('dob', { type: 'date', required: true, autocomplete: 'bday' })),
          field('Home address', inp('address', { required: true, autocomplete: 'street-address' })),
          field('Postcode', inp('postcode', { required: true, autocomplete: 'postal-code', maxlength: 10 })),
          field('Phone', inp('phone', { type: 'tel', required: true, value: ME.phone || '', autocomplete: 'tel' })),
          field('Email', inp('email', { type: 'email', required: true, value: ME.email || '', autocomplete: 'email' })),
        )),
      el('fieldset', {}, el('legend', {}, 'Care you\u2019re looking for'),
        el('div', { class: 'stack' },
          field('NHS or private?', el('select', { id: 'patient_type', name: 'patient_type', required: true },
            el('option', { value: '' }, 'Choose\u2026'),
            el('option', { value: 'nhs' }, 'NHS'),
            el('option', { value: 'private' }, 'Private'),
            el('option', { value: 'either' }, 'Either / not sure'),
          )),
          field('NHS number', inp('nhs_number', { placeholder: '485 777 3456', maxlength: 12 }), 'optional \u2014 on any NHS letter or prescription'),
          field('NHS charge exemption', el('select', { id: 'exemption_status', name: 'exemption_status' },
            el('option', { value: '' }, 'None / not applicable'),
            ...['Under 18, or under 19 in full-time education', 'Pregnant or had a baby in the last 12 months (MatEx)',
              'Income Support / income-based JSA or ESA', 'Universal Credit (qualifying)', 'HC2 certificate (full help)',
              'HC3 certificate (partial help)'].map(v => el('option', { value: v }, v)),
          ), 'if any apply, NHS treatment may be free'),
          field('Your GP practice', inp('gp_practice', {}), 'optional'),
          field('When did you last see a dentist?', inp('last_dental_visit', { placeholder: 'e.g. about 2 years ago' }), 'optional'),
          field('Anything you\u2019d like the dentist to know?', el('textarea', { id: 'dental_concerns', name: 'dental_concerns', rows: 3, placeholder: 'Toothache, nervous patient, broken crown\u2026' }), 'optional'),
        )),
      el('fieldset', {}, el('legend', {}, 'Medical history'),
        el('div', { class: 'stack' },
          field('Medical conditions', el('textarea', { id: 'medical_conditions', name: 'medical_conditions', rows: 2, placeholder: 'e.g. diabetes, heart condition, epilepsy \u2014 or "none"' }), 'optional'),
          field('Current medications', el('textarea', { id: 'medications', name: 'medications', rows: 2 }), 'optional'),
          field('Allergies', inp('allergies', { placeholder: 'e.g. penicillin, latex' }), 'optional'),
          field('Emergency contact name', inp('emergency_contact_name', {}), 'optional'),
          field('Emergency contact phone', inp('emergency_contact_phone', { type: 'tel' }), 'optional'),
        )),
      el('label', { class: 'check' },
        el('input', { type: 'checkbox', name: 'consent', required: true }),
        el('span', {}, 'I consent to DentaLink sharing these details with ', el('strong', {}, c.name), ' so they can register me as a patient. I understand I need to ring the practice to book an appointment.')),
      submitBtn,
    );
    main.replaceChildren(
      el('h1', { class: 'page-title center' }, 'Register with ' + c.name),
      el('p', { class: 'muted', style: 'text-align:center;max-width:60ch;margin:0 auto 1rem' }, 'This is the same information the practice would ask for on their new-patient form. Fields marked optional can be left blank and completed at your first visit.'),
      form);
  }).catch(e => toast(e.message));
}

/* ---------- patient dashboard ---------- */
function pageMyRegistrations() {
  if (!ME) { location.hash = '#/login'; return; }
  api('/registrations/mine').then(d => {
    main.replaceChildren(
      el('h1', { class: 'page-title' }, 'My registrations'),
      d.registrations.length === 0
        ? el('div', { class: 'card-page' }, el('p', {}, 'You haven\u2019t registered with a practice yet.'), el('a', { class: 'btn primary', href: '#/clinics' }, 'Find a dentist'))
        : el('table', { class: 'data' },
            el('tr', {}, ...['Practice', 'Seeking', 'Status', 'Registered', 'Ring to book'].map(h => el('th', {}, h))),
            ...d.registrations.map(r => el('tr', {},
              el('td', {}, r.clinic_name),
              el('td', {}, r.patient_type.toUpperCase()),
              el('td', {}, el('span', { class: 'status ' + r.status }, r.status)),
              el('td', {}, r.created_at.slice(0, 10)),
              el('td', {}, el('a', { href: 'tel:' + r.clinic_phone.replace(/\s/g, '') }, r.clinic_phone)),
            ))),
    );
  }).catch(e => toast(e.message));
}

/* ---------- clinic dashboard ---------- */
function pageClinicDashboard() {
  if (!ME || ME.role !== 'clinic') { location.hash = '#/login'; return; }
  Promise.all([api('/clinic/registrations'), api('/clinic/stats')]).then(([d, s]) => {
    main.replaceChildren(
      el('h1', { class: 'page-title' }, 'Patient registrations \u2014 ' + ME.full_name),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', {}, String(s.views)), 'Profile views'),
        el('div', { class: 'stat' }, el('b', {}, String(s.registrations)), 'Patient registrations'),
        el('div', { class: 'stat' }, el('b', {}, String(s.accepted)), 'Accepted patients'),
        el('div', { class: 'stat' }, el('b', {}, s.rating ? s.rating + ' \u2605' : '\u2014'), 'Average rating'),
      ),
      el('p', { class: 'muted' }, 'New patients who registered with your practice through DentaLink. Update the status as you contact them.'),
      d.registrations.length === 0 ? el('p', {}, 'No registrations yet.') :
      el('div', { style: 'overflow-x:auto' }, el('table', { class: 'data' },
        el('tr', {}, ...['Patient', 'DOB', 'Contact', 'Seeking', 'Exemption', 'Medical flags', 'Received', 'Status'].map(h => el('th', {}, h))),
        ...d.registrations.map(r => el('tr', {},
          el('td', {}, el('strong', {}, r.full_name), el('br'), el('span', { class: 'muted' }, r.address + ', ' + r.postcode)),
          el('td', {}, r.dob),
          el('td', {}, r.phone, el('br'), r.email),
          el('td', {}, r.patient_type.toUpperCase()),
          el('td', {}, r.exemption_status || '\u2014'),
          el('td', {}, [r.medical_conditions, r.medications && 'meds', r.allergies && 'allergies'].filter(Boolean).join('; ') || '\u2014'),
          el('td', {}, r.created_at.slice(0, 10)),
          el('td', {}, el('select', { onchange: async (e) => {
            try { await api('/clinic/registrations/' + r.id, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated.'); }
            catch (ex) { toast(ex.message); }
          } }, ...['pending', 'contacted', 'accepted', 'declined'].map(s => el('option', { value: s, selected: r.status === s ? '' : null }, s)))),
        )))),
    );
  }).catch(e => toast(e.message));
}

/* ---------- admin ---------- */
function pageAdmin() {
  if (!ME || ME.role !== 'admin') { location.hash = '#/login'; return; }
  Promise.all([api('/admin/stats'), api('/admin/registrations'), api('/clinics'), api('/admin/leads')]).then(([s, regs, cl, lds]) => {
    const err = el('div', { class: 'form-error', hidden: true });
    const addForm = el('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      f.accepting_new = !!f.accepting_new;
      try { await api('/admin/clinics', { method: 'POST', body: f }); toast('Clinic added.'); pageAdmin(); }
      catch (ex) { err.hidden = false; err.textContent = ex.message; }
    } },
      err,
      field('Practice name', inp('name', { required: true })),
      field('Type', el('select', { id: 'type', name: 'type', required: true },
        el('option', { value: 'nhs' }, 'NHS'), el('option', { value: 'mixed' }, 'Mixed'), el('option', { value: 'private' }, 'Private'))),
      field('Address', inp('address', { required: true })),
      field('Area', inp('area', { required: true, placeholder: 'e.g. Salford' })),
      field('Postcode', inp('postcode', { required: true })),
      field('Phone', inp('phone', { required: true })),
      field('Email (for notifications)', inp('email', { type: 'email' })),
      field('Description', el('textarea', { id: 'description', name: 'description', rows: 2 })),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'accepting_new', checked: '' }), el('span', {}, 'Accepting new patients')),
      el('button', { class: 'btn primary' }, 'Add clinic'),
    );
    main.replaceChildren(
      el('h1', { class: 'page-title' }, 'Admin'),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', {}, String(s.clinics)), 'Live clinics'),
        el('div', { class: 'stat' }, el('b', {}, String(s.patients)), 'Patient accounts'),
        el('div', { class: 'stat' }, el('b', {}, String(s.registrations)), 'Registrations'),
        el('div', { class: 'stat' }, el('b', {}, String(s.pending)), 'Pending'),
        el('div', { class: 'stat' }, el('b', {}, String(s.new_leads)), 'New practice applications'),
      ),
      el('h2', { class: 'page-title', style: 'font-size:1.3rem' }, 'Practice applications'),
      lds.leads.length === 0 ? el('p', { class: 'muted' }, 'No applications yet \u2014 share the \u201CFor practices\u201D page with clinics.') :
      el('div', { style: 'overflow-x:auto' }, el('table', { class: 'data' },
        el('tr', {}, ...['Practice', 'Contact', 'Email / phone', 'Message', 'Date', 'Status'].map(h => el('th', {}, h))),
        ...lds.leads.map(L => el('tr', {},
          el('td', {}, el('strong', {}, L.practice_name)),
          el('td', {}, L.contact_name),
          el('td', {}, L.email, el('br'), L.phone || ''),
          el('td', {}, L.message || '\u2014'),
          el('td', {}, L.created_at.slice(0, 10)),
          el('td', {}, el('select', { onchange: async (e) => {
            try { await api('/admin/leads/' + L.id, { method: 'PATCH', body: { status: e.target.value } }); toast('Lead updated.'); }
            catch (ex) { toast(ex.message); }
          } }, ...['new', 'contacted', 'won', 'lost'].map(st => el('option', { value: st, selected: L.status === st ? '' : null }, st)))))))),
      el('h2', { class: 'page-title', style: 'font-size:1.3rem' }, 'Latest registrations'),
      el('div', { style: 'overflow-x:auto' }, el('table', { class: 'data' },
        el('tr', {}, ...['Patient', 'Clinic', 'Contact', 'Seeking', 'Status', 'Date'].map(h => el('th', {}, h))),
        ...regs.registrations.map(r => el('tr', {},
          el('td', {}, r.full_name), el('td', {}, r.clinic_name),
          el('td', {}, r.phone + ' \u00B7 ' + r.email),
          el('td', {}, r.patient_type.toUpperCase()),
          el('td', {}, el('span', { class: 'status ' + r.status }, r.status)),
          el('td', {}, r.created_at.slice(0, 10)))))),
      el('h2', { class: 'page-title', style: 'font-size:1.3rem' }, 'Add a paying clinic'),
      el('div', { class: 'card-page' }, addForm),
      el('h2', { class: 'page-title', style: 'font-size:1.3rem' }, 'Clinics \u2014 visibility, featured & verified'),
      el('div', { style: 'overflow-x:auto' }, el('table', { class: 'data' },
        el('tr', {}, ...['Clinic', 'Type', 'Accepting', 'Featured \u2726', 'Verified \u2713'].map(h => el('th', {}, h))),
        ...cl.clinics.map(c => {
          const flip = (key, val) => async () => {
            try { await api('/admin/clinics/' + c.id, { method: 'PATCH', body: { [key]: val } }); pageAdmin(); }
            catch (ex) { toast(ex.message); }
          };
          return el('tr', {},
            el('td', {}, c.name), el('td', {}, c.type.toUpperCase()),
            el('td', {}, el('button', { class: 'btn ghost small', onclick: flip('accepting_new', !c.accepting_new) }, c.accepting_new ? 'Yes' : 'No')),
            el('td', {}, el('button', { class: 'btn ghost small', onclick: flip('featured', !c.featured) }, c.featured ? '\u2726 Featured' : 'No')),
            el('td', {}, el('button', { class: 'btn ghost small', onclick: flip('verified', !c.verified) }, c.verified ? '\u2713 Verified' : 'No')));
        }))),
    );
  }).catch(e => toast(e.message));
}

function pageForPractices() {
  const err = el('div', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    try {
      const d = await api('/practice-leads', { method: 'POST', body: f });
      main.replaceChildren(
        el('h1', { class: 'page-title center' }, 'Application received \u2714'),
        el('div', { class: 'card-page' },
          el('p', {}, d.message),
          el('p', { class: 'muted' }, 'We\u2019ll review your practice details and get back to you about listing options and verification.')));
      window.scrollTo(0, 0);
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  } },
    err,
    field('Practice name', inp('practice_name', { required: true })),
    field('Your name', inp('contact_name', { required: true })),
    field('Work email', inp('email', { type: 'email', required: true })),
    field('Phone', inp('phone', { type: 'tel' }), 'optional'),
    field('Anything we should know?', el('textarea', { id: 'message', name: 'message', rows: 3, placeholder: 'e.g. NHS list status, areas you serve, when to call\u2026' }), 'optional'),
    el('button', { class: 'btn primary' }, 'Apply to get listed'),
  );
  main.replaceChildren(
    el('section', { class: 'fp-hero' },
      el('h1', {}, 'Fill your appointment book with ', el('span', { class: 'u' }, 'ready-to-register patients'), '.'),
      el('p', {}, 'DentaLink sends you patients who have already completed their new-patient form \u2014 personal details, medical history, exemption status \u2014 before they even ring you. No chasing paperwork, no wasted front-desk time.'),
    ),
    el('div', { class: 'fp-points' },
      el('div', { class: 'fp-point' }, el('b', {}, 'Pre-registered patients'), el('p', {}, 'Every enquiry arrives with a completed registration: contact details, DOB, medical history, NHS number and exemption status. Your reception team just books them in.')),
      el('div', { class: 'fp-point' }, el('b', {}, 'Your own dashboard'), el('p', {}, 'See every patient who registers, their details and status, plus how many people viewed your profile \u2014 so you can see exactly what the listing brings in.')),
      el('div', { class: 'fp-point' }, el('b', {}, 'Verified reviews only'), el('p', {}, 'Only patients who genuinely registered with your practice through DentaLink can review you \u2014 no anonymous review-bombing.')),
      el('div', { class: 'fp-point' }, el('b', {}, 'Email alerts'), el('p', {}, 'Get an email the moment a new patient registers, alongside the dashboard \u2014 nothing slips through.')),
    ),
    el('h2', { class: 'page-title center', style: 'font-size:1.5rem' }, 'Listing options'),
    el('div', { class: 'tiers' },
      el('div', { class: 'tier' },
        el('h3', {}, 'Standard'),
        el('p', { class: 'price' }, '\u00A329', el('small', {}, ' /month')),
        el('ul', {},
          el('li', {}, 'Full practice profile & services list'),
          el('li', {}, 'Unlimited patient registrations'),
          el('li', {}, 'Clinic dashboard & email alerts'),
          el('li', {}, 'Verified badge after our checks'))),
      el('div', { class: 'tier gold' },
        el('h3', {}, 'Featured \u2726'),
        el('p', { class: 'price' }, '\u00A369', el('small', {}, ' /month')),
        el('ul', {},
          el('li', {}, 'Everything in Standard'),
          el('li', {}, 'Pinned to the top of search results'),
          el('li', {}, 'Gold highlighted listing'),
          el('li', {}, 'Priority support'))),
    ),
    el('h2', { class: 'page-title center', style: 'font-size:1.5rem' }, 'Apply to get listed'),
    el('div', { class: 'card-page' }, form),
  );
}

function pageHow() {
  main.replaceChildren(
    el('h1', { class: 'page-title' }, 'How DentaLink works'),
    el('div', { class: 'card-page', style: 'max-width:720px' },
      el('p', {}, el('strong', {}, '1. Search.'), ' Every listed practice is colour-coded: blue for NHS, amber for mixed, plum for private \u2014 so you can see at a glance what you\u2019d pay.'),
      el('p', {}, el('strong', {}, '2. Register online.'), ' Create a free account and fill in the same new-patient form the practice would hand you at reception \u2014 your details go straight to the practice, securely.'),
      el('p', {}, el('strong', {}, '3. Ring to book.'), ' Booking is done by phone, directly with the practice. Their number is on every listing, with tap-to-call on mobile.'),
      el('p', { class: 'muted' }, 'NHS treatment can be free if you have an exemption (for example an HC2 certificate, maternity exemption, or qualifying benefits) \u2014 the registration form lets you record this.'),
    ));
}

/* ---------- router ---------- */
function route() {
  const hash = location.hash || '#/';
  const [path, query] = hash.slice(1).split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (parts.length === 0) return pageHome();
  switch (parts[0]) {
    case 'clinics': return pageClinics(params);
    case 'clinic': return pageClinic(parts[1]);
    case 'register': return pageRegister(parts[1]);
    case 'signup': return pageSignup();
    case 'login': return pageLogin();
    case 'my-registrations': return pageMyRegistrations();
    case 'clinic-dashboard': return pageClinicDashboard();
    case 'admin': return pageAdmin();
    case 'how-it-works': return pageHow();
    case 'for-practices': return pageForPractices();
    default: return pageHome();
  }
}

window.addEventListener('hashchange', route);

(async function init() {
  try { const d = await api('/auth/me'); ME = d.user; } catch {}
  renderNav();
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
