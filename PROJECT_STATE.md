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

## Current Verification

Last known completed checks:

- `npm run validate:events -- external_events/2026-06-28.json`: passed, 50 events valid
- `npm run validate:v2-local`: passed
- `npm run verify`: passed, 98 passed / 0 failed
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

1. Add event deduplication so repeated Google News/RSS coverage of the same financing does not overstate signal strength.
2. Expand Chinese company and technology-route extraction rules using `knowledge_base/watchlist.yaml`.
3. Decide whether the next matching run should remain manual Codex output or become a reusable local script/template.
4. Keep highly sensitive project material restricted to project profile summaries unless the user explicitly asks to read BP/interview detail.

## Recovery Prompt

```text
先读 AGENTS.md、PROJECT_STATE.md、REQUIREMENTS.md、V2_LOCAL_MATCHING.md，然后从 PROJECT_STATE.md 的“下一步”继续。
```
