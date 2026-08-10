# Project Memory

Git remembers **what changed**. Chronicle events remember **what was asked**.
**Project Memory** remembers **what the project knows** — the decisions, the
constraints, what's currently true, what failed before, and what's still
unfinished — so any AI agent can pick up the work without the developer
re-explaining it.

Project Memory is **derived, not authored**: it is distilled from Chronicle's
immutable event history and can be rebuilt from it at any time. It never becomes
a second source of truth.

```
AI Providers → Chronicle Events → Memory Engine → Project Memory → Context Engine → AI Agent
   (capture)      (what was asked)   (derive)        (what we know)   (what's relevant)  (continues)
```

## Principles

- **Derived + rebuildable.** `chronicle memory rebuild` regenerates everything
  from events. Deleting derived memory never loses history.
- **Deterministic.** No LLM, no network, no embeddings. Every item comes from an
  explicit textual signal matched by an auditable regex.
- **Provenance-first.** Every item traces to the event(s) it came from. There is
  no unexplained memory.
- **Honest.** A conversational "maybe use X" is a low-confidence *proposal*, not
  a decision. Two firm decisions that disagree become a *conflict*, never a
  silently-picked winner. Nothing is ever deleted — only superseded.
- **Local-first & private.** Memory derived from a `local`-visibility event never
  enters the shared, git-tracked store.

## The data model

A `MemoryItem` (`packages/core/src/memory/schema.ts`):

| field | meaning |
|---|---|
| `id` | `mem_<12 hex>` — **derived** from `kind` + normalized `content`, so rebuild is idempotent and duplicates collapse |
| `kind` | one of 15: `project, architecture, decision, constraint, requirement, current_work, todo, known_issue, completed_work, failed_approach, important_file, integration, dependency, test_gap, handoff` |
| `status` | `candidate · active · superseded · resolved · rejected · unknown` |
| `factType` | evidence strength: `fact · decision · proposal · requirement · constraint · hypothesis · rejected · unknown` |
| `confidence` | 0–1, scored by who said it (human > agent) and how firmly |
| `sourceRefs` | **required, non-empty** — the `{session, event}` provenance |
| `relatedFiles / relatedEvents / relatedSessions` | links |
| `supersedes / supersededBy` | the temporal chain |
| `visibility` | `shared` (git-tracked) or `local` (never leaves the machine) |

## Lifecycle & temporal state

History is immutable, so decisions are never deleted:

```
decided: MySQL      → active
later: PostgreSQL   → active; MySQL becomes superseded (supersededBy → PostgreSQL)
"instead of Redis"  → Redis becomes a failed_approach (rejected)
```

A later **firm** decision supersedes an earlier decision *or proposal* on the
same subject. An explicit rejection ("instead of X", "dropped X") retires the
technology it names. The Context Engine then shows current state separately from
superseded/failed approaches so a new agent never treats stale as live.

## Confidence & evidence order

Preferred evidence, strongest first: explicit developer decision → accepted
decision → confirmed implementation → documentation → repeated conversation →
single statement → speculation. When uncertain, the item is a low-confidence
proposal or a conflict — never invented certainty.

## Storage

```
.chronicle/
├── sessions/            # the event history (source of truth)
├── memory/<kind>/<id>.md   # SHARED derived memory — git-tracked, diffable
└── .local/memory/…         # LOCAL derived memory — git-ignored, never pushed
```

Files are curated Markdown (line-based frontmatter, no YAML dependency), so they
diff cleanly and travel with the repo by `git clone`.

## Rebuild & incremental

- `chronicle memory rebuild` — clear + re-derive + persist. Idempotent: unchanged
  history yields byte-identical files (deterministic ids).
- Read commands (`list`, `search`, `show`, `stats`) project the persisted store;
  `conflicts`/`verify` re-derive for live integrity. `project context` /
  `bootstrap` read the store and fall back to deriving fresh when it's empty.

## CLI

```
chronicle memory rebuild            # derive + persist from events
chronicle memory list [--type ...]  # project the store (with provenance)
chronicle memory search <query>
chronicle memory show <id>
chronicle memory conflicts          # unresolved decision standoffs
chronicle memory verify             # schema, provenance, secret-leakage, refs
chronicle memory stats              # local diagnostics (no telemetry)
```

`--json` on every read command; `--include-local` is an owner-only read.

See also: [context-engine.md](context-engine.md), [ai-continuity.md](ai-continuity.md).
