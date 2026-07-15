import { appendFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventLog, runDoctor } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-doctor-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seed(dir: string, texts: string[]): Promise<void> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const session = newId("session");
  await log.append(texts.map((text) => promptEvent(session, text)));
  await log.close();
}

describe("runDoctor — the trust anchor", () => {
  it("healthy store: ok, fresh index, zero-network verdict", async () => {
    const dir = tempDir();
    await seed(dir, ["hello journey"]);
    const report = await runDoctor(dir, { workspaceId: WORKSPACE });
    expect(report.ok).toBe(true);
    expect(report.store.problems).toEqual([]);
    expect(report.index).toMatchObject({ fresh: true, eventsIndexed: 1, reindexed: false });
    expect(report.egress).toEqual({
      endpoints: [],
      telemetry: "none",
      verdict: "zero-network",
    });
  });

  it("--scan-secrets finds a planted unredacted token — reporting kind, never content", async () => {
    const dir = tempDir();
    // AWS's own documented EXAMPLE key — synthetic by definition (SECURITY.md).
    const planted = "use key AKIAIOSFODNN7EXAMPLE for the demo";
    await seed(dir, ["clean prompt", planted]);

    const report = await runDoctor(dir, { workspaceId: WORKSPACE, scanSecrets: true });
    expect(report.ok).toBe(false);
    expect(report.secrets?.eventsScanned).toBe(2);
    expect(report.secrets?.findings).toHaveLength(1);
    expect(report.secrets?.findings[0]?.kinds).toEqual(["aws-access-key-id"]);

    // The report must be safe to print/share: the secret itself never appears.
    expect(JSON.stringify(report)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("heals a torn stream via verify and reports it; --reindex rebuilds", async () => {
    const dir = tempDir();
    await seed(dir, ["one", "two"]);
    const sessionsDir = path.join(dir, "sessions");
    const monthDirs = readdirSync(sessionsDir, { recursive: true }) as string[];
    const streamRel = monthDirs.map(String).find((f) => f.endsWith(".jsonl")) as string;
    appendFileSync(path.join(sessionsDir, streamRel), '{"torn":');

    const report = await runDoctor(dir, { workspaceId: WORKSPACE, reindex: true });
    expect(report.store.healed).toHaveLength(1);
    expect(report.index.reindexed).toBe(true);
    // Post-heal the index is fresh over log + gap event.
    expect(report.index.fresh).toBe(true);
    expect(report.index.eventsInLog).toBe(3); // two prompts + the CaptureGap
    expect(report.ok).toBe(true); // healed ≠ unhealthy; problems would be
  });

  it("configured egress flips the verdict (the report cannot lie by omission)", async () => {
    const dir = tempDir();
    await seed(dir, ["x"]);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ sync: { mode: "cloud", url: "https://example.invalid" } }),
    );
    const report = await runDoctor(dir, { workspaceId: WORKSPACE });
    expect(report.egress.verdict).toBe("configured-egress");
    expect(report.egress.endpoints).toEqual(["https://example.invalid"]);
  });
});
