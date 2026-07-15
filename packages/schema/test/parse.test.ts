import { describe, expect, it } from "vitest";
import {
  ENVELOPE_VERSION,
  newId,
  parseChronicleEvent,
  parseChronicleEventLine,
  type CoreChronicleEvent,
} from "../src/index.js";

/** A minimal valid PromptSubmitted envelope, overridable per test. */
function sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    id: newId("event"),
    ts: "2026-07-14T10:32:11.412Z",
    type: "PromptSubmitted",
    session: newId("session"),
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "feat/auth", dirty: ["src/auth.ts"] },
    payload: { text: "Add refresh-token rotation to the auth middleware" },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: newId("workspace"),
      schema: "PromptSubmitted/1",
      visibility: "shared",
    },
    ...overrides,
  };
}

describe("parseChronicleEvent", () => {
  it("accepts a valid core event and narrows the payload", () => {
    const result = parseChronicleEvent(sample());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("core");
      const event = result.event as CoreChronicleEvent<"PromptSubmitted">;
      expect(event.payload.text).toContain("refresh-token");
    }
  });

  it("read-forward: newer envelope version is SCHEMA_AHEAD, not INVALID", () => {
    const result = parseChronicleEvent(sample({ v: ENVELOPE_VERSION + 1 }));
    expect(result).toMatchObject({ ok: false, code: "SCHEMA_AHEAD" });
  });

  it("read-forward: unknown fields are preserved through parsing", () => {
    const result = parseChronicleEvent(sample({ futureField: { kept: true } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.event as Record<string, unknown>)["futureField"]).toEqual({ kept: true });
    }
  });

  it("read-forward: newer payload version is tolerated, payload not falsely rejected", () => {
    const result = parseChronicleEvent(
      sample({
        payload: { text: "hi", tone: "urgent" },
        meta: {
          provider: "example-tool@1.0.0",
          workspace: newId("workspace"),
          schema: "PromptSubmitted/2",
          visibility: "shared",
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects reserved (Phase 2-3) types as UNKNOWN_TYPE", () => {
    const result = parseChronicleEvent(sample({ type: "KnowledgeExtracted" }));
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_TYPE" });
  });

  it("session binding: required means required", () => {
    const result = parseChronicleEvent(sample({ session: undefined }));
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    if (!result.ok) expect(result.message).toMatch(/requires a session/);
  });

  it("session binding: project-scoped events must not carry a session", () => {
    const result = parseChronicleEvent(
      sample({
        type: "ProjectOpened",
        payload: {},
        meta: {
          provider: "example-tool@1.0.0",
          workspace: newId("workspace"),
          schema: "ProjectOpened/1",
          visibility: "local",
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    if (!result.ok) expect(result.message).toMatch(/project-scoped/);
  });

  it("meta.schema must reference the event type", () => {
    const result = parseChronicleEvent(
      sample({
        meta: {
          provider: "example-tool@1.0.0",
          workspace: newId("workspace"),
          schema: "SomethingElse/1",
          visibility: "shared",
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("accepts extension events with opaque payloads", () => {
    const result = parseChronicleEvent(
      sample({
        type: "Ext.example-tool.CustomMoment",
        payload: { anything: [1, 2, 3] },
        meta: {
          provider: "example-tool@1.0.0",
          workspace: newId("workspace"),
          schema: "Ext.example-tool.CustomMoment/1",
          visibility: "shared",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("ext");
  });

  it("rejects malformed ext type names", () => {
    const result = parseChronicleEvent(sample({ type: "Ext.BadProvider.moment" }));
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_TYPE" });
  });

  it("never throws on garbage", () => {
    for (const garbage of [null, 42, "x", [], {}, { v: "1" }]) {
      expect(parseChronicleEvent(garbage).ok).toBe(false);
    }
  });
});

describe("parseChronicleEventLine", () => {
  it("parses a valid JSONL line", () => {
    expect(parseChronicleEventLine(JSON.stringify(sample())).ok).toBe(true);
  });

  it("reports torn/non-JSON lines as INVALID without throwing", () => {
    const result = parseChronicleEventLine('{"v":1,"id":"evt_TRUNCAT');
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
  });
});
