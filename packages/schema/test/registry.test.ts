import { describe, expect, it } from "vitest";
import {
  CORE_EVENTS,
  CORE_EVENT_TYPES,
  RESERVED_EVENT_TYPES,
  isCoreEventType,
} from "../src/index.js";

/** The Phase-1 taxonomy exactly as tabled in ARCHITECTURE.md §5.3. */
const SPEC_TAXONOMY = [
  "ProjectCreated",
  "ProjectOpened",
  "SessionStarted",
  "SessionEnded",
  "PromptSubmitted",
  "PromptEdited",
  "AIResponseReceived",
  "ToolExecuted",
  "FileModified",
  "FilesAccepted",
  "FilesRejected",
  "GitCommitCreated",
  "GitPush",
  "BranchChanged",
  "GitTagCreated",
  "LinkConfirmed",
  "LinkRejected",
  "CaptureGap",
  "CaptureDegraded",
  "WorkspaceMoved",
] as const;

describe("core event registry", () => {
  it("matches the ARCHITECTURE §5.3 Phase-1 taxonomy exactly", () => {
    expect([...CORE_EVENT_TYPES].sort()).toEqual([...SPEC_TAXONOMY].sort());
  });

  it("every type is PascalCase (ADR-0003)", () => {
    for (const type of CORE_EVENT_TYPES) expect(type).toMatch(/^[A-Z][A-Za-z0-9]*$/);
  });

  it("declares §5.4 visibility classes: local for machine-ops, shared for the journey", () => {
    expect(CORE_EVENTS.ProjectOpened.defaultVisibility).toBe("local");
    expect(CORE_EVENTS.WorkspaceMoved.defaultVisibility).toBe("local");
    expect(CORE_EVENTS.CaptureDegraded.defaultVisibility).toBe("local");
    // CaptureGap is deliberately SHARED — gaps are part of the record (§5.4).
    expect(CORE_EVENTS.CaptureGap.defaultVisibility).toBe("shared");
    expect(CORE_EVENTS.PromptSubmitted.defaultVisibility).toBe("shared");
  });

  it("declares session bindings: project scope, session scope, ambient git", () => {
    expect(CORE_EVENTS.ProjectCreated.sessionBinding).toBe("none");
    expect(CORE_EVENTS.PromptSubmitted.sessionBinding).toBe("required");
    expect(CORE_EVENTS.GitCommitCreated.sessionBinding).toBe("optional");
  });

  it("reserved Phase 2-3 names are reserved, not registered", () => {
    for (const reserved of RESERVED_EVENT_TYPES) {
      expect(isCoreEventType(reserved)).toBe(false);
    }
  });

  it("all payload versions start at 1", () => {
    for (const type of CORE_EVENT_TYPES) expect(CORE_EVENTS[type].payloadVersion).toBe(1);
  });
});
