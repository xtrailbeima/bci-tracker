# External Events

This folder stores structured public intelligence events exported by BCI Tracker.

Use one file per day:

```text
external_events/YYYY-MM-DD.json
```

The file may be either:

- an array of event objects, or
- an object with an `events` array.

Validate a file with:

```bash
npm run validate:events -- external_events/_example.json
```

Export a draft event file from the current public article database:

```bash
npm run export:events -- --date 2026-06-28
```

For test runs that should not write into this folder:

```bash
npm run export:events -- --out /tmp/bci-external-events.json
```
