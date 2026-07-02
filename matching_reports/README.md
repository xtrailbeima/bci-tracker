# Matching Reports

This folder stores Codex-generated local matching reports.

Use one file per run:

```text
matching_reports/YYYY-MM-DD.md
```

Generate a local context packet first:

```bash
npm run prepare:matching -- --date YYYY-MM-DD
```

This writes `matching_reports/YYYY-MM-DD_context.md`. The context packet is an input for Codex analysis, not a final investment conclusion.

Reports should be reviewed by a human before updating any project profile.
