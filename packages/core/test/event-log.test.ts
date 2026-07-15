import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId, parseChronicleEventLine, idTime } from "@gigaichronicle/schema";
import { EventLog, ChronicleError } from "../src/index.js";
import {
  WORKSPACE,
  commitEvent,
  degradedEvent,
  makeTempChronicleDir,
  promptEvent,
} from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir();
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function openLog(dir: string): Promise<EventLog> {
  return EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
}

describe("EventLog append/scan round-trip", () => {
  it("writes session events to sessions/YYYY/MM/<ses>.jsonl and reads them back", async () => {
    const dir = tempDir();
    const log = await openLog(dir);
    const session = newId("session");
    const events = [promptEvent(session), promptEvent(session, "second prompt")];
    await log.append(events);

    const scanned = [];
    for await (const { event, file } of log.scan()) scanned.push({ event, file });
    await log.close();

    expect(scanned.map((s) => s.event.id)).toEqual(events.map((e) => e.id));
    const month = new Date(idTime(session));
    const expectedFile = `sessions/${month.getUTCFullYear()}/${String(month.getUTCMonth() + 1).padStart(2, "0")}/${session}.jsonl`;
    expect(scanned[0]?.file).toBe(expectedFile);
  });

  it("routes by visibility and session: ops stream, ambient stream (ADR-0007)", async () => {
    const dir = tempDir();
    const log = await openLog(dir);
    await log.append([commitEvent(), degradedEvent()]);
    await log.close();

    const sessionsFiles = readdirSync(path.join(dir, "sessions"), { recursive: true }) as string[];
    expect(sessionsFiles.some((f) => f.toString().includes(`amb_${WORKSPACE}.jsonl`))).toBe(true);
    const opsFiles = readdirSync(path.join(dir, ".local", "ops"), { recursive: true }) as string[];
    expect(opsFiles.some((f) => f.toString().endsWith("ops.jsonl"))).toBe(true);
  });

  it("scan filters by visibility, session, and inclusive ts range", async () => {
    const dir = tempDir();
    const log = await openLog(dir);
    const sessionA = newId("session");
    const sessionB = newId("session");
    const a1 = promptEvent(sessionA);
    const a2 = promptEvent(sessionA);
    const b1 = promptEvent(sessionB);
    await log.append([a1, a2, b1, degradedEvent()]);

    const onlyA = [];
    for await (const { event } of log.scan({ session: sessionA })) onlyA.push(event.id);
    expect(onlyA).toEqual([a1.id, a2.id]);

    const ranged = [];
    for await (const { event } of log.scan({ from: a2.ts, to: a2.ts, session: sessionA })) {
      ranged.push(event.id);
    }
    expect(ranged).toEqual([a2.id]);

    const locals = [];
    for await (const { event } of log.scan({ visibility: "local" })) locals.push(event.type);
    expect(locals).toEqual(["CaptureDegraded"]);
    await log.close();
  });

  it("stored files are plain JSONL: every line parses with JSON.parse and the spec parser", async () => {
    const dir = tempDir();
    const log = await openLog(dir);
    const session = newId("session");
    await log.append([promptEvent(session), commitEvent(), degradedEvent()]);
    await log.close();

    const jsonlFiles: string[] = [];
    for (const root of ["sessions", ".local/ops"]) {
      for (const entry of readdirSync(path.join(dir, root), {
        recursive: true,
      }) as string[]) {
        if (entry.toString().endsWith(".jsonl")) {
          jsonlFiles.push(path.join(dir, root, entry.toString()));
        }
      }
    }
    expect(jsonlFiles.length).toBe(3);
    for (const file of jsonlFiles) {
      const lines = readFileSync(file, "utf8").trim().split("\n");
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow(); //  cat + jq readable
        expect(parseChronicleEventLine(line).ok).toBe(true); // spec-valid (DoD #4)
      }
    }
  });

  it("refuses invalid events with E_INVALID_EVENT (never writes them)", async () => {
    const dir = tempDir();
    const log = await openLog(dir);
    const broken = { ...promptEvent(newId("session")), payload: {} };
    await expect(log.append([broken])).rejects.toMatchObject({
      name: "ChronicleError",
      code: "E_INVALID_EVENT",
    });
    await log.close();
  });

  it("open on a missing directory is E_NOT_INITIALIZED", async () => {
    await expect(
      EventLog.open(path.join(tempDir(), "nope"), { workspaceId: WORKSPACE }),
    ).rejects.toMatchObject({ code: "E_NOT_INITIALIZED" });
  });

  it("exposes exactly three log operations (append, scan, verify)", async () => {
    const logOps = Object.getOwnPropertyNames(EventLog.prototype).filter(
      (name) => !["constructor", "flush", "close"].includes(name),
    );
    expect(logOps.sort()).toEqual(["append", "scan", "verify"]);
    void (await Promise.resolve()); // satisfy async signature symmetry
  });
});
