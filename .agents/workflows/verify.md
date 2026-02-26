---
description: Run verification checks after making changes to BCI Tracker
---

# BCI Tracker Verification Workflow

Run this workflow after making code changes to catch bugs before user review.

## Prerequisites
- Server must be running on localhost:3000
- If not running: `GEMINI_API_KEY=AIzaSyAPn4qSlydWVw-RIr4LyL530bmUfMNt2SQ node server.js`

## Steps

// turbo
1. **Syntax check** — Verify all JS files parse correctly:
```bash
node -c server.js && node -c public/app.js && echo "✅ Syntax OK"
```

// turbo
2. **Run smoke tests** — Verify all API endpoints and data consistency:
```bash
node test/smoke.js
```

3. **Browser visual check** — Open the app and verify the UI renders correctly:
   - Open http://localhost:3000 in the browser
   - Take a screenshot of the full page
   - Verify: left panel has AI summary with importance badges
   - Verify: right panel has news cards with importance badges
   - Verify: importance badge styles match between panels
   - Verify: refresh button is visible in the AI summary header
   - Verify: source links (🔗) are clickable

4. **If all checks pass** — Commit and notify user with results summary.

5. **If any checks fail** — Fix the issues, then re-run from step 1.
