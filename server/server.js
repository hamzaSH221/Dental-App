// DentaLink — API + static site server
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const path = require('path');

const { q, audit } = require('./db');
const { issueSession, clearSession, requireAuth, requireRole, csrfGuard, RX, clean, passwordProblems } = require('./security');
const { notifyClinicOfRegistration, notifyAdminOfLead } = require('./mailer');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---------- security headers ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
}));

// ---------- rate limiting ----------
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true, legacyHeaders: false,
});

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use('/api', csrfGuard);

const ip = (req) => req.ip;

// ============================================================ AUTH
app.post('/api/auth/signup', authLimiter, (req, res) => {
  const full_name = clean(req.body.full_name, 100);
  const email = clean(req.body.email, 254).toLowerCase();
  const phone = clean(req.body.phone, 20);
  const password = req.body.password;

  if (full_name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!RX.email.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (phone && !RX.ukPhone.test(phone)) return res.status(400).json({ error: 'Please enter a valid UK phone number.' });
  const pwErr = passwordProblems(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (q.get('SELECT id FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const r = q.run('INSERT INTO users (email, password_hash, full_name, phone) VALUES (?,?,?,?)',
    email, hash, full_name, phone || null);
  const user = q.get('SELECT id, email, role, full_name, phone, clinic_id FROM users WHERE id = ?', r.lastInsertRowid);
  audit(user.id, 'signup', email, ip(req));
  issueSession(res, user);
  res.status(201).json({ user });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = q.get('SELECT * FROM users WHERE email = ?', email);
  // Constant-shape response: never reveal whether the email exists.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit(user ? user.id : null, 'login_failed', email, ip(req));
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  audit(user.id, 'login', null, ip(req));
  issueSession(res, user);
  const { password_hash, ...safe } = user;
  res.json({ user: safe });
});

app.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

// ============================================================ CLINICS (public)
app.get('/api/clinics', (req, res) => {
  const type = ['nhs', 'mixed', 'private'].includes(req.query.type) ? req.query.type : null;
  const accepting = req.query.accepting === '1' ? 1 : null;
  const search = clean(req.query.q, 80);

  let sql = `SELECT c.id, c.name, c.type, c.address, c.area, c.postcode, c.phone, c.description,
      c.services, c.photo_url, c.accepting_new, c.featured, c.verified, c.opening_hours,
      ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS review_count
    FROM clinics c LEFT JOIN reviews r ON r.clinic_id = c.id
    WHERE c.is_active = 1`;
  const params = [];
  if (type) { sql += ' AND c.type = ?'; params.push(type); }
  if (accepting) { sql += ' AND c.accepting_new = 1'; }
  if (search) {
    sql += ' AND (c.name LIKE ? OR c.area LIKE ? OR c.postcode LIKE ? OR c.address LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += ' GROUP BY c.id ORDER BY c.featured DESC, c.accepting_new DESC, rating DESC, c.name ASC';
  res.json({ clinics: q.all(sql, ...params) });
});

app.get('/api/clinics/:id', (req, res) => {
  const id = Number(req.params.id) || 0;
  const clinic = q.get(`SELECT c.id, c.name, c.type, c.address, c.area, c.postcode, c.phone, c.email, c.website,
      c.description, c.services, c.photo_url, c.accepting_new, c.featured, c.verified, c.opening_hours,
      ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS review_count
    FROM clinics c LEFT JOIN reviews r ON r.clinic_id = c.id
    WHERE c.id = ? AND c.is_active = 1 GROUP BY c.id`, id);
  if (!clinic || !clinic.id) return res.status(404).json({ error: 'Clinic not found.' });
  q.run('UPDATE clinics SET views = views + 1 WHERE id = ?', id); // stats for the clinic dashboard
  const reviews = q.all('SELECT rating, comment, author_name, created_at FROM reviews WHERE clinic_id = ? ORDER BY created_at DESC LIMIT 25', id);
  res.json({ clinic, reviews });
});

// Patient posts a review — only allowed if they actually registered with this clinic
app.post('/api/clinics/:id/reviews', requireAuth, requireRole('patient'), (req, res) => {
  const clinicId = Number(req.params.id) || 0;
  if (!q.get('SELECT id FROM clinics WHERE id = ? AND is_active = 1', clinicId)) return res.status(404).json({ error: 'Clinic not found.' });
  if (!q.get('SELECT id FROM registrations WHERE user_id = ? AND clinic_id = ?', req.user.id, clinicId)) {
    return res.status(403).json({ error: 'Only patients who have registered with this practice can review it.' });
  }
  if (q.get('SELECT id FROM reviews WHERE user_id = ? AND clinic_id = ?', req.user.id, clinicId)) {
    return res.status(409).json({ error: 'You have already reviewed this practice.' });
  }
  const rating = Number(req.body.rating);
  const comment = clean(req.body.comment, 600);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a rating from 1 to 5 stars.' });
  q.run('INSERT INTO reviews (user_id, clinic_id, rating, comment, author_name) VALUES (?,?,?,?,?)',
    req.user.id, clinicId, rating, comment || null, req.user.full_name.split(' ')[0]);
  audit(req.user.id, 'review_created', `clinic ${clinicId}: ${rating}★`, ip(req));
  res.status(201).json({ ok: true });
});

// Practices apply to be listed — goes to admin dashboard + email
const leadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many submissions. Please try again later.' }, standardHeaders: true, legacyHeaders: false });
app.post('/api/practice-leads', leadLimiter, async (req, res) => {
  const f = {
    practice_name: clean(req.body.practice_name, 120),
    contact_name: clean(req.body.contact_name, 100),
    email: clean(req.body.email, 254).toLowerCase(),
    phone: clean(req.body.phone, 20),
    message: clean(req.body.message, 1000),
  };
  if (f.practice_name.length < 2) return res.status(400).json({ error: 'Please enter your practice name.' });
  if (f.contact_name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!RX.email.test(f.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (f.phone && !RX.ukPhone.test(f.phone)) return res.status(400).json({ error: 'Please enter a valid UK phone number.' });
  q.run('INSERT INTO practice_leads (practice_name, contact_name, email, phone, message) VALUES (?,?,?,?,?)',
    f.practice_name, f.contact_name, f.email, f.phone || null, f.message || null);
  await notifyAdminOfLead(f);
  audit(null, 'practice_lead', f.practice_name, ip(req));
  res.status(201).json({ ok: true, message: 'Thanks — we\u2019ll be in touch within one working day.' });
});

// ============================================================ REGISTRATIONS (patients)
app.post('/api/registrations', requireAuth, requireRole('patient'), async (req, res) => {
  const b = req.body || {};
  const clinic = q.get('SELECT * FROM clinics WHERE id = ? AND is_active = 1', Number(b.clinic_id) || 0);
  if (!clinic) return res.status(404).json({ error: 'Clinic not found.' });

  const f = {
    full_name: clean(b.full_name, 100),
    dob: clean(b.dob, 10),
    address: clean(b.address, 200),
    postcode: clean(b.postcode, 10).toUpperCase(),
    phone: clean(b.phone, 20),
    email: clean(b.email, 254).toLowerCase(),
    nhs_number: clean(b.nhs_number, 12),
    exemption_status: clean(b.exemption_status, 100),
    gp_practice: clean(b.gp_practice, 150),
    emergency_contact_name: clean(b.emergency_contact_name, 100),
    emergency_contact_phone: clean(b.emergency_contact_phone, 20),
    medical_conditions: clean(b.medical_conditions, 1000),
    medications: clean(b.medications, 1000),
    allergies: clean(b.allergies, 500),
    dental_concerns: clean(b.dental_concerns, 1000),
    last_dental_visit: clean(b.last_dental_visit, 50),
    patient_type: ['nhs', 'private', 'either'].includes(b.patient_type) ? b.patient_type : null,
  };

  if (f.full_name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!RX.isoDate.test(f.dob)) return res.status(400).json({ error: 'Please enter your date of birth.' });
  const age = (Date.now() - new Date(f.dob).getTime()) / 3.15576e10;
  if (!(age >= 0 && age < 130)) return res.status(400).json({ error: 'Please check your date of birth.' });
  if (f.address.length < 5) return res.status(400).json({ error: 'Please enter your home address.' });
  if (!RX.ukPostcode.test(f.postcode)) return res.status(400).json({ error: 'Please enter a valid UK postcode.' });
  if (!RX.ukPhone.test(f.phone)) return res.status(400).json({ error: 'Please enter a valid UK phone number.' });
  if (!RX.email.test(f.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (f.nhs_number && !RX.nhsNumber.test(f.nhs_number)) return res.status(400).json({ error: 'An NHS number is 10 digits (e.g. 485 777 3456).' });
  if (!f.patient_type) return res.status(400).json({ error: 'Please choose NHS, private, or either.' });
  if (b.consent !== true) return res.status(400).json({ error: 'Please tick the consent box so we can share your details with the practice.' });

  if (q.get('SELECT id FROM registrations WHERE user_id = ? AND clinic_id = ?', req.user.id, clinic.id)) {
    return res.status(409).json({ error: 'You have already registered with this practice.' });
  }

  const r = q.run(`INSERT INTO registrations
    (user_id, clinic_id, patient_type, full_name, dob, address, postcode, phone, email,
     nhs_number, exemption_status, gp_practice, emergency_contact_name, emergency_contact_phone,
     medical_conditions, medications, allergies, dental_concerns, last_dental_visit, consent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    req.user.id, clinic.id, f.patient_type, f.full_name, f.dob, f.address, f.postcode, f.phone, f.email,
    f.nhs_number || null, f.exemption_status || null, f.gp_practice || null,
    f.emergency_contact_name || null, f.emergency_contact_phone || null,
    f.medical_conditions || null, f.medications || null, f.allergies || null,
    f.dental_concerns || null, f.last_dental_visit || null);

  const reg = q.get('SELECT * FROM registrations WHERE id = ?', r.lastInsertRowid);
  audit(req.user.id, 'registration_created', `clinic ${clinic.id}`, ip(req));
  await notifyClinicOfRegistration(reg, clinic);

  res.status(201).json({
    registration: { id: reg.id, clinic_id: clinic.id, status: reg.status, created_at: reg.created_at },
    next_step: `You're registered with ${clinic.name}. Ring them on ${clinic.phone} to book your first appointment.`,
  });
});

app.get('/api/registrations/mine', requireAuth, requireRole('patient'), (req, res) => {
  const rows = q.all(`SELECT r.id, r.status, r.patient_type, r.created_at,
      c.name AS clinic_name, c.phone AS clinic_phone, c.type AS clinic_type, c.area
    FROM registrations r JOIN clinics c ON c.id = r.clinic_id
    WHERE r.user_id = ? ORDER BY r.created_at DESC`, req.user.id);
  res.json({ registrations: rows });
});

// ============================================================ CLINIC DASHBOARD
app.get('/api/clinic/stats', requireAuth, requireRole('clinic'), (req, res) => {
  const c = q.get('SELECT views, name FROM clinics WHERE id = ?', req.user.clinic_id) || { views: 0 };
  res.json({
    views: c.views,
    registrations: q.get('SELECT COUNT(*) n FROM registrations WHERE clinic_id = ?', req.user.clinic_id).n,
    accepted: q.get("SELECT COUNT(*) n FROM registrations WHERE clinic_id = ? AND status = 'accepted'", req.user.clinic_id).n,
    rating: (q.get('SELECT ROUND(AVG(rating),1) r FROM reviews WHERE clinic_id = ?', req.user.clinic_id) || {}).r || null,
  });
});

app.get('/api/clinic/registrations', requireAuth, requireRole('clinic'), (req, res) => {
  const rows = q.all('SELECT * FROM registrations WHERE clinic_id = ? ORDER BY created_at DESC', req.user.clinic_id);
  res.json({ registrations: rows });
});

app.patch('/api/clinic/registrations/:id', requireAuth, requireRole('clinic'), (req, res) => {
  const status = req.body.status;
  if (!['pending', 'contacted', 'accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const reg = q.get('SELECT id FROM registrations WHERE id = ? AND clinic_id = ?', Number(req.params.id) || 0, req.user.clinic_id);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });
  q.run("UPDATE registrations SET status = ?, updated_at = datetime('now') WHERE id = ?", status, reg.id);
  audit(req.user.id, 'registration_status', `${reg.id} -> ${status}`, ip(req));
  res.json({ ok: true });
});

// ============================================================ ADMIN
app.use('/api/admin', requireAuth, requireRole('admin'));

app.get('/api/admin/stats', (req, res) => {
  res.json({
    clinics: q.get('SELECT COUNT(*) n FROM clinics WHERE is_active = 1').n,
    patients: q.get("SELECT COUNT(*) n FROM users WHERE role = 'patient'").n,
    registrations: q.get('SELECT COUNT(*) n FROM registrations').n,
    pending: q.get("SELECT COUNT(*) n FROM registrations WHERE status = 'pending'").n,
    new_leads: q.get("SELECT COUNT(*) n FROM practice_leads WHERE status = 'new'").n,
  });
});

app.get('/api/admin/leads', (req, res) => {
  res.json({ leads: q.all('SELECT * FROM practice_leads ORDER BY created_at DESC LIMIT 200') });
});

app.patch('/api/admin/leads/:id', (req, res) => {
  const status = req.body.status;
  if (!['new', 'contacted', 'won', 'lost'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  q.run('UPDATE practice_leads SET status = ? WHERE id = ?', status, Number(req.params.id) || 0);
  res.json({ ok: true });
});

app.get('/api/admin/registrations', (req, res) => {
  res.json({ registrations: q.all(`SELECT r.id, r.full_name, r.phone, r.email, r.status, r.patient_type, r.created_at, c.name AS clinic_name
    FROM registrations r JOIN clinics c ON c.id = r.clinic_id ORDER BY r.created_at DESC LIMIT 500`) });
});

app.post('/api/admin/clinics', (req, res) => {
  const b = req.body || {};
  const f = {
    name: clean(b.name, 120), type: ['nhs', 'mixed', 'private'].includes(b.type) ? b.type : null,
    address: clean(b.address, 200), area: clean(b.area, 80), postcode: clean(b.postcode, 10).toUpperCase(),
    phone: clean(b.phone, 20), email: clean(b.email, 254), website: clean(b.website, 200),
    description: clean(b.description, 1000), accepting_new: b.accepting_new ? 1 : 0,
  };
  if (f.name.length < 2 || !f.type || f.address.length < 5 || !f.area) return res.status(400).json({ error: 'Name, type, address and area are required.' });
  if (!RX.ukPostcode.test(f.postcode)) return res.status(400).json({ error: 'Enter a valid UK postcode.' });
  if (!RX.ukPhone.test(f.phone)) return res.status(400).json({ error: 'Enter a valid UK phone number.' });
  if (f.email && !RX.email.test(f.email)) return res.status(400).json({ error: 'Enter a valid email.' });
  const r = q.run(`INSERT INTO clinics (name, type, address, area, postcode, phone, email, website, description, accepting_new)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    f.name, f.type, f.address, f.area, f.postcode, f.phone, f.email || null, f.website || null, f.description || null, f.accepting_new);
  audit(req.user.id, 'clinic_created', f.name, ip(req));
  res.status(201).json({ id: r.lastInsertRowid });
});

app.patch('/api/admin/clinics/:id', (req, res) => {
  const clinic = q.get('SELECT * FROM clinics WHERE id = ?', Number(req.params.id) || 0);
  if (!clinic) return res.status(404).json({ error: 'Clinic not found.' });
  const allowed = ['name', 'type', 'address', 'area', 'postcode', 'phone', 'email', 'website', 'description', 'services', 'photo_url', 'accepting_new', 'is_active', 'featured', 'verified'];
  for (const k of allowed) {
    if (k in req.body) {
      const v = ['accepting_new', 'is_active', 'featured', 'verified'].includes(k) ? (req.body[k] ? 1 : 0) : clean(req.body[k], 1000);
      q.run(`UPDATE clinics SET ${k} = ? WHERE id = ?`, v, clinic.id); // k is from whitelist above
    }
  }
  audit(req.user.id, 'clinic_updated', String(clinic.id), ip(req));
  res.json({ ok: true });
});

// Create a login for a clinic so they can see their registrations
app.post('/api/admin/clinic-accounts', (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const clinic_id = Number(req.body.clinic_id) || 0;
  const password = req.body.password;
  if (!RX.email.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!q.get('SELECT id FROM clinics WHERE id = ?', clinic_id)) return res.status(404).json({ error: 'Clinic not found.' });
  const pwErr = passwordProblems(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (q.get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Email already in use.' });
  const clinic = q.get('SELECT name FROM clinics WHERE id = ?', clinic_id);
  q.run('INSERT INTO users (email, password_hash, role, full_name, clinic_id) VALUES (?,?,?,?,?)',
    email, bcrypt.hashSync(password, 12), 'clinic', clinic.name, clinic_id);
  audit(req.user.id, 'clinic_account_created', email, ip(req));
  res.status(201).json({ ok: true });
});

// ============================================================ STATIC SITE
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// error handler — never leak internals
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DentaLink running on http://localhost:${PORT}`));
