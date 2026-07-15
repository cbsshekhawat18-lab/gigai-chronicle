import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type BlobRef } from "@gigaichronicle/schema";
import { EventLog, SPILL_THRESHOLD_BYTES, readBlob, blobDirFor } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-blobs-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("blob spill-over (§7.2 rule 5, ADR-0007)", () => {
  it("spills >64KB text to a content-addressed sidecar and round-trips it", async () => {
    const dir = tempDir();
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const session = newId("session");
    const giant = "x".repeat(SPILL_THRESHOLD_BYTES + 1);
    await log.append([promptEvent(session, giant)]);

    const scanned = [];
    for await (const entry of log.scan({ session })) scanned.push(entry);
    await log.close();

    const payload = scanned[0]?.event.payload as { text: string | BlobRef };
    expect(typeof payload.text).toBe("object");
    const ref = payload.text as BlobRef;
    expect(ref.$blob).toMatch(/^sha256-[0-9a-f]{64}$/);

    // Event file stays small and greppable (size discipline).
    const eventFile = path.join(dir, ...(scanned[0]?.file ?? "").split("/"));
    expect(statSync(eventFile).size).toBeLessThan(4096);

    // Sidecar lives next to the stream and round-trips with hash check.
    const blobDir = blobDirFor(eventFile);
    expect(readdirSync(blobDir)).toHaveLength(1);
    await expect(readBlob(blobDir, ref)).resolves.toBe(giant);
  });

  it("keeps small payloads inline and identical content deduplicates", async () => {
    const dir = tempDir();
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const session = newId("session");
    const giant = "y".repeat(SPILL_THRESHOLD_BYTES + 1);
    await log.append([
      promptEvent(session, "small stays inline"),
      promptEvent(session, giant),
      promptEvent(session, giant), // same content → same blob file
    ]);
    let file = "";
    for await (const entry of log.scan({ session })) file = entry.file;
    await log.close();

    const eventFile = path.join(dir, ...file.split("/"));
    const lines = readFileSync(eventFile, "utf8").trim().split("\n");
    expect(lines[0]).toContain("small stays inline");
    expect(readdirSync(blobDirFor(eventFile))).toHaveLength(1); // deduplicated
  });

  it("detects blob corruption on read (content addressing is the integrity check)", async () => {
    const dir = tempDir();
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const session = newId("session");
    const giant = "z".repeat(SPILL_THRESHOLD_BYTES + 1);
    await log.append([promptEvent(session, giant)]);
    let scannedFile = "";
    let ref: BlobRef | undefined;
    for await (const entry of log.scan({ session })) {
      scannedFile = entry.file;
      ref = (entry.event.payload as { text: BlobRef }).text;
    }
    await log.close();

    const blobDir = blobDirFor(path.join(dir, ...scannedFile.split("/")));
    const blobFile = path.join(blobDir, `${ref?.$blob}.md`);
    rmSync(blobFile);
    appendCorrupt(blobFile);
    await expect(readBlob(blobDir, ref as BlobRef)).rejects.toThrow(/integrity/);
  });
});

function appendCorrupt(file: string): void {
  // Recreate with different content than the hash names.
  writeFileSync(file, "tampered", "utf8");
}
