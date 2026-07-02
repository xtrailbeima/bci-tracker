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

## Current Verification

Last known completed checks:

- `npm run validate:events -- external_events/2026-06-28.json`: passed, 40 events valid
- `npm run validate:v2-local`: passed
- `npm test`: passed, 102 passed / 0 failed, including self-start/self-stop behavior
- `npm run verify`: passed, 102 passed / 0 failed
- Remote `npm run verify` on Tencent Cloud after commit `8814596`: passed, 98 passed / 0 failed
- Remote listener check after commit `8814596`: Node app listens on `127.0.0.1:4000`; `https://njubci.com/` returns 200; direct `http://111.229.73.49:4000/` no longer returns the app page
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

- `AGENTS.md` has existing local edits.
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

1. Implement the three-tier auth/RBAC foundation (`owner`, `operator`, `reader`) and audit logging for sensitive actions.
2. Decide whether the next matching run should remain manual Codex output or become a reusable local script/template.
3. Keep highly sensitive project material restricted to project profile summaries unless the user explicitly asks to read BP/interview detail.
4. Replace or retire the legacy Hunyuan `/api/summary` model path; current Hunyuan model returns provider error `2030` because the configured model is offline.
5. After explicit browser-action confirmation, remove the now-unneeded Tencent Cloud firewall rule for public `TCP 4000`; code already prevents direct app access, but the cloud rule should still be cleaned up.

## Recovery Prompt

```text
先读 AGENTS.md、PROJECT_STATE.md、REQUIREMENTS.md、V2_LOCAL_MATCHING.md，然后从 PROJECT_STATE.md 的“下一步”继续。
```
