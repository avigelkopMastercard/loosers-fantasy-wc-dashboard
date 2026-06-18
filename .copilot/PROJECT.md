# Fantasy WC Dashboard - Project Reference

## Overview
Dashboard for tracking Fantasy World Cup 2026 leagues on Sport5 (dreamteam.sport5.co.il).
Shows games, player selections, standings, and bonuses for league members.

## Quick Start
```bash
cd /Users/e164918/git/loosers-fantasy-wc-dashboard
npm install
npm start
# Open http://localhost:3000
```

## Architecture

### Backend (server.js)
- Express server on port 3000
- Proxies requests to Sport5 API (requires auth cookie)
- In-memory storage for cookie and selected league
- 5-minute cache for dashboard data

### Frontend (public/index.html)
- Single-page app with tabs: Today's Games, Round Games, Users, Standings
- RTL Hebrew interface
- Cookie input modal with bookmarklet helper
- League selection modal

## Key Features

### Authentication Flow
1. User clicks "🔑 הגדר קוקי" button
2. Pastes `.AspNetCore.Cookies` value from Sport5
3. Server validates cookie against Sport5 API
4. If valid, league selection modal opens
5. User picks a league → data syncs

### Cookie Extraction
Users can either:
- **Manual**: DevTools → Application → Cookies → `.AspNetCore.Cookies`
- **Bookmarklet**: Drag button from modal to bookmarks bar, click on Sport5 site

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cookie-status` | GET | Check if cookie/league are set |
| `/api/set-cookie` | POST | Validate and save cookie |
| `/api/clear-cookie` | POST | Remove cookie |
| `/api/leagues` | GET | Get user's leagues from Sport5 |
| `/api/set-league` | POST | Select active league |
| `/api/dashboard` | GET | Get full dashboard data |
| `/api/refresh` | GET | Force refresh data |

## Configuration (.env)
```
PORT=3000
SEASON_ID=9
```
Note: `LEAGUE_ID` is now dynamic (user selects via UI).

## Sport5 API Endpoints Used
- `Leagues/Get` - Round info
- `Players/GetTeamsAndPlayers` - Teams and players
- `CustomLeagues/GetUserLeagues` - User's leagues
- `CustomLeagues/GetLeagueData` - League members
- `UserTeam/GetUserAndTeam` - User's squad
- `Players/GetPlayerData` - Player details & games

## Security Notes
- Cookie stored in-memory only (lost on restart)
- Cookie never written to disk
- `.env` should be in `.gitignore`
- Sport5 uses self-signed cert (disabled verification)
