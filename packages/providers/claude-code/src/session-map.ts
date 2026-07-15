/**
 * Tool-session-UUID → Chronicle session-id map. Claude Code identifies
 * sessions by UUID; Chronicle by `ses_` ULID. The mapping is machine-local
 * provider cursor state (§7.2: `.local/` is the sanctioned home for provider
 * cursors) so hooks and backfill agree on session identity.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isId, newId, type SessionId } from "@gigaichronicle/schema";

const MAP_RELATIVE = [".local", "providers", "claude-code", "sessions.json"];

export class SessionMap {
  readonly #file: string;
  readonly #map: Record<string, SessionId>;

  private constructor(file: string, map: Record<string, SessionId>) {
    this.#file = file;
    this.#map = map;
  }

  static load(chronicleDir: string): SessionMap {
    const file = path.join(chronicleDir, ...MAP_RELATIVE);
    let map: Record<string, SessionId> = {};
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      for (const [uuid, id] of Object.entries(raw)) {
        if (isId(id, "session")) map[uuid] = id;
      }
    } catch {
      map = {};
    }
    return new SessionMap(file, map);
  }

  /** Session id for a tool UUID, minted on first sight (`atMs` seeds ULID time). */
  resolve(toolSessionUuid: string, atMs?: number): SessionId {
    const existing = this.#map[toolSessionUuid];
    if (existing !== undefined) return existing;
    const minted = newId("session", atMs);
    this.#map[toolSessionUuid] = minted;
    this.save();
    return minted;
  }

  save(): void {
    mkdirSync(path.dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, JSON.stringify(this.#map, null, 2) + "\n", "utf8");
  }
}
