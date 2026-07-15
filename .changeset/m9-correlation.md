---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
---

M9 — Correlation. Link scoring as a derived projection (trailer→exact,
dirty-set∩window→high, window→inferred; second-granularity windows because
commit timestamps are second-precision), human overrides via
`chronicle link confirm|reject` (rejections suppressed forever), the
opt-in Chronicle-Session trailer as a pure-POSIX chained prepare-commit-msg
hook (~1ms fail-open, reads the engine-maintained active-session marker,
honors core.hooksPath, uninstall removes exactly ours), and
`chronicle hooks install|uninstall git`. inspect <sha> now shows links
with confidence + source.
