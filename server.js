require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

// sport5 uses a self-signed cert in their chain — disable verification for their API calls
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://dreamteam.sport5.co.il/api';
const SEASON_ID = process.env.SEASON_ID || '9';
const LEAGUE_ID = process.env.LEAGUE_ID || '37597';

// In-memory cache (keyed by cookie to support multiple users)
let cache = { data: null, ts: 0, cookie: null };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cookie storage (not persisted - user must re-enter on server restart)
let activeCookie = null;

function getCookieHeader(cookieOverride) {
  const cookie = cookieOverride || activeCookie;
  if (!cookie) throw new Error('NO_COOKIE');
  return `.AspNetCore.Cookies=${cookie}`;
}

async function apiGet(apiPath, params = {}) {
  const url = `${BASE_URL}/${apiPath}`;
  const resp = await axios.get(url, {
    params,
    headers: { Cookie: getCookieHeader() },
    maxRedirects: 0,
    validateStatus: s => s < 400,
    httpsAgent,
  });
  if (typeof resp.data === 'string' && resp.data.includes('<!doctype')) {
    throw new Error(`AUTH_EXPIRED: Got HTML for ${apiPath} — cookie likely expired`);
  }
  return resp.data;
}

async function apiPost(apiPath, data = {}) {
  const url = `${BASE_URL}/${apiPath}`;
  const params = new URLSearchParams(data);
  const resp = await axios.post(url, params.toString(), {
    headers: {
      Cookie: getCookieHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    maxRedirects: 0,
    validateStatus: s => s < 400,
    httpsAgent,
  });
  if (typeof resp.data === 'string' && resp.data.includes('<!doctype')) {
    throw new Error(`AUTH_EXPIRED: Got HTML for ${apiPath} — cookie likely expired`);
  }
  return resp.data;
}

// Position labels
const POSITION_LABELS = { 1: 'שוער', 2: 'בלם', 3: 'קשר', 4: 'חלוץ' };
const POSITION_EN = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Bonus definitions (from sportTypeBasicConfig.bonusTypes in Leagues/Get)
const BONUS_INFO = {
  TripleCaptain:        { emoji: '👑', nameHe: 'קפטן משולש',    descHe: 'קפטן מקבל x3 נקודות' },
  ElevenSubs:           { emoji: '🔄', nameHe: '15 חילופים',    descHe: 'ניתן לבצע 15 חילופים' },
  CaptainAndSubDouble:  { emoji: '⚡', nameHe: 'קפטן+סגן x2',  descHe: 'קפטן וסגן קפטן מקבלים x2' },
  BenchScore:           { emoji: '🪑', nameHe: 'נקודות חילוף', descHe: 'שחקני החילוף צוברים נקודות' },
};

async function buildDashboard() {
  // 1. Get current round info
  const roundResp = await apiGet('Leagues/Get', { seasonId: SEASON_ID });
  const round = roundResp.data;

  // 2. Get all national teams + players (for name/logo lookup)
  const teamsResp = await apiGet('Players/GetTeamsAndPlayers', { seasonId: SEASON_ID });
  const allTeams = teamsResp.data;
  const teamMap = {}; // teamId -> { name, logo, players }
  const playerTeamMap = {}; // playerId -> teamId
  for (const t of allTeams) {
    teamMap[t.id] = { id: t.id, name: t.name, logo: t.teamLogoPath, shirt: t.teamShirtPath };
    for (const p of t.players) {
      playerTeamMap[p.id] = t.id;
    }
  }

  // 3. Get league members
  const leagueResp = await apiGet('CustomLeagues/GetLeagueData', {
    seasonId: SEASON_ID,
    leagueId: LEAGUE_ID,
    teamId: 'null',
    isPerRound: 'false',
    pageIndex: 0,
    searchText: '',
  });
  const leagueTeams = leagueResp.data.teams;

  // 4. For each user, get their squad
  const userSquads = await Promise.all(
    leagueTeams.map(async (lt) => {
      try {
        const resp = await apiGet('UserTeam/GetUserAndTeam', {
          seasonId: SEASON_ID,
          userId: lt.userId,
        });
        const ut = resp.data.userTeam;
        const players = (ut.userTeamPlayers || []).map((p) => ({
          playerId: p.playerId,
          name: p.player?.name?.trim() || `Player ${p.playerId}`,
          teamId: p.player?.teamId,
          teamName: teamMap[p.player?.teamId]?.name || '?',
          position: p.player?.position,
          posLabel: POSITION_LABELS[p.player?.position] || '?',
          posEn: POSITION_EN[p.player?.position] || '?',
          isReserve: p.isReserve,
          isCaptain: p.playerId === ut.captainId,
          isSubCaptain: p.playerId === ut.subCaptainId,
          logo: teamMap[p.player?.teamId]?.logo,
        }));

        // Parse active bonuses for THIS round
        const activeBonuses = (ut.bonusesData || [])
          .filter(b => b.usageRoundId === round.id)
          .map(b => {
            const bonusName = round.sportTypeBasicConfig?.bonusTypes?.[String(b.bonusId)];
            const info = BONUS_INFO[bonusName] || {};
            return {
              bonusId: b.bonusId,
              bonusName: bonusName || `bonus_${b.bonusId}`,
              emoji: info.emoji || '🎯',
              nameHe: info.nameHe || bonusName || `בונוס ${b.bonusId}`,
              descHe: info.descHe || '',
            };
          });

        return {
          userId: lt.userId,
          teamName: lt.name,
          userName: lt.userName,
          totalScore: lt.totalScore,
          roundScore: lt.roundScore,
          position: lt.position,
          players,
          activeBonuses,
        };
      } catch (e) {
        return {
          userId: lt.userId,
          teamName: lt.name,
          userName: lt.userName,
          totalScore: lt.totalScore,
          roundScore: lt.roundScore,
          position: lt.position,
          players: [],
          activeBonuses: [],
          error: e.message,
        };
      }
    })
  );

  // 5. Collect unique teamIds from all squads
  const squadTeamIds = new Set();
  for (const u of userSquads) {
    for (const p of u.players) {
      if (p.teamId) squadTeamIds.add(p.teamId);
    }
  }

  // 6. For each squad teamId, get one player and fetch futureGames
  const gameMap = {}; // gameId -> game info
  const teamGames = {}; // teamId -> [gameIds]

  await Promise.all(
    [...squadTeamIds].map(async (teamId) => {
      const team = allTeams.find((t) => t.id === teamId);
      if (!team || !team.players.length) return;
      const player = team.players[0];
      try {
        const resp = await apiPost('Players/GetPlayerData', {
          playerId: player.id,
          seasonId: SEASON_ID,
        });
        const games = resp.data?.futureGames || [];
        for (const g of games) {
          if (!gameMap[g.id]) {
            gameMap[g.id] = {
              id: g.id,
              roundId: g.roundId,
              teamAId: g.teamAId,
              teamAName: g.teamAName,
              teamALogo: g.teamALogo,
              teamBId: g.teamBId,
              teamBName: g.teamBName,
              teamBLogo: g.teamBLogo,
              gameStart: g.gameStart,
              gameStatus: g.gameStatus, // 1=upcoming, 2=live, 3=finished
              resultData: g.resultData,
            };
          }
          if (!teamGames[teamId]) teamGames[teamId] = [];
          if (!teamGames[teamId].includes(g.id)) teamGames[teamId].push(g.id);
        }
      } catch (e) {
        // ignore individual player fetch errors
      }
    })
  );

  // 7. Filter games to current round
  const roundGames = Object.values(gameMap).filter((g) => g.roundId === round.id);
  roundGames.sort((a, b) => new Date(a.gameStart) - new Date(b.gameStart));

  // 8. For each game, build which users have players per team
  const gamesWithUsers = roundGames.map((game) => {
    const buildTeamUsers = (teamId) => {
      const result = [];
      for (const user of userSquads) {
        const myPlayers = user.players.filter(
          (p) => p.teamId === teamId && !p.isReserve
        );
        if (myPlayers.length > 0) {
          result.push({
            userId: user.userId,
            teamName: user.teamName,
            userName: user.userName,
            players: myPlayers,
            activeBonuses: user.activeBonuses || [],
          });
        }
      }
      return result;
    };

    return {
      ...game,
      teamAUsers: buildTeamUsers(game.teamAId),
      teamBUsers: buildTeamUsers(game.teamBId),
    };
  });

  // 9. Determine today's date (Israel timezone)
  const now = new Date();
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD
  const todayGames = gamesWithUsers.filter((g) => g.gameStart.startsWith(todayStr));

  return {
    generatedAt: new Date().toISOString(),
    today: todayStr,
    round: {
      id: round.id,
      roundIndex: round.roundIndex,
      startDate: round.startDate,
      endDate: round.endDate,
    },
    cookieStatus: 'ok',
    todayGames,
    allRoundGames: gamesWithUsers,
    users: userSquads.map((u) => ({
      userId: u.userId,
      teamName: u.teamName,
      userName: u.userName,
      totalScore: u.totalScore,
      roundScore: u.roundScore,
      position: u.position,
      players: u.players,
      activeBonuses: u.activeBonuses || [],
    })),
  };
}

// Routes
app.use(express.static(path.join(__dirname, 'public')));

// Cookie status
app.get('/api/cookie-status', (req, res) => {
  res.json({
    hasCookie: !!activeCookie,
    cookiePreview: activeCookie ? `${activeCookie.slice(0, 20)}...` : null,
  });
});

// Set cookie and sync
app.post('/api/set-cookie', async (req, res) => {
  const { cookie } = req.body;
  if (!cookie || typeof cookie !== 'string' || cookie.length < 50) {
    return res.status(400).json({ error: 'Invalid cookie format' });
  }

  // Validate cookie by making a test request
  const testCookie = cookie.trim();
  const originalCookie = activeCookie;
  activeCookie = testCookie;

  try {
    await apiGet('Leagues/Get', { seasonId: SEASON_ID });
    // Cookie is valid - clear cache and sync
    cache = { data: null, ts: 0, cookie: null };
    res.json({ success: true, message: 'Cookie saved, syncing data...' });
  } catch (err) {
    activeCookie = originalCookie; // Restore previous cookie
    const isAuthError = err.message.includes('AUTH_EXPIRED');
    res.status(401).json({
      error: isAuthError ? 'Cookie is invalid or expired' : err.message,
    });
  }
});

// Clear cookie
app.post('/api/clear-cookie', (req, res) => {
  activeCookie = null;
  cache = { data: null, ts: 0, cookie: null };
  res.json({ success: true });
});

app.get('/api/dashboard', async (req, res) => {
  if (!activeCookie) {
    return res.status(401).json({
      error: 'No cookie configured',
      cookieStatus: 'missing',
    });
  }

  const force = req.query.force === '1';
  const now = Date.now();

  if (!force && cache.data && now - cache.ts < CACHE_TTL) {
    return res.json({ ...cache.data, fromCache: true, cacheAge: Math.round((now - cache.ts) / 1000) });
  }

  try {
    const data = await buildDashboard();
    cache = { data, ts: now };
    res.json(data);
  } catch (err) {
    const isAuthError = err.message.includes('AUTH_EXPIRED');
    res.status(isAuthError ? 401 : 500).json({
      error: err.message,
      cookieStatus: isAuthError ? 'expired' : 'unknown',
    });
  }
});

app.get('/api/refresh', async (req, res) => {
  cache = { data: null, ts: 0 };
  res.redirect('/api/dashboard?force=1');
});

app.listen(PORT, () => {
  console.log(`Fantasy WC Dashboard running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
