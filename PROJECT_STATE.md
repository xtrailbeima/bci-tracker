# BCI Tracker Project State

> This file is the recovery point for long Codex sessions. Read it after `AGENTS.md` and before continuing implementation.

## Current Goal

Build BCI Tracker V2 as an investor-facing BCI intelligence workspace:

- Public intelligence is fetched, normalized, scored, and exported as structured external events.
- Confidential deal knowledge stays local under `knowledge_base/`.
- Codex performs local matching only when explicitly asked to read local files.
- DeepSeek handles public external intelligence; internal BP, interviews, and project judgments do not enter DeepSeek batch processing.

## Completed

- Added `REQUIREMENTS.md` as the main v5/v2 requirements reference.
- Added source quality fields to article records: access status, content quality, source reliability, extraction method, and fetch status.
- Added `fetch_runs` and `/api/source-health` for data-source health tracking.
- Rebuilt `better-sqlite3` compatibility by upgrading to `^12.11.1`.
- Added V2 local matching scaffolding:
  - `V2_LOCAL_MATCHING.md`
  - `knowledge_base/`
  - `external_events/`
  - `matching_reports/`
  - `schemas/external_event.schema.json`
  - `scripts/validate_external_events.js`
  - `scripts/validate_knowledge_base.js`
- Added the first local external-event export loop:
  - `scripts/export_external_events.js`
  - `npm run export:events`
  - generated `external_events/2026-06-28.json`
- Added the first local Codex matching report:
  - `matching_reports/2026-06-28.md`
  - scope limited to `knowledge_base/projects/`
  - no BP, interview, or meeting-note files read
- Added a reusable local matching context entry:
  - `scripts/prepare_matching_context.js`
  - `npm run prepare:matching -- --date YYYY-MM-DD`
  - generated `matching_reports/2026-06-28_context.md`
  - context files call no AI API, read no BP/interview directories, and include only metadata plus one-line summaries for highly sensitive projects
- Added the first P0 deployment hardening slice:
  - `server.js` defaults to `HOST=127.0.0.1` instead of binding the Node app to all interfaces
  - `deploy.sh` no longer opens or advertises public port `4000`
  - frontend header version label now shows v5.0
  - deployed commit `8814596` to Tencent Cloud and verified Nginx HTTPS still works
- Added V2 external-event deduplication:
  - `scripts/export_external_events.js` deduplicates repeated public coverage by default
  - merged events keep `sources`, `sourceCount`, `duplicateTitles`, `mergedEventIds`, and `dedupeKey`
  - `external_events/2026-06-28.json` now exports 40 deduplicated events from 50 input candidates
- Expanded watchlist-driven extraction:
  - `knowledge_base/watchlist.yaml` now includes Chinese companies, company aliases, technology-route aliases, and indication aliases
  - event export avoids Latin substring false positives such as matching `Synchron` inside `synchrony`
- Hardened `/api/import`:
  - rejects non-HTTP(S), localhost, single-label hosts, private IP ranges, and redirects to blocked hosts
  - validates HTML-like content types and limits response bodies to 1MB
  - added route-level smoke coverage for rejected import targets
- Improved AI JSON resilience:
  - malformed DeepSeek article-analysis JSON now returns a degraded, human-review fallback instead of a 500
  - added a stable `DEEPSEEK_JSON_PARSE_FAILED` error code for parser failures
- Made smoke tests self-contained:
  - `npm test` now starts and stops a local test server when one is not already running
  - `npm run verify` uses the self-contained smoke runner
  - smoke coverage includes source filtering, date filtering, collection rule CRUD, import security, date sorting, scoring consistency, DeepSeek availability branches, and reader RBAC/redaction
- Added the first three-tier auth/RBAC and audit slice:
  - SQLite tables `users`, `sessions`, and `audit_logs`
  - `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, owner-only user management, and owner-only audit log access
  - HttpOnly session cookie auth with `owner`, `operator`, and `reader` roles
  - all `/api/*` business routes require login; write/AI/source-health/data-source routes require owner/operator; user/audit/manual briefing routes require owner
  - front-end login gate, role badge, logout, owner user-management dialog, and role-based hiding of write/AI controls
  - audit logging for login, logout, user changes, collection changes, AI generation, import, and manual briefing send
- Deployed auth/RBAC to Tencent Cloud:
  - deployed commit `b2702b4` to `~/bci-tracker`
  - remote `.env` now includes `AUTH_COOKIE_SECURE=1` and owner bootstrap variables
  - initial owner credentials were generated on the server at `~/bci-owner-credentials.txt` with mode `600`
  - Nginx `bci-tracker` site received an explicit TLS curve compatibility line: `ssl_ecdh_curve X25519:prime256v1:secp384r1;`
- Retired the legacy Hunyuan `/api/summary` runtime path:
  - `/api/summary` remains available as a local compatibility endpoint with the old `sections` shape
  - the route no longer reads `HUNYUAN_API_KEY` or calls the offline `hunyuan-turbo` model
  - smoke coverage now asserts the local compatibility provider and Hunyuan retirement marker
- Added reader-facing article redaction:
  - `/api/all` and `/api/collections/:id` strip exact `importance`, fetch diagnostics, source quality fields, fetch errors, and internal collection metadata for `reader`
  - front-end article cards fall back to importance level only when the exact score is absent
  - smoke coverage asserts reader redaction while owner still receives full diagnostic fields
- Added API documentation drift protection:
  - `scripts/validate_api_docs.js` scans actual Express routes and checks `AGENTS.md` plus `REQUIREMENTS.md`
  - documented previously missing `/api/source-health` and `/api/auth/change-password`
  - `npm run verify` now fails if either primary project document omits an implemented API route
- Hardened AI JSON resilience across DeepSeek and Gemini:
  - `services/ai_json.js` is the shared JSON parser/repair utility for both providers
  - parse failures log provider, parser error, and response length without logging raw model output
  - DeepSeek daily/weekly/article analysis have stable degraded fallbacks for JSON parse failures
- Added configurable custom collection rules:
  - custom collections can be created with keyword rules and updated through `PATCH /api/collections/:id/rules`
  - rule input is bounded to string keyword arrays with count, length, dedupe, and character validation
  - collection cards and detail pages show automatic assignment rules; owner/operator can edit custom rules, reader can only view
  - `scripts/test_collection_rules.js` validates rule normalization and auto-assignment into a temporary custom collection

## Current Verification

Last known completed checks:

- `npm run validate:events -- external_events/2026-06-28.json`: passed, 40 events valid
- `npm run validate:v2-local`: passed
- `node scripts/test_matching_context.js`: passed
- `npm test`: passed, 157 passed / 0 failed after commit `19e59b3`, including auth/RBAC, reader cleanup, local `/api/summary` compatibility, and self-start/self-stop behavior
- `npm run verify`: passed, 157 passed / 0 failed after adding the matching context generator
- `npm test`: passed, 168 passed / 0 failed after reader article redaction
- `npm run verify`: passed, 168 passed / 0 failed after reader article redaction
- `npm run verify`: passed, 168 passed / 0 failed after adding API documentation coverage validation
- `node scripts/test_deepseek_json.js`: passed after shared AI JSON parser and degraded summary fallback changes
- `node scripts/test_collection_rules.js`: passed after configurable collection rules implementation
- `npm run verify`: passed, 185 passed / 0 failed after adding source/date filter smoke coverage
- Remote `npm run verify` on Tencent Cloud after commit `8814596`: passed, 98 passed / 0 failed
- Remote listener check after commit `8814596`: Node app listens on `127.0.0.1:4000`; `https://njubci.com/` returns 200; direct `http://111.229.73.49:4000/` no longer returns the app page
- Remote `npm run verify` on Tencent Cloud after commit `b2702b4`: passed, 111 passed / 0 failed
- Server-side HTTPS/SNI check after commit `b2702b4`: `https://njubci.com/` returns 200 with the v5.0 login gate; unauthenticated `https://njubci.com/api/all` returns 401
- Remote `npm run verify` on Tencent Cloud after commit `19e59b3`: passed, 149 passed / 0 failed
- Server-side HTTPS/SNI check after commit `19e59b3`: `https://njubci.com/` returns 200 with the v5.0 login gate; unauthenticated `https://njubci.com/api/all` returns 401
- Remote `npm run verify` on Tencent Cloud after commit `0110209`: passed, 149 passed / 0 failed
- Remote `npm run verify` on Tencent Cloud after commit `ce3d21f`: passed, 160 passed / 0 failed; PM2 `bci-tracker` online
- Remote `npm run verify` on Tencent Cloud after commit `75d0b65`: passed, 160 passed / 0 failed; API documentation coverage check included; PM2 `bci-tracker` online
- Remote `npm run verify` on Tencent Cloud after commit `5196263`: passed, 160 passed / 0 failed; shared AI JSON parser and degraded fallbacks deployed; PM2 `bci-tracker` online
- Remote `npm run verify` on Tencent Cloud after commit `4f54416`: passed, 167 passed / 0 failed; configurable custom collection rules deployed; PM2 `bci-tracker` online
- Tencent Cloud deployment for `0110209` used a local Git bundle because the server-to-GitHub pull failed with transient TLS/HTTP2 errors.
- Local-machine HTTPS checks may fail with `SSL_ERROR_SYSCALL` / Chrome `ERR_CONNECTION_CLOSED` when the current Mac resolves `njubci.com` to `198.18.x.x` fake-ip through a proxy/TUN path; those failed requests do not appear in Nginx logs.
- Public DoH checked from this machine resolves `njubci.com` to `111.229.73.49`; server-side Nginx checks and remote verification are the source of truth until the browser/proxy path is bypassed or tested from a non-proxy network.
- `matching_reports/2026-06-28.md`: generated as workflow validation report

Re-run checks after each new implementation slice.

## Key Decisions

- Keep frontend as plain HTML/CSS/JS.
- Keep SQLite and `better-sqlite3`.
- Keep `DEMO_DATA` as the network-failure fallback.
- Use `.env` only for API keys.
- Do not send confidential BP, interviews, meeting notes, or internal investment judgments to DeepSeek.
- Use three permission levels in V2 planning: `owner`, `operator`, `reader`.

## Known Dirty State

- SQLite WAL/SHM files may appear modified while the local server is running.
- `bci-tracker/` is an untracked legacy or duplicate directory and is not part of the current V2 work unless explicitly reviewed.

## Do Not Touch Without Explicit Instruction

- Do not delete `DEMO_DATA`.
- Do not introduce React, Vue, Angular, or another frontend framework.
- Do not replace SQLite.
- Do not hardcode or log API keys.
- Do not read full highly sensitive BP/interview material unless the user explicitly asks for it.
- Do not clean up the untracked `bci-tracker/` directory as part of unrelated work.

## Next Step

1. Re-test `https://njubci.com/` from a non-proxy network or add `njubci.com` / `111.229.73.49` to the local proxy DIRECT/bypass rule; if it still fails without fake-ip routing, inspect Tencent Cloud Lighthouse firewall/security rules for `TCP 443`.
2. Use `matching_reports/YYYY-MM-DD_context.md` as the handoff into Codex analysis, then manually review the final `matching_reports/YYYY-MM-DD.md` before updating project profiles.
3. Keep highly sensitive project material restricted to project profile summaries unless the user explicitly asks to read BP/interview detail.
4. After explicit browser-action confirmation, remove the now-unneeded Tencent Cloud firewall rule for public `TCP 4000`; code already binds the app to localhost, but the cloud rule should still be cleaned up.

## Recovery Prompt

```text
先读 AGENTS.md、PROJECT_STATE.md、REQUIREMENTS.md、V2_LOCAL_MATCHING.md，然后从 PROJECT_STATE.md 的“下一步”继续。
```
