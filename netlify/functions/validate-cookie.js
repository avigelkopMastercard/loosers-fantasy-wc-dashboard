const { apiGet, SEASON_ID, jsonResponse } = require('./_shared/sport5');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const cookie = (body.cookie || '').trim();
  if (!cookie || cookie.length < 50) {
    return jsonResponse(400, { error: 'Invalid cookie format' });
  }

  try {
    await apiGet(cookie, 'Leagues/Get', { seasonId: SEASON_ID });
    return jsonResponse(200, { success: true });
  } catch (err) {
    const isAuth = err.message.includes('AUTH_EXPIRED');
    return jsonResponse(401, {
      error: isAuth ? 'Cookie is invalid or expired' : err.message,
    });
  }
};
