import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://dreamteam.sport5.co.il/api';
export const SEASON_ID = process.env.SEASON_ID || '9';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const POSITION_LABELS = { 1: 'שוער', 2: 'בלם', 3: 'קשר', 4: 'חלוץ' };
const POSITION_EN = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

const BONUS_INFO = {
  TripleCaptain:        { emoji: '👑', nameHe: 'קפטן משולש',    descHe: 'קפטן מקבל x3 נקודות' },
  ElevenSubs:           { emoji: '🔄', nameHe: '15 חילופים',    descHe: 'ניתן לבצע 15 חילופים' },
  CaptainAndSubDouble:  { emoji: '⚡', nameHe: 'קפטן+סגן x2',  descHe: 'קפטן וסגן קפטן מקבלים x2' },
  BenchScore:           { emoji: '🪑', nameHe: 'נקודות חילוף', descHe: 'שחקני החילוף צוברים נקודות' },
};

function cookieHeader(cookie) {
  if (!cookie) throw new Error('NO_COOKIE');
  return `.AspNetCore.Cookies=${cookie}`;
}

export async function apiGet(cookie, apiPath, params = {}) {
  const url = `${BASE_URL}/${apiPath}`;
  const resp = await axios.get(url, {
    params,
    headers: { Cookie: cookieHeader(cookie) },
    maxRedirects: 0,
    validateStatus: s => s < 400,
    httpsAgent,
  });
  if (typeof resp.data === 'string' && resp.data.includes('<!doctype')) {
    throw new Error(`AUTH_EXPIRED: Got HTML for ${apiPath} — cookie likely expired`);
  }
  return resp.data;
}

export async function apiPost(cookie, apiPath, data = {}) {
  const url = `${BASE_URL}/${apiPath}`;
  const params = new URLSearchParams(data);
  const resp = await axios.post(url, params.toString(), {
    headers: {
      Cookie: cookieHeader(cookie),
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

export async function buildDashboard(cookie, leagueId) {
  const roundResp = await apiGet(cookie, 'Leagues/Get', { seasonId: SEASON_ID });
  const round = roundResp.data;

  const teamsResp = await apiGet(cookie, 'Players/GetTeamsAndPlayers', { seasonId: SEASON_ID });
  const allTeams = teamsResp.data;
  const teamMap = {};
  for (const t of allTeams) {
    teamMap[t.id] = { id: t.id, name: t.name, logo: t.teamLogoPath, shirt: t.teamShirtPath };
  }

  const leagueResp = await apiGet(cookie, 'CustomLeagues/GetLeagueData', {
    seasonId: SEASON_ID,
    leagueId,
    teamId: 'null',
    isPerRound: 'false',
    pageIndex: 0,
    searchText: '',
  });
  const leagueTeams = leagueResp.data.teams;

  const userSquads = await Promise.all(
    leagueTeams.map(async (lt) => {
      try {
        const resp = await apiGet(cookie, 'UserTeam/GetUserAndTeam', {
          seasonId: SEASON_ID,
          userId: lt.userId,
        });
        const ut = resp.data.userTeam;
        // BUG FIX: Sport5 returns the cumulative history of all players ever
        // owned by the team. Round-1 players that have been transferred out
        // are still present with isRemoved=true. The official Sport5 frontend
        // filters the same way; without this, squads show 18-20 players
        // instead of the correct 15 in round 2+.
        const players = (ut.userTeamPlayers || [])
          .filter((p) => !p.isRemoved)
          .map((p) => ({
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

  const squadTeamIds = new Set();
  for (const u of userSquads) {
    for (const p of u.players) {
      if (p.teamId) squadTeamIds.add(p.teamId);
    }
  }

  const gameMap = {};
  const teamGames = {};

  await Promise.all(
    [...squadTeamIds].map(async (teamId) => {
      const team = allTeams.find((t) => t.id === teamId);
      if (!team || !team.players.length) return;
      const player = team.players[0];
      try {
        const resp = await apiPost(cookie, 'Players/GetPlayerData', {
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
              gameStatus: g.gameStatus,
              resultData: g.resultData,
            };
          }
          if (!teamGames[teamId]) teamGames[teamId] = [];
          if (!teamGames[teamId].includes(g.id)) teamGames[teamId].push(g.id);
        }
      } catch (e) {
        // ignore
      }
    })
  );

  const roundGames = Object.values(gameMap).filter((g) => g.roundId === round.id);
  roundGames.sort((a, b) => new Date(a.gameStart) - new Date(b.gameStart));

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

  const now = new Date();
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
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

export function getCookieFromEvent(event) {
  const headers = event.headers || {};
  return (
    headers['x-cookie-value'] ||
    headers['X-Cookie-Value'] ||
    null
  );
}

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
