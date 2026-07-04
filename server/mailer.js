// Email notifications to clinics. Configure SMTP via env vars; without them,
// emails are logged to console and stored in the notifications table so
// nothing is lost during development.
const nodemailer = require('nodemailer');
const { q } = require('./db');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  console.log('[mailer] SMTP configured:', process.env.SMTP_HOST);
} else {
  console.log('[mailer] No SMTP configured — notifications will be logged & stored, not sent.');
}

async function notifyClinicOfRegistration(reg, clinic) {
  const subject = `New patient registration — ${reg.full_name}`;
  const body = [
    `A new patient has registered with ${clinic.name} via DentaLink.`,
    '',
    `Name: ${reg.full_name}`,
    `Date of birth: ${reg.dob}`,
    `Phone: ${reg.phone}`,
    `Email: ${reg.email}`,
    `Postcode: ${reg.postcode}`,
    `Seeking: ${reg.patient_type.toUpperCase()} care`,
    reg.exemption_status ? `NHS exemption: ${reg.exemption_status}` : null,
    '',
    'Log in to your DentaLink clinic dashboard to view full details, including',
    'medical history, and to update the registration status.',
    '',
    'The patient has been told to ring you to book their first appointment.',
  ].filter(v => v !== null).join('\n');

  const row = q.run(
    'INSERT INTO notifications (registration_id, to_email, subject, body) VALUES (?,?,?,?)',
    reg.id, clinic.email || null, subject, body
  );

  if (transporter && clinic.email) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'no-reply@dentalink.example',
        to: clinic.email,
        subject, text: body,
      });
      q.run('UPDATE notifications SET sent = 1 WHERE id = ?', row.lastInsertRowid);
    } catch (e) {
      console.error('[mailer] send failed:', e.message);
    }
  } else {
    console.log(`[mailer] (dev) would email ${clinic.email || '(no clinic email)'}: ${subject}`);
  }
}


async function notifyAdminOfLead(lead) {
  // Practice applications go to the site owner. Override with LEADS_EMAIL on your host.
  const to = process.env.LEADS_EMAIL || process.env.ADMIN_EMAIL || 'hamza221hussain@gmail.com';
  const subject = `New practice application — ${lead.practice_name}`;
  const body = [
    'A dental practice has applied to be listed on DentaLink.',
    '',
    `Practice: ${lead.practice_name}`,
    `Contact: ${lead.contact_name}`,
    `Email: ${lead.email}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.message ? `Message: ${lead.message}` : null,
    '',
    'View and manage applications in your admin dashboard.',
  ].filter(v => v !== null).join('\n');
  const row = q.run('INSERT INTO notifications (to_email, subject, body) VALUES (?,?,?)', to, subject, body);
  if (transporter) {
    try {
      await transporter.sendMail({ from: process.env.SMTP_FROM || 'no-reply@dentalink.example', to, subject, text: body });
      q.run('UPDATE notifications SET sent = 1 WHERE id = ?', row.lastInsertRowid);
    } catch (e) { console.error('[mailer] send failed:', e.message); }
  } else {
    console.log(`[mailer] (dev) would email ${to}: ${subject}`);
  }
}

module.exports = { notifyClinicOfRegistration, notifyAdminOfLead };
