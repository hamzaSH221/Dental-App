// Shared API client for the mobile app.
// IMPORTANT: change API_URL to your deployed server's HTTPS address before release.
// For local testing with Expo Go, use your computer's LAN IP, e.g. http://192.168.1.20:3000
export const API_URL = 'https://dentalink.onrender.com'; // 2190 update to your real Render URL after deploying

export async function api(path, opts = {}) {
  const res = await fetch(API_URL + '/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include', // session cookie
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const COLORS = {
  paper: '#0A1220',
  card: '#111D31',
  soft: '#182741',
  ink: '#EDF2F9',
  inkSoft: '#98A7BD',
  teal: '#D9B36B',        // primary action (gold)
  tealBright: '#3BC9B4',  // links/accents (teal)
  gold: '#D9B36B',
  nhs: '#5AA7F0',
  mixed: '#E3A94F',
  private: '#B98BE8',
  line: '#22334F',
  danger: '#F08078',
  ok: '#53CE93',
};

export const TYPE_LABEL = { nhs: 'NHS', mixed: 'Mixed', private: 'Private' };
