// Security middleware & validation helpers
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { q } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[security] JWT_SECRET not set — using a random secret (sessions reset on restart). Set JWT_SECRET in production.');
}
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'dl_session';

function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role, clinic_id: user.clinic_id || null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,           // JS on the page can never read the token (XSS protection)
    sameSite: 'strict',       // cookie never sent on cross-site requests (CSRF protection)
    secure: IS_PROD,          // HTTPS-only in production
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = q.get('SELECT id, email, role, full_name, phone, clinic_id FROM users WHERE id = ?', payload.sub);
    if (!user) return res.status(401).json({ error: 'Please log in.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// CSRF guard for state-changing requests: SameSite=strict cookies already block
// cross-site sends; this adds defence in depth by requiring a custom header
// that cross-site HTML forms cannot set.
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') {
    return res.status(403).json({ error: 'Request blocked.' });
  }
  next();
}

// ---------- validation ----------
const RX = {
  email: /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/,
  ukPhone: /^(\+44\s?|0)\d[\d\s]{8,12}$/,
  ukPostcode: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
  nhsNumber: /^\d{3}\s?\d{3}\s?\d{4}$/,
  isoDate: /^\d{4}-\d{2}-\d{2}$/,
};

function clean(v, max = 300) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function passwordProblems(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

module.exports = { issueSession, clearSession, requireAuth, requireRole, csrfGuard, RX, clean, passwordProblems };
