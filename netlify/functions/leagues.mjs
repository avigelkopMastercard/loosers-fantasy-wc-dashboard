import { apiGet, SEASON_ID, getCookieFromEvent, jsonResponse } from './_shared/sport5.mjs';

export const handler = async (event) => {
  const cookie = getCookieFromEvent(event);
  if (!cookie) {
    return jsonResponse(401, { error: 'No cookie provided (missing X-Cookie-Value header)' });
  }

  try {
    const resp = await apiGet(cookie, 'CustomLeagues/GetUserLeagues', { seasonId: SEASON_ID });
    const leagues = (resp.data || []).map(l => ({
      id: l.id,
      name: l.name,
      memberCount: l.teamsCount,
    }));
    return jsonResponse(200, { leagues });
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    return jsonResponse(isAuth ? 401 : 500, { error: err.message });
  }
};
