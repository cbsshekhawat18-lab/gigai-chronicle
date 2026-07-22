/**
 * Derived prompt usage — the library's other seam (ADR-0014 completes here).
 *
 * Promotion joins the two prompt worlds in one direction (captured → library).
 * Usage is the same join read the other way: a library prompt was USED when a
 * captured PromptSubmitted/PromptEdited event carries the same text — capture
 * saw it actually submitted to an AI tool. Derived, never stored (the ADR-0013
 * law): no counters to fake, no state to sync, and a teammate's clone derives
 * the identical answer from the shared log.
 *
 * This is what makes "used ×N" trustworthy: it is observed work, not a
 * button click. The corollary is an honest limit — a use that capture never
 * saw (pasted into a web UI, or edited before submitting) is not counted,
 * and the docs say so.
 */
import type { EventLog } from "../store/event-log.js";
import { capturedPrompts } from "./from-capture.js";
import { getPrompt, listPrompts, promptVersions, type Prompt } from "./prompts.js";

/** One observed use of a library prompt. */
export interface PromptUse {
  eventId: string;
  session: string | null;
  ts: string;
  /** The newest library version whose body matches this use (see note below). */
  version: number;
}

/** Everything usage-derived about one library prompt. */
export interface PromptUsageInfo {
  slug: string;
  /** Total observed uses across all versions. */
  total: number;
  lastUsedTs: string | null;
  /** Per-version counts, ascending by version; versions with 0 uses included. */
  byVersion: Array<{ version: number; count: number }>;
  uses: PromptUse[];
  /**
   * Lifecycle status. "used" = capture observed this prompt's text submitted
   * at least once, or the prompt was promoted from a captured session
   * (born used). "saved" = curated for the future, not yet seen in use.
   */
  status: "used" | "saved";
}

/**
 * Comparison form: line endings unified, outer whitespace dropped. Nothing
 * inside the text is collapsed — usage means the SAME prompt, not a similar
 * one.
 */
function canonical(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * Usage for every library prompt, derived by matching captured prompt texts
 * against every saved version's body.
 *
 * When several versions share a body (a revert recreates an old one), the use
 * is attributed to the NEWEST matching version — identical text cannot say
 * which twin was meant, so the deterministic choice is the one that was
 * current most recently.
 */
export async function promptUsage(
  chronicleDir: string,
  log: EventLog,
): Promise<Map<string, PromptUsageInfo>> {
  const library = await listPrompts(chronicleDir);
  const result = new Map<string, PromptUsageInfo>();
  if (library.length === 0) return result;

  // body → {slug, version} of the newest version carrying that body.
  const bodies = new Map<string, { slug: string; version: number }>();
  const versionsBySlug = new Map<string, number[]>();
  for (const prompt of library) {
    const versions = await promptVersions(chronicleDir, prompt.slug);
    versionsBySlug.set(prompt.slug, versions);
    for (const version of versions) {
      const saved = await getPrompt(chronicleDir, prompt.slug, version).catch(() => null);
      if (saved === null) continue;
      bodies.set(canonical(saved.body), { slug: prompt.slug, version });
    }
  }

  const usesBySlug = new Map<string, PromptUse[]>();
  for (const captured of await capturedPrompts(chronicleDir, log)) {
    const hit = bodies.get(canonical(captured.text));
    if (hit === undefined) continue;
    const uses = usesBySlug.get(hit.slug) ?? [];
    uses.push({
      eventId: captured.eventId,
      session: captured.session,
      ts: captured.ts,
      version: hit.version,
    });
    usesBySlug.set(hit.slug, uses);
  }

  for (const prompt of library) {
    // Log scan order is per-stream file order, NOT global time order — a
    // backfilled import interleaves. Sort by ts so "last used" is true.
    const uses = (usesBySlug.get(prompt.slug) ?? []).sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0,
    );
    const byVersion = (versionsBySlug.get(prompt.slug) ?? []).map((version) => ({
      version,
      count: uses.filter((u) => u.version === version).length,
    }));
    result.set(prompt.slug, {
      slug: prompt.slug,
      total: uses.length,
      lastUsedTs: uses.length > 0 ? (uses[uses.length - 1] as PromptUse).ts : null,
      byVersion,
      uses,
      status: uses.length > 0 || isBornUsed(prompt) ? "used" : "saved",
    });
  }
  return result;
}

/** Promoted prompts carry their origin session — they were typed before saved. */
function isBornUsed(prompt: Prompt): boolean {
  return prompt.sourceSession !== null;
}
