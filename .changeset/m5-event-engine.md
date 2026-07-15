---
"@gigaichronicle/core": minor
---

M5 — The Only Door: the Event Engine. Four-stage pipeline (validate → redact
→ enrich → normalize) as the sole write path for capture: mandatory
redaction before first write (pattern pack + workspace `.env` harvest +
conservative entropy heuristic → irreversible `[REDACTED:kind:hash8]`
markers), enrichment with cached system-git snapshots, strict normalization
(unknown types and binding violations become CaptureGaps — `emit()` never
throws on candidate data), and the new `@gigaichronicle/core/emit` subpath —
the only core surface provider packages may import. Red-line CI test: every
secret class pushed through the pipeline, raw store files grepped clean.
