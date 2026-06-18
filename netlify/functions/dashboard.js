const { buildDashboard, getCookieFromEvent, jsonResponse } = require('./_shared/sport5');

exports.handler = async (event) => {
  const cookie = getCookieFromEvent(event);
  if (!cookie) {
    return jsonResponse(401, {
      error: 'No cookie provided (missing X-Cookie-Value header)',
      cookieStatus: 'missing',
    });
  }

  const leagueId = (event.queryStringParameters || {}).leagueId;
  if (!leagueId) {
    return jsonResponse(400, {
      error: 'No league selected (missing leagueId query param)',
      cookieStatus: 'ok',
      leagueStatus: 'missing',
    });
  }

  try {
    const data = await buildDashboard(cookie, leagueId);
    return jsonResponse(200, data);
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    return jsonResponse(isAuth ? 401 : 500, {
      error: err.message,
      cookieStatus: isAuth ? 'expired' : 'unknown',
    });
  }
};
