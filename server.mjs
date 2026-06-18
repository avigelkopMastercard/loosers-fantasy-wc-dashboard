import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiGet, buildDashboard, SEASON_ID } from './netlify/functions/_shared/sport5.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stateless local dev server — mirrors the Netlify Functions.
// Cookie is sent per-request via X-Cookie-Value header (the client stores it in localStorage).

function getCookie(req) {
  return req.header('X-Cookie-Value') || req.header('x-cookie-value') || null;
}

app.use(express.static(path.join(__dirname, 'public')));

// POST /api/validate-cookie — body: { cookie }, returns { success } or 401 { error }
app.post('/api/validate-cookie', async (req, res) => {
  const cookie = (req.body?.cookie || '').trim();
  if (!cookie || cookie.length < 50) {
    return res.status(400).json({ error: 'Invalid cookie format' });
  }
  try {
    await apiGet(cookie, 'Leagues/Get', { seasonId: SEASON_ID });
    res.json({ success: true });
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    res.status(401).json({
      error: isAuth ? 'Cookie is invalid or expired' : err.message,
    });
  }
});

// GET /api/leagues — reads cookie from header, returns { leagues }
app.get('/api/leagues', async (req, res) => {
  const cookie = getCookie(req);
  if (!cookie) return res.status(401).json({ error: 'No cookie provided (missing X-Cookie-Value header)' });

  try {
    const resp = await apiGet(cookie, 'CustomLeagues/GetUserLeagues', { seasonId: SEASON_ID });
    const leagues = (resp.data || []).map(l => ({
      id: l.id,
      name: l.name,
      memberCount: l.teamsCount,
    }));
    res.json({ leagues });
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    res.status(isAuth ? 401 : 500).json({ error: err.message });
  }
});

// GET /api/dashboard?leagueId=N — reads cookie from header, returns dashboard data
app.get('/api/dashboard', async (req, res) => {
  const cookie = getCookie(req);
  if (!cookie) {
    return res.status(401).json({ error: 'No cookie provided', cookieStatus: 'missing' });
  }
  const leagueId = req.query.leagueId;
  if (!leagueId) {
    return res.status(400).json({
      error: 'No league selected (missing leagueId query param)',
      cookieStatus: 'ok',
      leagueStatus: 'missing',
    });
  }
  try {
    const data = await buildDashboard(cookie, leagueId);
    res.json(data);
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    res.status(isAuth ? 401 : 500).json({
      error: err.message,
      cookieStatus: isAuth ? 'expired' : 'unknown',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Fantasy WC Dashboard (local dev) running at http://localhost:${PORT}`);
  console.log(`This server mirrors the Netlify Functions (stateless, cookie via X-Cookie-Value header).`);
});
