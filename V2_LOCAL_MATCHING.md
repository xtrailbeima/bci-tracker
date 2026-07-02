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

## Prepare a Reusable Local Matching Context

Before asking Codex for analysis, generate a bounded local context packet. This command does not call DeepSeek, OpenAI, or any external AI API. It reads only the selected external event file and Markdown profiles in `knowledge_base/projects/`.

```bash
npm run prepare:matching -- --date 2026-06-28
```

By default this writes:

```text
matching_reports/2026-06-28_context.md
```

Then ask Codex to read that context file and write the final report:

```text
读取 matching_reports/2026-06-28_context.md，生成 matching_reports/2026-06-28.md。
不要读取 knowledge_base/bp_notes 或 knowledge_base/interviews，除非我明确要求。
```

Useful options:

- `--events external_events/YYYY-MM-DD.json`: choose an event file directly.
- `--projects knowledge_base/projects`: choose the project profile directory.
- `--out matching_reports/custom_context.md`: choose the output path.
- `--max-events 40`: cap the number of events included.

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

## Event Deduplication

The export loop deduplicates repeated public coverage by default. This is intended to prevent the same financing, regulatory milestone, or company update from being counted as multiple independent investment signals when it appears in Google News, RSS, or copied media coverage.

- Raw article records remain unchanged in SQLite.
- Deduplication happens only in `external_events/YYYY-MM-DD.json`.
- A merged event keeps all unique `sources`.
- `sourceCount` records how many public sources support the event.
- `duplicateTitles` and `mergedEventIds` keep the merge explainable.
- Use `--no-dedupe` only for debugging raw article-to-event mapping.

## Sensitivity Policy

- `public_like`: public or already-shareable material; Codex may read linked summaries and notes when requested.
- `confidential`: internal investment material; Codex should read the project profile and only relevant excerpts.
- `highly_sensitive`: default to redacted profile fields only; full BP or interview notes require explicit user instruction.

The context generator follows this policy conservatively:

- It never reads BP, interview, or meeting-note directories.
- For `highly_sensitive` projects, it includes metadata and one-line profile summary only.
- It marks heuristic matches as requiring human confirmation.

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
