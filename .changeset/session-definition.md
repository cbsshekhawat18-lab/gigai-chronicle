---
"@gigaichronicle/core": patch
---

Fix: a session exists because events belong to it, not because `SessionStarted`
announced it.

`ChronicleIndex.sessions()` only ever saw sessions that had a `SessionStarted`
or `SessionEnded` event, because those were the only events that created a
`sessions` row. So if a `SessionStart` hook was missed — or a provider never
emitted one — the CLI **hid the whole session**, while the VS Code extension
(which derives sessions from any event carrying a session id) happily listed
it. Two surfaces, one store, different answers about what exists.

The prompts were captured and replayable the entire time; only the summary
lied. Found by driving the real product end-to-end: `chronicle replay <ses>`
rendered both prompts while `chronicle sessions` reported `0`.

Any event with a session id now ensures the row; `SessionStarted` /
`SessionEnded` enrich it rather than gate it. `started` was already derived
from the events themselves, so an announced-less session still gets a real
start time and an honest `title: null`.

`INDEX_SCHEMA_VERSION` bumps to 3 — load-bearing, not cosmetic: per-file
cursors mean already-consumed events are never re-indexed, so without the bump
existing stores would keep hiding those sessions forever. The index rebuilds
itself on the mismatch; nothing is asked of the user.
