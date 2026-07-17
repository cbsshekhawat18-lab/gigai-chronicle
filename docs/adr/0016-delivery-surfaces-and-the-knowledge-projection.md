# 0016 — Chronicle as a source: delivery surfaces and the Knowledge projection

- Status: Accepted (founder decision, 2026-07-17)
- Date: 2026-07-17
- Relates: [ARCHITECTURE §3](../ARCHITECTURE.md) (the pipeline),
  [ARCHITECTURE §7.2](../ARCHITECTURE.md) (rule 2 — generated files),
  [ARCHITECTURE §12](../ARCHITECTURE.md) (Knowledge, Phase 2),
  [ADR-0011](0011-prompt-library-pulled-forward.md) / [ADR-0014](0014-prompt-seam-promote-captured.md) (the library this delivers),
  [CAPTURE-SURFACES.md](../CAPTURE-SURFACES.md) (the inbound analog),
  [DELIVERY-SURFACES.md](../DELIVERY-SURFACES.md) (the audit this ADR requires),
  [PHASE-0 §5](../PHASE-0.md#5-product-boundaries) (boundary 10),
  [PHASE-0 §14](../PHASE-0.md#14-privacy-model) (consent gates)

## Context

Chronicle's pipeline is a sink. Every arrow points inward:

```
Providers → Event Engine → Store → Replay → Projections → UI
```

Two wanted features point the other way, and neither has a home:

1. **`prompt sync`** — put a library prompt where the tool will actually read
   it. Today B must run `chronicle prompt show`, copy, and paste. The library
   is a filing cabinet nobody visits (ADR-0014 closed the *input* seam and
   deliberately left this open).
2. **A project-memory file** — the founder's ask: a new AI session should
   understand the project in seconds instead of re-reading the repo, and a
   teammate who pulls should inherit the context, not re-derive it.

Both are the same shape: **Chronicle writing into a tool's territory.** The
architecture has no concept for it. `Knowledge` exists in §12 as a Phase-2
*projection* — a read-side box — which is why both features kept feeling
unplaceable. They are not features waiting on effort; they are features
waiting on a **direction**.

Filing the target-format research into [CAPTURE-SURFACES.md](../CAPTURE-SURFACES.md)
was considered and rejected: that document's scope is *"every mechanism for
**observing**"*, and its whole legal frame is about **reading** ("user-consented
reading of local files", "format parsing", "no circumvention"). Writing into a
vendor's config directory is a different act with a different risk profile.

### The rejected shape, and why it matters

The original proposal was an encoded/encrypted file — small, machine-only,
"an encoding all AI models understand". It is rejected on three independent
grounds, recorded here so it is not re-litigated:

1. **Security (decisive).** A file that is (a) auto-loaded by every AI and
   (b) unreadable by humans is an **unreviewable prompt-injection channel**.
   A reviewer seeing an opaque blob in a PR cannot know it says *"ignore
   prior instructions"*. Plain text is not a constraint we tolerate — it is
   the control that makes `.chronicle/` auditable in a diff. Encoding would
   convert our most defensible property into an attack surface.
2. **"Encryption every model understands" is a contradiction.** Security
   lives in the key, not the algorithm (Kerckhoffs). A key every model holds
   is not a key; that is encoding with extra steps, reversible by the
   attacker too. Real encryption makes the file *noise* to the model — to use
   it you decrypt to the same plaintext, plus overhead.
3. **It does not even save tokens.** Tokenizers are BPE, fit to natural
   language. Invented shorthand splits into *more* tokens, and the model
   spends reasoning decoding rather than understanding.

The founder's underlying instinct — **the file must be small** — is correct.
Measured on this repo's own store: a raw session digest is **118,959 bytes**;
the same knowledge, selected and written in English, is **2,005 bytes** — a
**98.3% reduction, with no encoding at all.** Compression comes from
*selection*, not ciphers.

**But read §4 before believing that number.** The 2,005-byte version was
written by a *model*, and core may never call one. The reduction is real and
the direction is right; the mechanism cannot be "Chronicle summarizes". What
survives the law is selection over facts already on disk — which is still the
thing only Chronicle can do, because only Chronicle has the journey.

## Decision

### 1. Delivery is a first-class direction

The pipeline gains one outward arrow, and it is narrow by construction:

```
Store → Replay → Projections ─┬→ UI            (existing: we render)
                              └→ Delivery      (new: we write, opt-in)
```

Delivery is **not** a new store, format, or protocol. It is a projection
whose render target is a file another tool already reads.

### 2. The delivery contract (binding on every target)

- **Plain text, always.** Never encoded, never encrypted, never minified.
  Non-negotiable — see Context.
- **Marker-guarded.** Every delivered file carries `GENERATED_MARKER`
  (§7.2 rule 2) on its first line. Chronicle overwrites **only** files that
  declare themselves generated. A hand-written file at the target path is
  never touched — it is reported and skipped.
- **Merge, never clobber.** Where a target is shared and structured (e.g.
  `.claude/settings.json`), merge our region and leave the rest byte-identical
  — the discipline hook installation already uses.
- **Explicit, never automatic.** Delivery runs on an invoked command, never
  as a side effect of capture. Writing into the user's tool configuration is
  a consent act, and it is **consent gate 5** (extending PHASE-0 §14).
- **Idempotent.** Same store → same bytes. Re-running is a no-op.
- **Reversible.** Every deliver has an un-deliver that removes exactly what
  it wrote (identified by the marker), and nothing else.
- **Fails to a no-op, never to a corrupt write.** Targets are third-party
  formats that churn (PHASE-0 §1.3). An unrecognized target degrades to a
  reported skip. We never half-write a file another tool depends on.
- **Never leaves the repo.** Delivery writes to the workspace. It is not
  sync, not upload, not network. `doctor`'s zero-egress proof is unaffected.

### 3. Ship into formats that already exist

**No new file extension.** A `.gigai` file has one fatal property: nothing
reads it. `CLAUDE.md`, `AGENTS.md`, and `.claude/commands/*.md` are loaded
automatically, today, by tools our users already run. Chronicle's whole thesis
is meeting existing gravity — git as transport, files as API — and this is the
same argument.

Each target must be **audited before use**, in a new
`docs/DELIVERY-SURFACES.md` — the outbound analog of CAPTURE-SURFACES, with
its own rubric (documented? stable? shared with the user's own edits? what
breaks on a vendor release?). **No target ships on recall of its format.**
That document is a precondition of implementation, not a follow-up.

### 4. Knowledge is EXTRACTION, not summarization

The Knowledge projection (§12, Phase 2) renders **project memory**: the small
set of things a new session or a new teammate must know and cannot derive from
the code — the laws, the decisions that bite if forgotten, the open questions.

**The binding constraint, which nearly sank this ADR:** *"Core never calls a
model"* (README, ARCHITECTURE §86, privacy.md, IMPLEMENTATION-MODE). It is a
law, not a preference. Therefore:

> **Chronicle may not summarize its own journey.** Turning 1,333 events into
> two thousand words of prose is a model's job, and core is forbidden from
> having one. Any design that assumes "Chronicle writes a good summary" is
> unbuildable here — including the 98.3%-reduction demo that motivated this
> ADR, which was written by a model and which Chronicle could not reproduce.

What core CAN do, deterministically, is **extract and select**:

- Facts already structured on disk: ADR titles, statuses, and supersessions;
  the design laws (they are quotable, not derivable); session titles; library
  prompts; `why` attributions; capture gaps.
- **Pointers, not prose.** *"Read ADR-0015 before touching redaction"* is
  cheap, precise, and verifiable. *"Here is what we learned about redaction"*
  is a summary, and a lie waiting to rot.
- **Selection is the product; comprehension is the reader's.** The AI that
  loads the file already understands things — it does not need Chronicle to
  pre-digest them. It needs to be told *which* of 1,333 events and 17 ADRs
  matter. That is exactly what only Chronicle can know, and it needs no model
  to answer.

- **Derived and disposable**, like every projection. Regenerable from the
  store; never a source of truth; safe to delete.
- **Its value is what it omits.** A projection that includes everything is the
  log with worse ergonomics.
- **Plain text.** Not a DSL, not shorthand, not an encoding.

A model-written summary remains possible as a *user-curated* file the user
authors and Chronicle merely keeps beside its pointers — but that is the
user's model, invoked by the user, never core reaching for one.

### 5. Privacy boundaries (binding)

- **Private sessions never reach a delivered file.** They live in
  `.local/private/` precisely so they do not travel; a projection that
  summarized them into a committed file would launder them past consent gate 2.
- **Metadata-only stores yield metadata-only knowledge** (ADR-0015). There is
  no text to summarize, and the projection must say so rather than infer.
- **Delivered files are committed and pushed** like any file. That is a
  feature — it is reviewable — and it is exactly why plain text is mandatory.
- **Boundary 10 holds.** Project memory describes the *project*, never the
  people. No per-author anything.

## Consequences

- `prompt sync` and the Knowledge file stop being two stalled features and
  become two targets of one contract. That is the actual unlock.
- The architecture diagram changes: Chronicle is no longer only a sink. This
  is a real widening of the product's surface and is why it is an ADR and not
  a PR.
- We take on **vendor-format churn as an ongoing maintenance cost** — the
  hazard PHASE-0 §1.3 names for capture, now inbound *and* outbound. The
  no-op degradation rule is what keeps that cost from becoming user-visible
  breakage.
- We write into directories we do not own. The marker rule is what makes that
  defensible: we only ever overwrite our own output.
- A new consent gate exists (delivery). PHASE-0 §14 must be amended when this
  is accepted; leaving the gate list stale is how ADR-0015 happened.
- **The Phase-2 line moves.** Knowledge was scheduled behind the v0.1 gate.
  Accepting this is a scope decision, not a technicality, and it should be
  taken together with the outstanding question of whether the architecture
  freeze still means anything (five ADRs have superseded it since "MVP
  complete").

## Alternatives rejected

- **An encoded/encrypted `.gigai` file.** Unreviewable auto-loaded input is a
  prompt-injection channel; "encryption all models understand" is not
  encryption; and it costs tokens rather than saving them. The 98.3% win is
  available in plain English. Rejected on security grounds first.
- **A new file extension nothing reads.** Requires the ecosystem to adopt us
  before we deliver any value. Rejected.
- **Auto-writing on every capture.** Turns a consent act into a background
  side effect, and churns the user's files under them. Rejected.
- **Filing target formats in CAPTURE-SURFACES.** That document audits
  *observation*; delivery is a different act with a different risk model.
  Rejected in favor of a dedicated audit.
- **Do nothing; tell users to write `CLAUDE.md` by hand.** Honest, and the
  status quo — but it wastes the one asset Chronicle has that a hand-written
  file cannot: the actual journey. Rejected.

## Open questions (for the implementing ADR)

1. **Selection rules.** What earns a place in project memory, and what is the
   size budget? This is the whole feature; it deserves its own decision — and
   it is now a question about *ranking known facts*, not about writing prose,
   because §4 forbids the latter.
2. **Staleness.** A projection of a moving journey goes out of date. Regenerate
   on a hook, or report drift and let the user run it?
3. **Region vs whole file.** Own an entire `CLAUDE.md`, or a marked region
   inside the user's? The marker rule permits only the former today.
4. **Conflict shape.** Two teammates regenerate and both commit — what does the
   merge look like? (§7.3's "small and rarely touched" reasoning may not hold.)
