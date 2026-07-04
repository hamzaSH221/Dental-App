// Comprehensive test harness — starts the server, hits every endpoint, checks every rule.
const { spawn } = require('child_process');
const http = require('http');

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); }
}

function req(method, path, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
    if (cookie) headers.Cookie = cookie;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(BASE + path, { method, headers }, (resp) => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        let json = null; try { json = JSON.parse(d); } catch {}
        resolve({ code: resp.statusCode, body: d, json, setCookie: resp.headers['set-cookie'], headers: resp.headers });
      });
    });
    r.on('error', e => resolve({ code: 'ERR', body: e.message }));
    if (data) r.write(data);
    r.end();
  });
}
const cookieFrom = (res) => res.setCookie ? res.setCookie.map(c => c.split(';')[0]).join('; ') : '';

async function run() {
  // ---------- PUBLIC ----------
  let r = await req('GET', '/');
  check('homepage serves HTML', r.code === 200 && r.body.includes('<title'), 'code ' + r.code);
  check('CSP header present', !!r.headers['content-security-policy']);
  check('x-powered-by hidden', !r.headers['x-powered-by']);

  r = await req('GET', '/api/clinics');
  check('clinics list 200', r.code === 200);
  check('clinics returns array', Array.isArray(r.json?.clinics));
  check('featured clinic sorted first', r.json?.clinics?.[0]?.featured === 1, 'first=' + r.json?.clinics?.[0]?.name);
  check('clinics include rating field', 'rating' in (r.json?.clinics?.[0] || {}));

  r = await req('GET', '/api/clinics?type=nhs');
  check('filter by type=nhs works', r.json?.clinics?.every(c => c.type === 'nhs'));
  r = await req('GET', '/api/clinics?accepting=1');
  check('filter accepting=1 works', r.json?.clinics?.every(c => c.accepting_new === 1));
  r = await req('GET', '/api/clinics?q=didsbury');
  check('search by area works', r.json?.clinics?.some(c => /didsbury/i.test(c.area + c.name)));
  r = await req('GET', "/api/clinics?q=' OR 1=1--");
  check('SQL injection in search is safe', r.code === 200 && Array.isArray(r.json?.clinics));

  r = await req('GET', '/api/clinics/1');
  check('clinic detail 200', r.code === 200);
  check('clinic detail has reviews array', Array.isArray(r.json?.reviews));
  r = await req('GET', '/api/clinics/99999');
  check('missing clinic -> 404 not crash', r.code === 404);
  r = await req('GET', '/api/clinics/abc');
  check('non-numeric clinic id -> 404', r.code === 404);

  // ---------- AUTH ----------
  r = await req('POST', '/api/auth/signup', { full_name: 'A', email: 'bad', password: 'short' });
  check('signup rejects bad email', r.code === 400);
  r = await req('POST', '/api/auth/signup', { full_name: 'Valid User', email: 'valid@test.com', password: 'abc' });
  check('signup rejects weak password', r.code === 400);
  r = await req('POST', '/api/auth/signup', { full_name: 'Valid User', email: 'valid@test.com', password: 'GoodPass123' });
  check('signup succeeds', r.code === 201, 'code ' + r.code + ' ' + r.body);
  const patientCookie = cookieFrom(r);
  check('signup sets httpOnly cookie', r.setCookie?.[0]?.includes('HttpOnly'));
  check('signup cookie is SameSite=Strict', r.setCookie?.[0]?.includes('SameSite=Strict'));
  r = await req('POST', '/api/auth/signup', { full_name: 'Dup', email: 'valid@test.com', password: 'GoodPass123' });
  check('duplicate email rejected', r.code === 409);

  r = await req('POST', '/api/auth/login', { email: 'valid@test.com', password: 'wrong' });
  check('login wrong password -> 401', r.code === 401);
  r = await req('POST', '/api/auth/login', { email: 'nobody@test.com', password: 'whatever' });
  check('login unknown email -> 401 (no enumeration)', r.code === 401);
  r = await req('POST', '/api/auth/login', { email: 'valid@test.com', password: 'GoodPass123' });
  check('login success', r.code === 200);

  r = await req('GET', '/api/auth/me', null, patientCookie);
  check('auth/me returns user when logged in', r.code === 200 && r.json?.user?.email === 'valid@test.com');
  r = await req('GET', '/api/auth/me');
  check('auth/me 401 when logged out', r.code === 401);

  // ---------- CSRF ----------
  r = await new Promise((resolve) => {
    const data = JSON.stringify({ clinic_id: 1 });
    const rq = http.request(BASE + '/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: patientCookie, 'Content-Length': Buffer.byteLength(data) } }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve({ code: resp.statusCode }));
    });
    rq.write(data); rq.end();
  });
  check('CSRF: request without X-Requested-With blocked', r.code === 403, 'code ' + r.code);

  // ---------- REGISTRATION ----------
  r = await req('POST', '/api/registrations', { clinic_id: 1 }, patientCookie);
  check('registration missing fields -> 400', r.code === 400);
  r = await req('POST', '/api/registrations', { clinic_id: 1, full_name: 'Valid User', dob: '1990-05-05', address: '1 Test Street', postcode: 'BADPOST', phone: '07700900123', email: 'valid@test.com', patient_type: 'nhs', consent: true }, patientCookie);
  check('registration bad postcode -> 400', r.code === 400);
  r = await req('POST', '/api/registrations', { clinic_id: 1, full_name: 'Valid User', dob: '1990-05-05', address: '1 Test Street', postcode: 'M4 5AB', phone: '07700900123', email: 'valid@test.com', patient_type: 'nhs', consent: false }, patientCookie);
  check('registration without consent -> 400', r.code === 400);
  r = await req('POST', '/api/registrations', { clinic_id: 1, full_name: 'Valid User', dob: '1990-05-05', address: '1 Test Street', postcode: 'M4 5AB', phone: '07700900123', email: 'valid@test.com', patient_type: 'nhs', consent: true }, patientCookie);
  check('valid registration succeeds', r.code === 201, 'code ' + r.code + ' ' + r.body);
  r = await req('POST', '/api/registrations', { clinic_id: 1, full_name: 'Valid User', dob: '1990-05-05', address: '1 Test Street', postcode: 'M4 5AB', phone: '07700900123', email: 'valid@test.com', patient_type: 'nhs', consent: true }, patientCookie);
  check('duplicate registration -> 409', r.code === 409);
  r = await req('GET', '/api/registrations/mine', null, patientCookie);
  check('patient sees their registrations', r.code === 200 && r.json?.registrations?.length >= 1);

  // ---------- REVIEWS ----------
  r = await req('POST', '/api/clinics/1/reviews', { rating: 5, comment: 'ok' }, patientCookie);
  check('review after registering succeeds', r.code === 201, 'code ' + r.code);
  r = await req('POST', '/api/clinics/1/reviews', { rating: 5, comment: 'again' }, patientCookie);
  check('duplicate review -> 409', r.code === 409);
  r = await req('POST', '/api/clinics/2/reviews', { rating: 5, comment: 'not registered here' }, patientCookie);
  check('review without registration -> 403', r.code === 403);
  r = await req('POST', '/api/clinics/1/reviews', { rating: 9, comment: 'x' }, patientCookie);
  check('review invalid rating rejected', r.code !== 201);

  // ---------- PRACTICE LEADS ----------
  r = await req('POST', '/api/practice-leads', { practice_name: 'Test Practice', contact_name: 'Dr Test', email: 'dr@test.com', phone: '01614960000', message: 'Featured please' });
  check('practice lead submission succeeds', r.code === 201, 'code ' + r.code);
  r = await req('POST', '/api/practice-leads', { practice_name: '', contact_name: '', email: 'bad' });
  check('practice lead bad data -> 400', r.code === 400);

  // ---------- ROLE ENFORCEMENT ----------
  r = await req('GET', '/api/admin/stats', null, patientCookie);
  check('patient blocked from admin -> 403', r.code === 403);
  r = await req('GET', '/api/clinic/registrations', null, patientCookie);
  check('patient blocked from clinic dash -> 403', r.code === 403);

  // clinic login
  r = await req('POST', '/api/auth/login', { email: 'clinic@ancoatsdental.example', password: 'ClinicDemo-Pass1!' });
  const clinicCookie = cookieFrom(r);
  check('clinic login works', r.code === 200);
  r = await req('GET', '/api/clinic/registrations', null, clinicCookie);
  check('clinic sees own registrations', r.code === 200 && Array.isArray(r.json?.registrations));
  r = await req('GET', '/api/clinic/stats', null, clinicCookie);
  check('clinic stats endpoint works', r.code === 200 && 'views' in (r.json || {}));

  // admin login
  r = await req('POST', '/api/auth/login', { email: 'admin@dentalink.local', password: 'ChangeMe-Admin1!' });
  const adminCookie = cookieFrom(r);
  check('admin login works', r.code === 200);
  r = await req('GET', '/api/admin/stats', null, adminCookie);
  check('admin stats works', r.code === 200 && 'clinics' in (r.json || {}));
  r = await req('GET', '/api/admin/leads', null, adminCookie);
  check('admin sees practice leads', r.code === 200 && r.json?.leads?.some(l => l.practice_name === 'Test Practice'));
  r = await req('POST', '/api/admin/clinics', { name: 'New Clinic', type: 'nhs', address: '5 New Road', area: 'Testville', postcode: 'M1 1AA', phone: '01610000000' }, adminCookie);
  check('admin can add clinic', r.code === 201, 'code ' + r.code + ' ' + r.body);
  const newClinicId = r.json?.id;
  r = await req('PATCH', '/api/admin/clinics/' + newClinicId, { featured: true }, adminCookie);
  check('admin can set featured', r.code === 200);
  r = await req('GET', '/api/admin/clinics', null, patientCookie);
  check('non-admin cannot list admin clinics', r.code === 403);

  // ---------- rate limiting sanity (login limiter = 10/15min) ----------
  let blocked = false;
  for (let i = 0; i < 14; i++) {
    const rr = await req('POST', '/api/auth/login', { email: 'ratelimit@test.com', password: 'x' });
    if (rr.code === 429) { blocked = true; break; }
  }
  check('login rate limiting triggers', blocked);

  // ---------- SUMMARY ----------
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  else console.log('✓ ALL TESTS PASSED');
  console.log('='.repeat(50));
}

const srv = spawn('node', ['server/server.js'], { cwd: '/home/claude/dentalink' });
let booted = false;
srv.stdout.on('data', d => { if (String(d).includes('DentaLink running')) booted = true; });
srv.stderr.on('data', () => {});
const waitBoot = setInterval(async () => {
  if (booted) {
    clearInterval(waitBoot);
    try { await run(); } catch (e) { console.log('HARNESS ERROR:', e.message); }
    srv.kill();
    process.exit(fail > 0 ? 1 : 0);
  }
}, 300);
setTimeout(() => { if (!booted) { console.log('SERVER DID NOT BOOT'); srv.kill(); process.exit(1); } }, 8000);
