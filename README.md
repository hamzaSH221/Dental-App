# DentaLink Manchester

Find NHS, mixed and private dental practices across Greater Manchester. Patients search
the directory, register online with a practice (the same details a new-patient form asks
for), then ring the practice to book. Clinics pay to be listed, get email notifications
for every registration, and have their own dashboard to manage incoming patients.

## What's in this repo

```
server/    Node.js + Express API (auth, clinics, registrations, clinic dashboard, admin)
public/    The website (responsive, installable as a PWA)
mobile/    React Native (Expo) app for the App Store / Google Play — uses the same API
data/      SQLite database (created automatically on first run; git-ignored)
```

## Run it locally

Requires **Node.js 22 or newer** (uses Node's built-in SQLite — nothing to compile).

```bash
npm install
npm start
# open http://localhost:3000
```

On first run the database is created and seeded with:
- **Admin login:** `admin@dentalink.local` / `ChangeMe-Admin1!` (or set ADMIN_EMAIL / ADMIN_PASSWORD)
- **Demo clinic login:** `clinic@ancoatsdental.example` / `ClinicDemo-Pass1!`
- **8 fictional demo practices** — delete/replace these with real paying clinics via the Admin page.

Change both seeded passwords immediately.

## Roles

| Role    | Can do |
|---------|--------|
| patient | Search clinics, register with a practice, track registration status |
| clinic  | See registrations for *their* practice only, update status (pending → contacted → accepted/declined) |
| admin   | Add/edit clinics, toggle "accepting new patients", create clinic logins, see all registrations & stats |

## Security features (already built in)

- Passwords hashed with **bcrypt (12 rounds)** — never stored in plain text
- Sessions via **JWT in httpOnly, SameSite=Strict cookies** (JavaScript can't steal them; cross-site requests can't send them)
- **CSRF defence in depth**: SameSite cookies + required custom header on all state-changing requests
- **helmet** security headers incl. a strict **Content-Security-Policy** and `frame-ancestors 'none'` (no clickjacking)
- **Rate limiting**: 600 req/15 min globally, **10 attempts/15 min on login & signup** (blocks brute force)
- **Parameterised SQL everywhere** — SQL injection is not possible via inputs
- **Server-side validation** of every field (UK postcode, UK phone, NHS number format, DOB sanity, length caps)
- **Role-based access control** on every protected route; clinics can only ever see their own patients
- Login gives the same error whether the email exists or not (no account enumeration)
- **Audit log** table records signups, logins, failed logins, registrations, and admin actions with IP
- XSS-safe frontend: all rendering uses `textContent`, never `innerHTML` with user data
- Errors never leak internals; request bodies capped at 50 KB

### Before going live (do these!)

1. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`, your own `ADMIN_EMAIL`/`ADMIN_PASSWORD`, and SMTP details.
2. Serve over **HTTPS only** (any host below gives you this automatically). Cookies switch to `Secure` when `NODE_ENV=production`.
3. Delete the demo clinics and demo clinic account.
4. You are storing **health data (special category under UK GDPR)**: register with the **ICO** (£40–60/yr for small orgs), publish a privacy policy, and only share data with the practice the patient consented to. The consent checkbox and audit log in this app support that, but the legal registration is on you.
5. Back up `data/dentalink.db` regularly (it's a single file — easy to snapshot).

## Email notifications to clinics

Set the `SMTP_*` variables in `.env` (works with Resend, Mailgun, Brevo, or any SMTP provider).
Without SMTP, notifications are logged and stored in the `notifications` table so nothing is lost in development.

## Deploying the website

Any Node host works. Easiest options:

- **Railway / Render / Fly.io** — connect the GitHub repo, set env vars, add a persistent volume mounted where `DB_PATH` points, deploy. HTTPS and a domain included.
- **A £5 VPS** — `git clone`, `npm install`, run with `pm2 start server/server.js`, put Caddy or nginx in front for HTTPS.

## The mobile app (App Store & Google Play)

The `mobile/` folder is an Expo React Native app that talks to the same API.

1. **Point it at your live server:** edit `mobile/api.js` and set `API_URL` to your deployed HTTPS domain.
2. **Test on your phone (free, 10 minutes):**
   ```bash
   cd mobile && npm install && npx expo start
   ```
   Scan the QR code with the Expo Go app (App Store / Play Store).
3. **Build store binaries** with EAS (Expo's build service):
   ```bash
   npm install -g eas-cli
   eas login
   eas build --platform android   # produces an .aab for Google Play
   eas build --platform ios       # produces an .ipa for the App Store
   ```
4. **Store accounts you'll need:** Google Play Console (one-off ~US$25) and Apple Developer Program (~£79/year). Both stores will ask for a privacy policy URL — host one on your website. Because the app handles health information, fill in the data-safety / privacy-nutrition sections accurately.
5. Submit with `eas submit`, or upload manually in each console.

## Pushing this code to your GitHub repo

```bash
cd dentalink
git init
git add .
git commit -m "DentaLink Manchester — initial build"
git remote add origin https://github.com/hamzaSH221/Dental-App.git
git branch -M main
git push -u origin main
```

## API quick reference

```
POST  /api/auth/signup                 create patient account
POST  /api/auth/login                  log in (any role)
POST  /api/auth/logout
GET   /api/auth/me
GET   /api/clinics?type=&accepting=1&q=
GET   /api/clinics/:id
POST  /api/registrations               register with a clinic (patient)
GET   /api/registrations/mine          patient's registrations
GET   /api/clinic/registrations        clinic's incoming patients
PATCH /api/clinic/registrations/:id    update status
GET   /api/admin/stats | /api/admin/registrations
POST  /api/admin/clinics | PATCH /api/admin/clinics/:id
POST  /api/admin/clinic-accounts       create a clinic login
```
