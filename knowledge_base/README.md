# Local Deal Knowledge Base

This folder stores local project knowledge for Codex-assisted matching against public BCI intelligence.

Do not put raw highly sensitive BP or interview content into prompts by default. Keep a concise project profile in `projects/`, and store detailed BP/interview notes separately with sensitivity labels.

## Folder Layout

- `projects/`: one Markdown project profile per company or deal.
- `interviews/`: interview notes and meeting transcripts.
- `bp_notes/`: BP summaries and manual excerpts.
- `thesis/`: sector theses, investment memos, and technology route notes.
- `watchlist.yaml`: companies, technology routes, indications, investors, and policy sources to monitor.

## Project Profile Rules

Every project profile should include:

- `projectName`
- `status`
- `stage`
- `technologyRoutes`
- `indications`
- `coreClaims`
- `teamSignals`
- `risks`
- `openQuestions`
- `investmentThesis`
- `lastUpdated`
- `sensitivity`

Use `projects/_project_template.md` when adding a new project.
