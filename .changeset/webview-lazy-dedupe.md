---
"gigaichronicle-vscode": minor
---

Timeline panel round 2 (founder feedback): the webview is now PURE REPLAY —
the native sidebar is the one session list (no duplication). Replay ships as
a compact host-built delta stream in lazy newest-first windows of 300
("load earlier moments" on demand) instead of raw frames, which were
quadratic in session size — a 750-event session now transfers kilobytes,
not megabytes. Live session marked green (sidebar icon + "● live now"
header badge), empty sessions explain themselves honestly, and session
start/end render as subtle stream marks.
