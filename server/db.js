// Database layer — uses node-sqlite3-wasm (pure JS, no compilation, works on any Node), all queries parameterised.
const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dentalink.db');
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const raw = new Database(DB_PATH);
raw.exec('PRAGMA foreign_keys = ON;');

// Thin compatibility layer so the rest of the app keeps calling db.exec / db.prepare(sql).get(...args)
const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => ({
    get: (...args) => raw.get(sql, args.length ? args : undefined) || undefined,
    all: (...args) => raw.all(sql, args.length ? args : undefined),
    run: (...args) => raw.run(sql, args.length ? args : undefined),
  }),
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','clinic','admin')),
  full_name TEXT NOT NULL,
  phone TEXT,
  clinic_id INTEGER REFERENCES clinics(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('nhs','mixed','private')),
  address TEXT NOT NULL,
  area TEXT NOT NULL,
  postcode TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  website TEXT,
  description TEXT,
  services TEXT,                -- comma-separated, e.g. "Check-ups, Whitening, Implants"
  photo_url TEXT,
  opening_hours TEXT,           -- JSON string
  accepting_new INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,   -- paid tier: pinned to top + gold styling
  verified INTEGER NOT NULL DEFAULT 0,   -- checked by DentaLink
  views INTEGER NOT NULL DEFAULT 0,      -- profile view counter for clinic stats
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','accepted','declined')),
  patient_type TEXT NOT NULL CHECK (patient_type IN ('nhs','private','either')),
  full_name TEXT NOT NULL,
  dob TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  nhs_number TEXT,
  exemption_status TEXT,
  gp_practice TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  medical_conditions TEXT,
  medications TEXT,
  allergies TEXT,
  dental_concerns TEXT,
  last_dental_visit TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, clinic_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, clinic_id)
);
CREATE TABLE IF NOT EXISTS practice_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER REFERENCES registrations(id),
  to_email TEXT,
  subject TEXT,
  body TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinics_type ON clinics(type);
CREATE INDEX IF NOT EXISTS idx_reg_clinic ON registrations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reg_user ON registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_clinic ON reviews(clinic_id);
`);

// Gentle migration for anyone upgrading an existing database file
for (const col of ['services TEXT', 'photo_url TEXT', 'featured INTEGER NOT NULL DEFAULT 0', 'verified INTEGER NOT NULL DEFAULT 0', 'views INTEGER NOT NULL DEFAULT 0']) {
  try { db.exec(`ALTER TABLE clinics ADD COLUMN ${col}`); } catch { /* already exists */ }
}

// ---------- helpers ----------
const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

function audit(userId, action, details, ip) {
  q.run('INSERT INTO audit_log (user_id, action, details, ip) VALUES (?,?,?,?)',
    userId || null, action, details ? String(details).slice(0, 500) : null, ip || null);
}

// ---------- seed ----------
function seed() {
  const hours = JSON.stringify({
    Mon: '9:00–17:30', Tue: '9:00–17:30', Wed: '9:00–17:30',
    Thu: '9:00–19:00', Fri: '9:00–17:00', Sat: '9:00–13:00', Sun: 'Closed'
  });

  if (!q.get('SELECT id FROM users WHERE role = ?', 'admin')) {
    const email = process.env.ADMIN_EMAIL || 'admin@dentalink.local';
    const pass = process.env.ADMIN_PASSWORD || 'ChangeMe-Admin1!';
    q.run('INSERT INTO users (email, password_hash, role, full_name) VALUES (?,?,?,?)',
      email, bcrypt.hashSync(pass, 12), 'admin', 'Site Admin');
    console.log(`[seed] Admin account created: ${email} (change the password immediately)`);
  }

  if (!q.get('SELECT id FROM clinics LIMIT 1')) {
    // NOTE: fictional demo practices for development. Replace with real, paying clinics.
    //        name, type, address, area, postcode, phone, email, description, accepting, featured, verified, services
    const demo = [
      ['Ancoats Dental House', 'nhs', '14 Blossom Street, Ancoats', 'Manchester City Centre', 'M4 5AB', '0161 555 0101', 'hello@ancoatsdental.example', 'NHS practice in the heart of Ancoats. Currently accepting new NHS patients including children.', 1, 1, 1, 'NHS check-ups, Children\u2019s dentistry, Fillings, Emergency slots'],
      ['Didsbury Smile Studio', 'private', '203 Wilmslow Road, Didsbury', 'South Manchester', 'M20 2YZ', '0161 555 0102', 'reception@didsburysmile.example', 'Private cosmetic and family dentistry. Same-week appointments, 0% finance plans available.', 1, 1, 1, 'Whitening, Invisalign, Veneers, Hygienist, Check-ups'],
      ['Salford Quays Dental Care', 'mixed', 'Unit 3, The Quays, Salford', 'Salford', 'M50 3AZ', '0161 555 0103', 'info@quaysdental.example', 'Mixed NHS and private practice. NHS list currently full — private and Denplan patients welcome.', 0, 0, 1, 'Check-ups, Crowns, Root canal, Denplan'],
      ['Stockport Family Dental', 'nhs', '88 Wellington Road South, Stockport', 'Stockport', 'SK1 3TA', '0161 555 0104', 'contact@stockportfamily.example', 'Long-established NHS family practice. Wheelchair accessible, ground-floor surgeries.', 1, 0, 1, 'NHS check-ups, Dentures, Fillings, Children\u2019s dentistry'],
      ['Bolton Bright Dental', 'mixed', '12 Chorley New Road, Bolton', 'Bolton', 'BL1 4AP', '01204 555 0105', 'smile@boltonbright.example', 'NHS and private care under one roof. Emergency slots held daily from 8am.', 1, 0, 0, 'Emergency care, Check-ups, Whitening, Hygienist'],
      ['Chorlton Green Dentistry', 'private', '45 Beech Road, Chorlton', 'South Manchester', 'M21 9EQ', '0161 555 0106', 'care@chorltongreen.example', 'Boutique private practice focused on nervous patients. Sedation available.', 1, 0, 1, 'Sedation dentistry, Check-ups, Cosmetic bonding, Hygienist'],
      ['Oldham Community Dental', 'nhs', '7 Union Street, Oldham', 'Oldham', 'OL1 1AA', '0161 555 0107', 'team@oldhamcommunity.example', 'NHS community practice. Free treatment for those with valid exemption (HC2, maternity, benefits).', 1, 0, 0, 'NHS check-ups, Exemption support, Fillings'],
      ['Bury Old Road Dental & Implant Clinic', 'private', '310 Bury Old Road, Prestwich', 'Bury & Prestwich', 'M25 1AA', '0161 555 0108', 'implants@buryoldroad.example', 'Private implant and restorative centre. Free initial consultation for new patients.', 1, 0, 1, 'Implants, Bridges, Crowns, Full-mouth restoration'],
    ];
    const ins = db.prepare(`INSERT INTO clinics
      (name, type, address, area, postcode, phone, email, description, accepting_new, featured, verified, services, opening_hours)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const c of demo) ins.run(...c, hours);
    console.log('[seed] 8 demo clinics inserted (fictional — replace with real listings).');

    // A few demo reviews so the star ratings render (fictional)
    const demoPatient = q.run('INSERT INTO users (email, password_hash, role, full_name) VALUES (?,?,?,?)',
      'demo.reviewer@example.com', bcrypt.hashSync('DemoReviewer-Pass1!', 12), 'patient', 'Demo Reviewer');
    const uid = demoPatient.lastInsertRowid;
    const rev = db.prepare('INSERT INTO reviews (user_id, clinic_id, rating, comment, author_name) VALUES (?,?,?,?,?)');
    rev.run(uid, 1, 5, 'Registered through DentaLink on Monday, seen on Thursday. Lovely staff.', 'Demo Reviewer');
    rev.run(uid, 2, 5, 'Really gentle with my daughter. Booking by phone was quick.', 'Demo Reviewer');
    rev.run(uid, 4, 4, 'Friendly NHS practice, slight wait for a first appointment but worth it.', 'Demo Reviewer');
    console.log('[seed] Demo reviews inserted (fictional).');
  }

  // Demo clinic dashboard login tied to clinic #1
  if (!q.get('SELECT id FROM users WHERE role = ?', 'clinic')) {
    q.run('INSERT INTO users (email, password_hash, role, full_name, clinic_id) VALUES (?,?,?,?,?)',
      'clinic@ancoatsdental.example', bcrypt.hashSync('ClinicDemo-Pass1!', 12), 'clinic', 'Ancoats Dental House', 1);
    console.log('[seed] Demo clinic login: clinic@ancoatsdental.example / ClinicDemo-Pass1!');
  }
}
seed();

module.exports = { db, q, audit };
