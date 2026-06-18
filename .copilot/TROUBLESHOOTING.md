# Troubleshooting Guide

## "No cookie configured" error
**Cause**: Server doesn't have a cookie stored (in-memory, lost on restart)
**Fix**: Click "🔑 הגדר קוקי" and enter a fresh cookie from Sport5

## "Cookie is invalid or expired" error
**Cause**: The Sport5 session expired
**Fix**: 
1. Go to dreamteam.sport5.co.il and log in again
2. Extract new cookie (DevTools or bookmarklet)
3. Enter in the app

## "No league selected" error
**Cause**: Cookie is valid but no league was selected
**Fix**: Click "🏆 בחר ליגה" and pick your league

## Server won't start / port in use
```bash
# Find what's using port 3000
lsof -i :3000

# Kill it (replace PID)
kill <PID>

# Start server
npm start
```

## API returns HTML instead of JSON
**Cause**: Auth failed, Sport5 redirects to login page
**Fix**: Get a fresh cookie

## "Cannot find module" error
```bash
npm install
```

## Changes not showing in browser
**Fix**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

## Bookmarklet not working
**Cause**: Cookie might be HttpOnly (can't be read by JavaScript)
**Workaround**: Use DevTools method:
1. F12 → Application → Cookies
2. Find `.AspNetCore.Cookies`
3. Copy the Value column
