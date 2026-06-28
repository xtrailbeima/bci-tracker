# BCI Tracker V2 Local Deal Matching

V2 separates public intelligence processing from confidential deal matching.

- DeepSeek processes only public external intelligence.
- Local deal knowledge stays in this workspace under `knowledge_base/`.
- Codex performs matching only when explicitly asked to read local files.
- OpenAI API integration is intentionally out of scope for this first version.

## Workflow

1. Public sources are fetched and structured into external events.
2. Daily events are exported to `external_events/YYYY-MM-DD.json`.
3. Deal/project knowledge is maintained in Markdown under `knowledge_base/`.
4. In Codex, ask for a matching run:

```text
读取 external_events/2026-06-28.json，并和 knowledge_base/projects 下的项目画像做匹配。
只读取高敏感项目的画像摘要，不展开 BP 或访谈全文。
输出 matching_reports/2026-06-28.md，包含受影响项目、影响方向、风险变化、下次访谈问题和建议动作。
```

5. Review the report manually before copying any conclusion back into the project knowledge base.

## Export Current Public Events

The first V2 export loop is local and heuristic. It reads public article records from SQLite, maps them into the external event schema, and writes one JSON file.

```bash
npm run export:events -- --date 2026-06-28
npm run validate:events -- external_events/2026-06-28.json
```

Useful options:

- `--from` / `--to`: limit by article date.
- `--limit`: cap exported articles, default `50`.
- `--min-importance`: ignore low-score articles.
- `--out`: write to a custom path for testing.
- `--stdout`: print JSON without writing a file.

DeepSeek event structuring can replace or refine this heuristic later, but only for public external intelligence.

## Sensitivity Policy

- `public_like`: public or already-shareable material; Codex may read linked summaries and notes when requested.
- `confidential`: internal investment material; Codex should read the project profile and only relevant excerpts.
- `highly_sensitive`: default to redacted profile fields only; full BP or interview notes require explicit user instruction.

## External Event Shape

Each event in `external_events/YYYY-MM-DD.json` must include:

- `id`
- `date`
- `track`
- `eventType`
- `title`
- `summary`
- `companies`
- `technologyRoutes`
- `indications`
- `investmentSignal`
- `importanceScore`
- `confidence`
- `sources`

## Matching Report Shape

Each report in `matching_reports/` should include:

- External event summary
- Affected projects
- Match strength
- Impact direction
- Risk changes
- Next interview questions
- Recommended actions
- Human confirmation status
