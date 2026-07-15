import { describe, expect, it } from "vitest";
import {
  ID_PREFIXES,
  ULID_REGEX,
  generateUlid,
  idPattern,
  idTime,
  isId,
  newId,
} from "../src/index.js";

/** Deterministic random source for reproducible tests. */
const fixedBytes =
  (value: number) =>
  (length: number): Uint8Array =>
    new Uint8Array(length).fill(value);

describe("generateUlid", () => {
  it("produces 26 Crockford base32 chars", () => {
    const ulid = generateUlid();
    expect(ulid).toHaveLength(26);
    expect(ulid).toMatch(ULID_REGEX);
  });

  it("is deterministic given time and random source", () => {
    const a = generateUlid(1_700_000_000_000, fixedBytes(7));
    const b = generateUlid(1_700_000_000_000, fixedBytes(7));
    expect(a).toBe(b);
  });

  it("sorts lexicographically by time", () => {
    const earlier = generateUlid(1_000, fixedBytes(255));
    const later = generateUlid(2_000, fixedBytes(0));
    expect(earlier < later).toBe(true);
  });

  it("round-trips the timestamp", () => {
    const time = 1_752_486_731_412; // 2026-07-14T10:32:11.412Z
    expect(idTime(generateUlid(time, fixedBytes(1)))).toBe(time);
  });

  it("rejects out-of-range times", () => {
    expect(() => generateUlid(-1)).toThrow(RangeError);
    expect(() => generateUlid(2 ** 48)).toThrow(RangeError);
  });
});

describe("prefixed ids", () => {
  it("newId carries the right prefix for every kind", () => {
    for (const kind of Object.keys(ID_PREFIXES) as Array<keyof typeof ID_PREFIXES>) {
      const id = newId(kind);
      expect(id.startsWith(`${ID_PREFIXES[kind]}_`)).toBe(true);
      expect(isId(id, kind)).toBe(true);
    }
  });

  it("isId enforces both prefix and ULID body", () => {
    const id = newId("event");
    expect(isId(id, "session")).toBe(false); // wrong prefix
    expect(isId("evt_notaulid", "event")).toBe(false); // bad body
    expect(isId("evt_01ARZ3NDEKTSV4RRFFQ69G5FIL", "event")).toBe(false); // I and L excluded
    expect(isId(42, "event")).toBe(false);
  });

  it("idPattern matches what newId generates", () => {
    expect(new RegExp(idPattern("workspace")).test(newId("workspace"))).toBe(true);
  });

  it("idTime works on prefixed ids", () => {
    const id = newId("event", 123_456, fixedBytes(0));
    expect(idTime(id)).toBe(123_456);
  });
});
