/**
 * `chronicle doctor` — the trust anchor (ARCHITECTURE.md §14): log
 * integrity, index freshness, retroactive secret audit, and the provable
 * zero-egress report. The report is machine-readable; the CLI renders it.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceId } from "@gigaichronicle/schema";
import { EventLog, type VerifyReport } from "./store/event-log.js";
import { ChronicleIndex, type IndexFreshness } from "./index-db/chronicle-index.js";
import { INDEX_SCHEMA_VERSION } from "./index-db/ddl.js";
import { detectSecretKinds } from "./redaction/patterns.js";

export interface SecretFinding {
  /** Stream file (relative) and event id — NEVER the secret content. */
  file: string;
  eventId: string;
  kinds: string[];
}

export interface DoctorReport {
  ok: boolean;
  store: VerifyReport;
  index: IndexFreshness & { schemaVersion: number; reindexed: boolean };
  /**
   * The zero-egress proof (§2 law 7): every network destination Chronicle is
   * configured to talk to. Empty until the user explicitly configures the
   * optional cloud (Phase 4).
   */
  egress: {
    endpoints: string[];
    telemetry: "none";
    verdict: "zero-network" | "configured-egress";
  };
  secrets?: { eventsScanned: number; findings: SecretFinding[] };
}

export interface DoctorOptions {
  workspaceId: WorkspaceId;
  reindex?: boolean;
  scanSecrets?: boolean;
}

export async function runDoctor(
  chronicleDir: string,
  options: DoctorOptions,
): Promise<DoctorReport> {
  const log = await EventLog.open(chronicleDir, {
    workspaceId: options.workspaceId,
    fsyncIntervalMs: 0,
  });
  try {
    const store = await log.verify();

    const index = ChronicleIndex.open(chronicleDir);
    let reindexed = false;
    try {
      if (options.reindex === true) {
        await index.rebuild(log);
        reindexed = true;
      } else {
        await index.catchUp(log);
      }
      const freshness = await index.freshness(log);

      const egress = await egressReport(chronicleDir);

      let secrets: DoctorReport["secrets"];
      if (options.scanSecrets === true) {
        secrets = await scanSecrets(log);
      }

      const ok =
        store.problems.length === 0 && freshness.fresh && (secrets?.findings.length ?? 0) === 0;
      return {
        ok,
        store,
        index: { ...freshness, schemaVersion: INDEX_SCHEMA_VERSION, reindexed },
        egress,
        ...(secrets !== undefined ? { secrets } : {}),
      };
    } finally {
      index.close();
    }
  } finally {
    await log.close();
  }
}

/** Derived from configuration only — there is nothing else that can talk. */
async function egressReport(chronicleDir: string): Promise<DoctorReport["egress"]> {
  const endpoints: string[] = [];
  try {
    const raw = await readFile(path.join(chronicleDir, "config.json"), "utf8");
    const config = JSON.parse(raw) as { sync?: { mode?: string; url?: string } };
    if (config.sync !== undefined && config.sync.mode !== undefined && config.sync.mode !== "off") {
      endpoints.push(config.sync.url ?? `sync:${config.sync.mode}`);
    }
  } catch {
    // No config yet (pre-init store) — nothing can be configured to egress.
  }
  return {
    endpoints,
    telemetry: "none",
    verdict: endpoints.length === 0 ? "zero-network" : "configured-egress",
  };
}

/** Retroactive audit: inline string payload fields vs the pattern pack. */
async function scanSecrets(log: EventLog): Promise<NonNullable<DoctorReport["secrets"]>> {
  const findings: SecretFinding[] = [];
  let eventsScanned = 0;
  for await (const { event, file } of log.scan({ visibility: "all" })) {
    eventsScanned += 1;
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null) continue;
    const kinds = new Set<string>();
    for (const value of Object.values(payload as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      for (const kind of detectSecretKinds(value)) kinds.add(kind);
    }
    if (kinds.size > 0) {
      findings.push({ file, eventId: event.id, kinds: [...kinds].sort() });
    }
  }
  return { eventsScanned, findings };
}
