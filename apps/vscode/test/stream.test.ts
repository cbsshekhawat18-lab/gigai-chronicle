/**
 * Stream projection — folding frames into delta entries, and merging real git
 * activity into the Commits/Files tabs (no provider emits git/file events, so
 * the dashboard sources them from history and injects them here).
 */
import { describe, expect, it } from "vitest";
import type { ReplayFrame } from "@gigaichronicle/core";
import { buildStream, mergeGitActivity, type StreamEntry } from "../src/stream.js";

/** A minimal frame carrying just what buildStream reads. */
function frame(over: Partial<ReplayFrame> & { ts: string }): ReplayFrame {
  return {
    at: "evt_x" as ReplayFrame["at"],
    index: 0,
    title: null,
    startedTs: null,
    endedTs: null,
    endedReason: null,
    conversation: [],
    workingSet: [],
    tools: [],
    git: { branch: null, head: null, commits: [] },
    gaps: [],
    fidelity: "full",
    ...over,
  } as ReplayFrame;
}

describe("mergeGitActivity", () => {
  it("injects commit + file entries in time order and regenerates day separators", () => {
    // One human turn on Jul 20; a commit + file land Jul 21.
    const frames: ReplayFrame[] = [
      frame({
        ts: "2026-07-20T10:00:00.000Z",
        startedTs: "2026-07-20T10:00:00.000Z",
        conversation: [{ role: "human", text: "do the thing", eventId: "evt_a" }] as ReplayFrame["conversation"],
      }),
    ];
    const base = buildStream(frames);

    const merged = mergeGitActivity(base, {
      commits: [{ sha: "abc1234", subject: "ship it", ts: "2026-07-21T09:00:00.000Z" }],
      files: [{ path: "src/app.ts", status: "modified", ts: "2026-07-21T09:00:00.000Z" }],
    });

    const kinds = merged.map((e) => e.kind);
    // Two distinct days → two day separators; commit + file present.
    expect(kinds.filter((k) => k === "day")).toHaveLength(2);
    expect(kinds).toContain("commit");
    expect(kinds).toContain("file");

    // Chronological: the Jul-20 turn precedes the Jul-21 commit/file.
    const turnAt = merged.findIndex((e) => e.kind === "turn");
    const commitAt = merged.findIndex((e) => e.kind === "commit");
    expect(turnAt).toBeGreaterThanOrEqual(0);
    expect(commitAt).toBeGreaterThan(turnAt);

    const commit = merged.find((e): e is Extract<StreamEntry, { kind: "commit" }> => e.kind === "commit");
    expect(commit).toMatchObject({ sha: "abc1234", subject: "ship it" });
  });

  it("is a no-op when there is no git activity", () => {
    const frames = [frame({ ts: "2026-07-20T10:00:00.000Z", startedTs: "2026-07-20T10:00:00.000Z" })];
    const base = buildStream(frames);
    expect(mergeGitActivity(base, { commits: [], files: [] })).toBe(base);
  });
});
