import { describe, expect, it } from "vitest";
import { digestFingerprint, isForeignRepository, normalizeRemoteUrl } from "../src/index.js";

describe("remote URL normalization (ADR-0009 rules table)", () => {
  const CASES: Array<[input: string, expected: string]> = [
    ["git@github.com:Acme/API.git", "github.com/Acme/API"],
    ["https://github.com/Acme/API.git", "github.com/Acme/API"],
    ["https://user:token@GitHub.com/Acme/API/", "github.com/Acme/API"],
    ["ssh://git@host.example:2222/a/b.git", "host.example:2222/a/b"],
    ["http://Host.example/a/b", "host.example/a/b"],
    ["/mnt/repos/api.bundle", "/mnt/repos/api.bundle"], // pass-through
    ["../relative/path", "../relative/path"], //           pass-through
  ];
  for (const [input, expected] of CASES) {
    it(`${input} → ${expected}`, () => {
      expect(normalizeRemoteUrl(input)).toBe(expected);
    });
  }

  it("equivalent ssh and https remotes normalize identically", () => {
    expect(normalizeRemoteUrl("git@github.com:acme/api.git")).toBe(
      normalizeRemoteUrl("https://github.com/acme/api"),
    );
  });
});

describe("fingerprint digest (byte-exact spec surface)", () => {
  it("is order-independent via sorted serialization", () => {
    const a = digestFingerprint(["b".repeat(40), "a".repeat(40)].sort(), ["x", "y"].sort());
    const b = digestFingerprint(["a".repeat(40), "b".repeat(40)].sort(), ["y", "x"].sort());
    expect(a).toBe(b);
  });

  it("null when both components are empty (unidentifiable, not an error)", () => {
    expect(digestFingerprint([], [])).toBeNull();
  });

  it("pins the canonical serialization (spec conformance vector)", () => {
    // Third-party implementations must reproduce this exact digest.
    const digest = digestFingerprint(
      ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      ["github.com/acme/api"],
    );
    expect(digest).toBe("23d2158bbfac7af69a240af7b4745fd3cd49c3735c4e50d6f49b5c2d4da17a5e");
  });
});

describe("foreign-repo detection (roots, never digests)", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  it("disjoint non-empty root sets are foreign", () => {
    expect(isForeignRepository([A], [B])).toBe(true);
  });
  it("any shared root is family (forks, merges of history)", () => {
    expect(isForeignRepository([A], [A, B])).toBe(false);
  });
  it("empty sets never accuse (shallow clones, unborn repos)", () => {
    expect(isForeignRepository([], [B])).toBe(false);
    expect(isForeignRepository([A], [])).toBe(false);
  });
});
