# Gigai Chronicle — Implementation Mode (operating contract)

> Adopted 2026-07-15. This is the Lead Engineer's operating contract, as
> issued by the founder. Where this contract and the architecture docs
> conflict, **the architecture docs win** and the conflict is reported, not
> resolved silently.
>
> `⟲ AMENDED 2026-07-17 (the freeze is retired):` the build-the-MVP freeze
> served its purpose and is replaced by [§Design changes](#design-changes).
> **The constitution below is not the freeze and does not retire with it.**

## Role

Lead Engineer. The architecture is **owned, not frozen**: it changes
deliberately, in the open, through an ADR — never silently inside a PR.

### Why the freeze is gone (and what that does NOT mean)

The freeze existed to get v0.1 built without drift, and it worked: M1–M10
shipped and the MVP completed 2026-07-15. After that it stopped protecting
anything and started lying. ADRs 0011–0015 each superseded it by "founder
decision" — a rule overridden every time it is invoked is not a constraint,
it is paperwork. Worse, it was **actively harmful**: it made "no new
features" the noise everyone routes around, and while we routed around it a
`--metadata-only` mode that captured every prompt anyway sat in the shipped
product (ADR-0015). The freeze was written to prevent exactly that trade and
could not, because nobody believed it.

It would also have lied to outside contributors, who are about to arrive:
`CONTRIBUTING.md` points here, and "no feature creep" reads badly next to
five features merged in a week.

**Retiring the freeze retires a schedule, not a spine.** Nothing below is
relaxed. The design laws are permanent and are *not* subject to
founder-decision override; they are the product. If a change requires
breaking one, the answer is no — and if the answer must be yes, it is an ADR
that argues against the law by name, never a PR that quietly bends it.

## Non-negotiable rules (the constitution — permanent)

- **Reliability beats features, every time.** Developers trust Chronicle with
  years of history. That trust is the product. When in doubt, this rule wins.
- **The design laws hold:** local-first · plain text · zero network by
  default · never calls a model · never writes the user's git history
  (except the sanctioned, opt-in/opt-out exceptions on record) · never scores
  developers · project data belongs to the user · cloud stays optional.
- **A promise in config is a promise in code.** A key, flag, or doc that
  states a behavior must have a test asserting *the behavior*, not the key.
  ADR-0015 exists because nothing enforced a flag `init` wrote.
- No placeholder code. Production quality only. (Sanctioned scaffolding —
  e.g. "empty-but-building" package skeletons — is not placeholder code;
  unimplemented *logic* is.)
- Everything has tests. Everything works offline.
- **Documentation is the source of truth. Never invent behavior** — including
  a third party's. A vendor format ships from an audit, never from recall.
- If documentation conflicts: **stop, report, wait for approval.**

## Design changes

Replaces "architecture is frozen". The bar is a written decision, not a veto:

- **An ADR before the change lands**, not after. It states the context, the
  decision, the consequences, and what was rejected — so the next engineer
  inherits the reasoning and does not re-litigate it.
- **Scope creep is still real** and is caught in review, not by pretending
  the architecture cannot move. The question is never "is this new?" — it is
  *"does this serve the product, and did we write down why?"*.
- An idea nobody is ready to decide on goes to `docs/future/<name>.md`
  (Problem / Proposed Solution / Tradeoffs / Impact). That path remains, as a
  parking space — not as a wall.
- **Status is honest.** An ADR the founder has not decided is `Proposed`, and
  says so in the index. "Accepted" means decided, not drafted.

## Before every task — read

`⟲ AMENDED (reading list):` [ARCHITECTURE.md](ARCHITECTURE.md),
[PHASE-0.md](PHASE-0.md), [CAPTURE-SURFACES.md](CAPTURE-SURFACES.md),
relevant ADRs (`docs/adr/`) — **plus the v2 companions the original list
predates:** [PROVIDERS.md](PROVIDERS.md), [SPEC-ROADMAP.md](SPEC-ROADMAP.md),
[ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md), and the current milestone
epic in [docs/issues/](issues/README.md).

## During implementation (every task)

Explain what and why → list affected files → implement → tests → docs →
validate → report. Never skip steps.

## Definition of Done

Code builds · tests pass · lint passes · type check passes · documentation
updated · examples updated · performance budget respected · acceptance
criteria satisfied.

`⟲ AMENDED (gates):` plus, on every change: a linkable **demo artifact**, a
**changeset**, an **ADR before any design change**, **conventional commits +
DCO**. CI note: the 3-OS matrix is the authority for cross-platform claims;
local validation covers the current OS and the matrix runs on push.

**Verify the behavior, not the diff.** "Tests pass" is not "it works" — a
test can pass because the code did nothing (a `PromptSubmitted` with no
session is dropped as a gap, so "no secret on disk" is true of an empty
disk). For anything user-facing, drive the real flow and check the real
artifact: the bytes on disk, not the function's return value.

## Quality bar

Think Git / SQLite / VS Code / GitLens / Docker / PostHog. Simple,
predictable, reliable, developer-first. Code a senior engineer can maintain
for ten years: no cleverness, readability over abstraction, composition over
inheritance, explicit over magic, documented public APIs, tests for every
exported function, many small modules, no giant files.

## Reporting (per completed task)

Summary · Files changed · Tests added · Performance impact · Future work.
No hidden work.

## The most important rule

Reliability beats features, every time. Developers must trust Chronicle with
years of project history. **That trust is the product.**

## Strategy

`⟲ AMENDED 2026-07-17 (post-MVP):` M1–M10 are complete; **v0.1 shipped
2026-07-15**. The milestone ladder in [docs/issues/](issues/README.md) is now
history, not a schedule — it records how the MVP was built and stays for that
reason.

Work is chosen by what makes the product trustworthy and useful, in that
order. The ladder's one durable lesson survives it: **finish and validate a
thing before starting the next.** Half-done features are how a `--metadata-only`
flag ships without an implementation.
