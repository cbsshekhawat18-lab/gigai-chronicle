/**
 * The Memory Engine — deterministically DERIVE Project Memory from the event
 * history (docs/project-memory.md §12–13). No LLM, no network: every item comes
 * from an explicit textual signal in a captured prompt or response, mapped to a
 * memory kind by an auditable regex, and carries provenance back to its event.
 *
 * Pipeline: scan → classify (rules) → score confidence (who said it, how firmly)
 * → dedup (deterministic id) → resolve temporal state (a later firm decision
 * supersedes an earlier one on the same subject; an explicit rejection retires
 * the approach it names) → detect unresolved conflicts. The result is
 * idempotent: the same history always yields the same items and ids.
 *
 * Honesty (§7): a conversational "maybe we should use X" becomes a low-confidence
 * PROPOSAL, never a decision. When two firm decisions collide and neither clearly
 * supersedes the other, we record a CONFLICT rather than inventing a winner.
 */
import { changesByPrompt } from "../attribution/why.js";
import type { EventLog } from "../store/event-log.js";
import { resolveEventText } from "../knowledge/knowledge.js";
import {
  MEMORY_SCHEMA_VERSION,
  memoryId,
  type FactType,
  type MemoryItem,
  type MemoryKind,
  type MemorySource,
  type MemoryVisibility,
} from "./schema.js";
import { clearMemory, writeMemory } from "./store.js";

const TEXT_TYPES = new Set(["PromptSubmitted", "PromptEdited", "AIResponseReceived"]);

interface Rule {
  kind: MemoryKind;
  factType: FactType;
  /** Base confidence before role/firmness adjustment. */
  base: number;
  re: RegExp;
  /** Names a REJECTED approach — the rejected technology is read after the match. */
  rejects?: true;
  /** Only fire when the line also names a known technology (avoids "using the old file"). */
  requiresTech?: true;
}

/**
 * Ordered rules — first match on a line wins. High-signal, explicit phrasings
 * only; the goal is an honest index, so we prefer to miss a fuzzy signal over
 * to assert a wrong one.
 */
const RULES: readonly Rule[] = [
  // --- rejections (checked first so "instead of X" isn't read as choosing X) --
  { kind: "failed_approach", factType: "rejected", base: 0.8, rejects: true, re: /\b(?:instead of|rather than)\b/i },
  { kind: "failed_approach", factType: "rejected", base: 0.8, rejects: true, re: /\b(?:not going with|no longer using|dropped|removed|rejected|reverted|abandon(?:ed)?|scrap(?:ped)?)\b/i },
  // --- decisions -----------------------------------------------------------
  { kind: "decision", factType: "decision", base: 0.85, re: /\bdecided to\b/i },
  // Narrow verbs that name a technical choice. NOT "keep" — it fires on
  // conversational "I'll keep an eye on it"; the real "keep X in Y" decision is
  // caught by the dedicated keep…in rule below.
  { kind: "decision", factType: "decision", base: 0.85, re: /\b(?:we(?:'ll| will| are going to)|let'?s|i(?:'ll| will))\s+(?:use|go with|switch to|adopt)\b/i },
  { kind: "decision", factType: "decision", base: 0.8, re: /\bgoing with\b/i },
  { kind: "decision", factType: "decision", base: 0.8, re: /\bchose\b[^.]{0,60}\bover\b/i },
  // "keep X in Y" is a decision only when Y names a technology — otherwise it's
  // conversational filler ("keep in mind", "keep that in the back of your head").
  { kind: "decision", factType: "decision", base: 0.7, requiresTech: true, re: /\bkeep\b[^.]{0,40}\bin\b/i },
  { kind: "decision", factType: "decision", base: 0.6, requiresTech: true, re: /\b(?:using|based on|built on|powered by)\b/i },
  { kind: "decision", factType: "proposal", base: 0.4, re: /\bwe should\b/i },
  { kind: "decision", factType: "proposal", base: 0.4, re: /\b(?:the (?:approach|plan|decision|design) (?:is|will be|was))\b/i },
  { kind: "decision", factType: "proposal", base: 0.3, re: /\b(?:maybe|perhaps|we could|what if|should we)\b/i },
  // --- constraints / requirements -----------------------------------------
  { kind: "constraint", factType: "constraint", base: 0.75, re: /\b(?:must not|never|do not|cannot|is not allowed|forbidden)\b/i },
  { kind: "constraint", factType: "constraint", base: 0.65, re: /\b(?:node|python|go|rust|java)\s*(?:>=|>|version)\b/i },
  { kind: "constraint", factType: "constraint", base: 0.6, re: /\b(?:must|has to|required to|needs? to)\b/i },
  { kind: "requirement", factType: "requirement", base: 0.7, re: /\b(?:requirement|acceptance criteria|the goal is)\b/i },
  // A prompt that STARTS with a build/feature verb states a requirement — "Add
  // refresh tokens", "Implement webhook retries". Anchored at the line start so
  // it doesn't fire mid-sentence; modest confidence (it's a request, not proof).
  { kind: "requirement", factType: "requirement", base: 0.5, re: /^(?:add|implement|build|create|support|introduce|set up)\b/i },
  // --- known issues --------------------------------------------------------
  { kind: "known_issue", factType: "fact", base: 0.7, re: /\b(?:bug|race condition|deadlock|regression|broken|crashes?|fails?|not working|doesn'?t work|memory leak|flaky)\b/i },
  // --- todos ---------------------------------------------------------------
  { kind: "todo", factType: "fact", base: 0.8, re: /\b(?:TODO|FIXME|XXX|HACK)\b/ },
  { kind: "todo", factType: "fact", base: 0.7, re: /\b(?:next step|revisit later|don'?t forget|remember to|still (?:need|have) to)\b/i },
];

const NEGATION = /\b(?:not|never|no longer|cannot)\b|n['’]t\b/i;

/** Common stack tokens — normalized so a decision's technology is comparable. */
const TECH = /\b(postgres(?:ql)?|mysql|sqlite|mongo(?:db)?|redis|memcached|kafka|rabbitmq|stripe|auth0|clerk|jwt|oauth2?|graphql|grpc|react|vue|svelte|nextjs|next\.js|nodejs|node\.js|deno|bun|typescript|python|golang|rust|docker|kubernetes|k8s|terraform|dynamodb)\b/gi;

const TECH_ALIASES: Record<string, string> = {
  postgresql: "postgres",
  nodejs: "node",
  nextjs: "next",
  oauth2: "oauth",
  k8s: "kubernetes",
  golang: "go",
  mongodb: "mongo",
};

function normTech(raw: string): string {
  const t = raw.toLowerCase().replace(/\.js$/u, "js"); // node.js → nodejs, next.js → nextjs
  return TECH_ALIASES[t] ?? t;
}

function techTokens(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.matchAll(TECH)) set.add(normTech(m[0]));
  return set;
}

/** The technology a rejection names — read from the window AFTER the keyword. */
function rejectedTechOf(line: string): Set<string> {
  const kw = /\b(?:instead of|rather than|not going with|no longer using|dropped|removed|rejected|reverted|abandoned|scrapped)\b/i.exec(line);
  if (kw === null) return new Set();
  const after = line.slice(kw.index + kw[0].length, kw.index + kw[0].length + 40);
  // Stop at a clause boundary so "instead of Redis, use PostgreSQL" rejects only Redis.
  const window = after.split(/[,.;]|\buse\b|\bgo with\b|\bwe\b/i)[0] ?? after;
  return techTokens(window);
}

const STOPWORDS = new Set([
  "the", "a", "an", "for", "to", "of", "in", "on", "and", "or", "we", "i", "use",
  "using", "with", "as", "is", "will", "be", "our", "this", "that", "it", "lets",
  "go", "keep", "should", "state", "primary", "no", "not", "now", "here", "add",
  "build", "make", "set", "up", "into", "from", "but", "all", "after",
]);

/** Significant nouns of a line — its "subject", for grouping related decisions. */
function subjectKey(line: string): Set<string> {
  const words = line
    .toLowerCase()
    .replace(TECH, " ") // technology is compared separately
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .map((w) => w.replace(/s$/u, "")) // crude singularization
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** True when one subject is a subset of (or equal to) the other — a precise
 *  "same subject" test, so two decisions that merely share one noun ("storage")
 *  are NOT treated as the same subject. */
function subsetOrEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

function clamp(line: string, max: number): string {
  const flat = line.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface Candidate {
  kind: MemoryKind;
  factType: FactType;
  confidence: number;
  content: string;
  subject: Set<string>;
  tech: Set<string>;
  rejectTech: Set<string>;
  role: "human" | "agent";
  source: MemorySource;
  ts: string;
  visibility: MemoryVisibility;
}

export interface BuildMemoryOptions {
  /** Also derive LOCAL memory from local-visibility events (owner-only read). */
  includeLocal?: boolean;
  /** Repo root — when set, each item's `relatedFiles` is populated from the
   *  checkpoint attribution of its source events, so file-scoped intelligence is
   *  precise (a decision attaches to the files its turn changed, not to every
   *  file its session touched). One git pass; skipped when omitted. */
  repoRoot?: string;
}

/** Two firm active decisions that disagree and neither supersedes the other. */
export interface MemoryConflict {
  kind: MemoryKind;
  subject: string;
  a: { id: string; title: string };
  b: { id: string; title: string };
}

export interface MemoryBuildResult {
  items: MemoryItem[];
  conflicts: MemoryConflict[];
}

/** A firm human decision outweighs a tentative agent aside. */
function score(base: number, role: "human" | "agent", negated: boolean, firm: boolean): number {
  let c = base;
  c += role === "human" ? 0.1 : -0.1;
  if (!firm) c -= 0.15;
  if (negated) c -= 0.1;
  return Math.max(0.05, Math.min(0.99, Number(c.toFixed(2))));
}

/** Derive all Project Memory items from the event history (does NOT persist). */
export async function buildMemory(
  chronicleDir: string,
  log: EventLog,
  options: BuildMemoryOptions = {},
): Promise<MemoryBuildResult> {
  const candidates: Candidate[] = [];
  let latestHumanPrompt: Candidate | null = null;

  for await (const scanned of log.scan({ visibility: "all" })) {
    const event = scanned.event;
    if (!TEXT_TYPES.has(event.type)) continue;
    const visibility: MemoryVisibility = event.meta.visibility === "local" ? "local" : "shared";
    if (visibility === "local" && options.includeLocal !== true) continue;
    const body = await resolveEventText(chronicleDir, scanned);
    if (body === null) continue;
    const role: "human" | "agent" = event.type === "AIResponseReceived" ? "agent" : "human";
    const source: MemorySource = { session: event.session ?? null, event: event.id };

    if (role === "human") {
      const firstLine = body.split("\n").find((l) => l.trim().length >= 4);
      if (firstLine !== undefined) {
        latestHumanPrompt = {
          kind: "current_work",
          factType: "fact",
          confidence: 0.6,
          content: clamp(firstLine.trim(), 240),
          subject: subjectKey(firstLine),
          tech: techTokens(firstLine),
          rejectTech: new Set(),
          role,
          source,
          ts: event.ts,
          visibility,
        };
      }
    }

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (line.length < 6) continue;
      const negated = NEGATION.test(line);
      const question = line.endsWith("?");
      const tech = techTokens(line);
      for (const rule of RULES) {
        if (rule.requiresTech === true && tech.size === 0) continue;
        // A plain decision on a negated/question line isn't a commitment — only
        // the rejection rules (which expect negation) may fire there.
        if ((negated || question) && rule.rejects !== true && rule.factType === "decision") continue;
        if (!rule.re.test(line)) continue;
        const firm = rule.factType === "decision" || rule.factType === "constraint" || rule.factType === "requirement";
        candidates.push({
          kind: rule.kind,
          factType: rule.factType,
          confidence: score(rule.base, role, negated, firm),
          content: clamp(line, 240),
          subject: subjectKey(line),
          tech,
          rejectTech: rule.rejects === true ? rejectedTechOf(line) : new Set(),
          role,
          source,
          ts: event.ts,
          visibility,
        });
        break; // one signal per line
      }
    }
  }
  if (latestHumanPrompt !== null) candidates.push(latestHumanPrompt);

  const result = resolve(candidates);
  if (options.repoRoot !== undefined) await populateRelatedFiles(options.repoRoot, result.items);
  return result;
}

/** Attach each item's changed files, from the checkpoint attribution of its
 *  source events (one git pass). Makes file-scoped intelligence precise. */
async function populateRelatedFiles(repoRoot: string, items: MemoryItem[]): Promise<void> {
  const changes = await changesByPrompt(repoRoot, { limit: 2000 });
  const filesByEvent = new Map<string, string[]>();
  for (const c of changes) {
    filesByEvent.set(c.eventId, c.files.map((f) => f.path).filter((p) => !p.startsWith(".chronicle/")));
  }
  for (const item of items) {
    const files = new Set<string>();
    for (const evt of item.relatedEvents) for (const f of filesByEvent.get(evt) ?? []) files.add(f);
    item.relatedFiles = [...files].sort();
  }
}

function initialStatus(c: Candidate): MemoryStatusLite {
  if (c.kind === "failed_approach") return "rejected";
  if (c.factType === "proposal") return "candidate";
  return "active";
}
type MemoryStatusLite = MemoryItem["status"];

/** Dedup by identity, then resolve temporal state + conflicts. */
function resolve(candidates: Candidate[]): MemoryBuildResult {
  const byId = new Map<string, MemoryItem>();
  const meta = new Map<string, { subject: Set<string>; tech: Set<string>; rejectTech: Set<string>; role: "human" | "agent"; factType: FactType }>();

  for (const c of candidates) {
    const id = memoryId(c.kind, c.content);
    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, {
        id,
        schemaVersion: MEMORY_SCHEMA_VERSION,
        kind: c.kind,
        title: clamp(c.content, 80),
        content: c.content,
        status: initialStatus(c),
        factType: c.factType,
        confidence: c.confidence,
        createdAt: c.ts,
        updatedAt: c.ts,
        sourceRefs: [c.source],
        relatedFiles: [],
        relatedEvents: c.source.event !== null ? [c.source.event] : [],
        relatedSessions: c.source.session !== null ? [c.source.session] : [],
        supersedes: null,
        supersededBy: null,
        tags: [...c.tech].sort(),
        visibility: c.visibility,
      });
      meta.set(id, { subject: new Set(c.subject), tech: c.tech, rejectTech: c.rejectTech, role: c.role, factType: c.factType });
    } else {
      existing.confidence = Math.max(existing.confidence, c.confidence);
      if (c.ts > existing.updatedAt) existing.updatedAt = c.ts;
      if (c.ts < existing.createdAt) existing.createdAt = c.ts;
      if (!existing.sourceRefs.some((s) => s.event === c.source.event)) existing.sourceRefs.push(c.source);
      if (c.source.event !== null && !existing.relatedEvents.includes(c.source.event)) existing.relatedEvents.push(c.source.event);
      if (c.source.session !== null && !existing.relatedSessions.includes(c.source.session)) existing.relatedSessions.push(c.source.session);
      const m = meta.get(id);
      if (m !== undefined) {
        for (const s of c.subject) m.subject.add(s);
        for (const t of c.rejectTech) m.rejectTech.add(t);
      }
    }
  }

  const items = [...byId.values()];
  const conflicts: MemoryConflict[] = [];

  // 1) Explicit rejections retire an active decision only when it names the same
  //    technology AND shares the rejection's subject — so rejecting Redis for the
  //    rate limiter does NOT retire a valid Redis-for-sessions decision.
  const rejections = items
    .filter((it) => it.kind === "failed_approach")
    .map((it) => meta.get(it.id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)
    .map((m) => ({ tech: m.rejectTech, subject: m.subject }));
  for (const it of items) {
    if (it.kind !== "decision" || it.status !== "active") continue;
    const m = meta.get(it.id);
    if (m === undefined) continue;
    const retired = rejections.some(
      (r) => [...m.tech].some((t) => r.tech.has(t)) && subsetOrEqual(r.subject, m.subject),
    );
    if (retired) it.status = "superseded";
  }

  // 2) Temporal supersession WITHIN THE SAME SUBJECT: a later firm decision wins;
  //    an earlier decision/proposal on the same subject is superseded. Subjects
  //    must be subset-or-equal (not merely share one noun) — "user storage" and
  //    "document storage" are DIFFERENT decisions, not a supersession. A firm-vs-
  //    firm, different-tech, same-instant standoff is a CONFLICT and leaves BOTH
  //    active (we report it, we never invent a winner).
  const decisions = items
    .filter((it) => it.kind === "decision")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (let i = 0; i < decisions.length; i++) {
    const later = decisions[i] as MemoryItem;
    const lm = meta.get(later.id);
    if (lm === undefined || lm.factType !== "decision") continue; // proposals don't supersede
    for (let j = 0; j < i; j++) {
      const earlier = decisions[j] as MemoryItem;
      const em = meta.get(earlier.id);
      if (em === undefined || (earlier.status !== "active" && earlier.status !== "candidate") || later.status !== "active") continue;
      if (!subsetOrEqual(lm.subject, em.subject)) continue;
      const differentTech = lm.tech.size > 0 && em.tech.size > 0 && ![...lm.tech].some((x) => em.tech.has(x));
      const isConflict =
        differentTech && em.factType === "decision" && em.role === "human" && lm.role === "human" && earlier.createdAt === later.createdAt;
      if (isConflict) {
        // Genuine standoff — record it, leave both active. Never pick by hash.
        conflicts.push({
          kind: "decision",
          subject: [...lm.subject].sort().join(" ") || "(unknown)",
          a: { id: earlier.id, title: earlier.title },
          b: { id: later.id, title: later.title },
        });
        continue;
      }
      earlier.status = "superseded";
      earlier.supersededBy = later.id;
      later.supersedes = earlier.id;
    }
  }

  items.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
  return { items, conflicts };
}

/**
 * Rebuild the persisted memory store from the event history: clear the derived
 * files, re-derive, and write them back. Idempotent — unchanged history yields
 * byte-identical files. The event history (the source of truth) is untouched.
 */
export async function rebuildMemory(
  chronicleDir: string,
  log: EventLog,
  options: BuildMemoryOptions = {},
): Promise<MemoryBuildResult> {
  const result = await buildMemory(chronicleDir, log, options);
  await clearMemory(chronicleDir, { includeLocal: options.includeLocal === true });
  for (const item of result.items) await writeMemory(chronicleDir, item);
  return result;
}
