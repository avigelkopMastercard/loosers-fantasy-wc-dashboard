# Common Tasks & Prompts

## Add a new feature
"Add [feature] to the Fantasy WC Dashboard. The backend is in server.js (Express), frontend is public/index.html (vanilla JS, RTL Hebrew)."

## Debug API issues
"The Sport5 API call to [endpoint] is failing. Check server.js for the apiGet/apiPost functions. The cookie might be expired."

## Update UI styling
"Update the styling for [component] in public/index.html. The design uses dark theme (#0d1117 background, #2ea44f green accent)."

## Add new Sport5 API endpoint
"Add a new endpoint that calls Sport5's [API path]. Follow the pattern in apiGet/apiPost. Handle AUTH_EXPIRED errors."

## Cookie issues
"The cookie is expiring/not working. Check:
1. Is it HttpOnly? (can't read from JS on same domain)
2. Is the format correct? (should be the value only, not the full cookie string)
3. Is Sport5 returning HTML instead of JSON? (means auth failed)"

## League selection issues
"League selection not working. Check:
1. /api/leagues endpoint - returns user's leagues
2. /api/set-league endpoint - saves selected league
3. activeLeague variable in server.js"
