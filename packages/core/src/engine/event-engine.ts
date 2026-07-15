/**
 * The Event Engine — the only door into the store (ARCHITECTURE.md §9).
 *
 * Providers hand raw candidates to `emit()`; four stages run in a fixed
 * order — VALIDATE → REDACT → ENRICH → NORMALIZE — and only then does the
 * event reach the EventLog. Guarantees:
 *
 *  - nothing reaches disk unredacted (stage 2 runs before any write);
 *  - nothing invalid is stored (normalize + the store's own validation);
 *  - a candidate the engine cannot accept becomes a CaptureGap — `emit`
 *    never throws on candidate data (design law 8: capture failures must
 *    never break the developer's workflow).
 */
import {
  CORE_EVENTS,
  isCoreEventType,
  isExtEventType,
  isId,
  newId,
  parseChronicleEvent,
  TIMESTAMP_REGEX,
  type Actor,
  type ChronicleEvent,
  type EventId,
  type SessionId,
  type Visibility,
  type WorkspaceId,
} from "@gigaichronicle/schema";
import path from "node:path";
import { EventLog } from "../store/event-log.js";
import { createRedactor, type Redactor } from "../redaction/redact.js";
import { harvestEnvValues } from "../redaction/env-harvest.js";
import { createGitReader, type GitReader } from "../git/git-reader.js";

/** What a provider is allowed to say about a moment. Everything else is stamped. */
export interface RawCandidate {
  /** Core PascalCase type or `Ext.<providerId>.<Name>`. */
  type: string;
  payload: unknown;
  session?: SessionId;
  /** Who caused it; defaults to the capturing agent. */
  actor?: Partial<Actor>;
  /** Occurred-at, if the tool reports one; else the engine stamps now. */
  ts?: string;
  /** Defaults to the registry's per-type visibility (Ext defaults shared). */
  visibility?: Visibility;
}

export type EmitResult =
  | { accepted: true; eventId: EventId }
  | { accepted: false; reason: string; gapEventId: EventId | null };

export interface ProviderIdentity {
  id: string;
  version: string;
}

export interface EventEngineOptions {
  workspaceId: WorkspaceId;
  provider: ProviderIdentity;
  /** Injectable for tests/determinism; defaults to the workspace's repo. */
  gitReader?: GitReader;
  /** Extra env-secret literals (tests); merged with the workspace harvest. */
  extraEnvValues?: readonly string[];
  fsyncIntervalMs?: number;
}

/** Candidates above this size become CaptureGaps (abuse guard; blob spill handles big text fields). */
export const MAX_CANDIDATE_BYTES = 1024 * 1024;

export class EventEngine {
  readonly #log: EventLog;
  readonly #redactor: Redactor;
  readonly #git: GitReader;
  readonly #workspaceId: WorkspaceId;
  readonly #providerRef: string;

  private constructor(
    log: EventLog,
    redactor: Redactor,
    git: GitReader,
    options: EventEngineOptions,
  ) {
    this.#log = log;
    this.#redactor = redactor;
    this.#git = git;
    this.#workspaceId = options.workspaceId;
    this.#providerRef = `${options.provider.id}@${options.provider.version}`;
  }

  static async open(chronicleDir: string, options: EventEngineOptions): Promise<EventEngine> {
    const log = await EventLog.open(chronicleDir, {
      workspaceId: options.workspaceId,
      ...(options.fsyncIntervalMs !== undefined
        ? { fsyncIntervalMs: options.fsyncIntervalMs }
        : {}),
    });
    const workspaceRoot = path.dirname(chronicleDir);
    const envValues = [...(await harvestEnvValues(workspaceRoot)), ...(options.extraEnvValues ?? [])];
    const redactor = createRedactor(envValues);
    const git = options.gitReader ?? createGitReader(workspaceRoot);
    return new EventEngine(log, redactor, git, options);
  }

  /** The pipeline. Never throws on candidate data. */
  async emit(candidate: RawCandidate): Promise<EmitResult> {
    // ---- stage 1: VALIDATE --------------------------------------------
    const shapeIssue = this.#validate(candidate);
    if (shapeIssue !== null) return this.#gap(candidate, shapeIssue);

    // ---- stage 2: REDACT (before anything can reach disk) --------------
    const payload = this.#redactor.redactDeep(candidate.payload);

    // ---- stage 3: ENRICH ----------------------------------------------
    const git = await this.#git.snapshot();
    const ts = candidate.ts !== undefined ? candidate.ts : canonicalNow();
    const actor: Actor = {
      kind: candidate.actor?.kind ?? "agent",
      ...(candidate.actor?.provider !== undefined || candidate.actor?.kind !== "human"
        ? { provider: candidate.actor?.provider ?? this.#providerRef.split("@")[0] }
        : {}),
      ...(candidate.actor?.model !== undefined ? { model: candidate.actor.model } : {}),
    };

    // ---- stage 4: NORMALIZE -------------------------------------------
    const normalized = this.#normalize(candidate, payload, ts, actor, git);
    if (typeof normalized === "string") return this.#gap(candidate, normalized);

    try {
      await this.#log.append([normalized]);
      return { accepted: true, eventId: normalized.id as EventId };
    } catch (error) {
      // Store-level rejection (should be unreachable: normalize validated).
      return this.#gap(candidate, `store rejected event: ${(error as Error).message}`);
    }
  }

  /** Convenience path for tier changes (§4): records CaptureDegraded (local). */
  async reportDegraded(fromTier: number, toTier: number, reason: string): Promise<EmitResult> {
    return this.emit({
      type: "CaptureDegraded",
      actor: { kind: "system" },
      payload: {
        provider: this.#providerRef.split("@")[0],
        fromTier,
        toTier,
        reason,
      },
    });
  }

  async flush(): Promise<void> {
    await this.#log.flush();
  }

  async close(): Promise<void> {
    await this.#log.close();
  }

  // ---------------------------------------------------------------- private

  #validate(candidate: RawCandidate): string | null {
    if (typeof candidate !== "object" || candidate === null) return "candidate is not an object";
    if (typeof candidate.type !== "string" || candidate.type.length === 0) {
      return "candidate.type missing";
    }
    if (candidate.session !== undefined && !isId(candidate.session, "session")) {
      return "candidate.session is not a session id";
    }
    if (candidate.ts !== undefined && !TIMESTAMP_REGEX.test(candidate.ts)) {
      const coerced = coerceTimestamp(candidate.ts);
      if (coerced === null) return `candidate.ts is not a timestamp: ${String(candidate.ts)}`;
      candidate.ts = coerced;
    }
    try {
      const size = Buffer.byteLength(JSON.stringify(candidate.payload) ?? "", "utf8");
      if (size > MAX_CANDIDATE_BYTES) return `payload exceeds ${MAX_CANDIDATE_BYTES} bytes`;
    } catch {
      return "payload is not serializable";
    }
    return null;
  }

  #normalize(
    candidate: RawCandidate,
    payload: unknown,
    ts: string,
    actor: Actor,
    git: ChronicleEvent["git"],
  ): ChronicleEvent | string {
    const isCore = isCoreEventType(candidate.type);
    if (!isCore && !isExtEventType(candidate.type)) {
      return `unknown event type "${candidate.type}" (core types are fixed; provider moments belong under Ext.<provider>.*)`;
    }
    const definition = isCore ? CORE_EVENTS[candidate.type as keyof typeof CORE_EVENTS] : null;
    const schemaVersion = definition?.payloadVersion ?? 1;
    const visibility = candidate.visibility ?? definition?.defaultVisibility ?? "shared";

    const event = {
      v: 1,
      id: newId("event"),
      ts,
      type: candidate.type,
      ...(candidate.session !== undefined ? { session: candidate.session } : {}),
      actor,
      git,
      payload,
      meta: {
        provider: this.#providerRef,
        workspace: this.#workspaceId,
        schema: `${candidate.type}/${schemaVersion}`,
        visibility,
      },
    } as unknown as ChronicleEvent;

    const verdict = parseChronicleEvent(event);
    if (!verdict.ok) return `${verdict.code}: ${verdict.message}`;
    return verdict.event;
  }

  /** Honesty on failure: the drop is recorded, the reason carries NO payload content. */
  async #gap(candidate: RawCandidate, reason: string): Promise<EmitResult> {
    const gap = {
      v: 1,
      id: newId("event"),
      ts: canonicalNow(),
      type: "CaptureGap",
      ...(isId(candidate.session, "session") ? { session: candidate.session } : {}),
      actor: { kind: "system" },
      git: { head: null, branch: null, dirty: [] },
      payload: {
        reason: "unparseable-candidate",
        detail: `provider ${this.#providerRef}, candidate type "${truncate(String(candidate?.type))}": ${truncate(reason)}`,
      },
      meta: {
        provider: this.#providerRef,
        workspace: this.#workspaceId,
        schema: "CaptureGap/1",
        visibility: "shared",
      },
    } as unknown as ChronicleEvent;
    try {
      await this.#log.append([gap]);
      return { accepted: false, reason, gapEventId: gap.id as EventId };
    } catch {
      // Even gap recording must never throw into the provider's process.
      return { accepted: false, reason, gapEventId: null };
    }
  }
}

function canonicalNow(): string {
  return new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
}

function coerceTimestamp(value: string): string | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
}

function truncate(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
