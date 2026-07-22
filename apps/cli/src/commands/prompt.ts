/**
 * `chronicle prompt` — version control for prompts (§5.4, ADR-0011).
 * save/list/show/versions/diff/use/compare/revert over curated Markdown in
 * .chronicle/prompts/.
 *
 * The lifecycle model (v0.1.1): a prompt is SAVED (curated for the future)
 * until capture observes its text actually submitted to an AI tool — then it
 * is USED. Status is derived from the log, never stored, so it cannot be
 * faked by clicking a button (same law as ADR-0013).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  EventLog,
  capturedPromptByEvent,
  getPrompt,
  isChronicleError,
  lastCapturedPrompt,
  listPrompts,
  promptUsage,
  promptVersions,
  revertPrompt,
  savePrompt,
  unifiedDiff,
  type CapturedPrompt,
  type PromptUsageInfo,
} from "@gigaichronicle/core";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

export interface PromptFlags {
  title?: string;
  tags?: string;
  text?: string;
  fromFile?: string;
  session?: string;
  fromEvent?: string;
  fromSession?: string;
  fromLast?: boolean;
  /** Why this version exists — the "commit message" of the library. */
  note?: string;
  /** `use`: also place the body on the system clipboard. */
  copy?: boolean;
}

/** Run `fn` with an open EventLog, closing it whatever happens. */
async function withLog<T>(chronicleDir: string, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}

/** "slug" or "slug@version" → parts. Null version = current. */
function parseRef(ref: string): { slug: string; version: number | undefined } | null {
  const at = ref.lastIndexOf("@");
  if (at === -1) return { slug: ref, version: undefined };
  const version = Number(ref.slice(at + 1));
  if (!Number.isInteger(version) || version < 1) return null;
  return { slug: ref.slice(0, at), version };
}

/**
 * Best-effort system clipboard (darwin pbcopy / win32 clip / linux xclip,
 * wl-copy). Resolves false when no tool works — the caller stays honest
 * about it instead of pretending the copy happened.
 */
function copyToClipboard(text: string): Promise<boolean> {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [["xclip", ["-selection", "clipboard"]], ["wl-copy", []]];
  const attempt = ([cmd, args]: [string, string[]]): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.end(text);
    });
  return candidates.reduce<Promise<boolean>>(
    (chain, candidate) => chain.then((done) => (done ? true : attempt(candidate))),
    Promise.resolve(false),
  );
}

/** "● used ×3 (last 2026-07-20)" | "○ saved for later" for human output. */
function statusLabel(info: PromptUsageInfo | undefined): string {
  if (info === undefined || info.status === "saved") return "○ saved for later";
  const last = info.lastUsedTs === null ? "" : ` (last ${info.lastUsedTs.slice(0, 10)})`;
  return info.total > 0 ? `● used ×${info.total}${last}` : "● used (promoted from a session)";
}

/**
 * Resolve `--from-event | --from-session | --from-last` to the captured
 * prompt they name (ADR-0014). Null when no --from-* flag was passed.
 */
async function resolveCaptured(
  chronicleDir: string,
  flags: PromptFlags,
): Promise<CapturedPrompt | null | "none"> {
  const wants =
    flags.fromEvent !== undefined || flags.fromSession !== undefined || flags.fromLast === true;
  if (!wants) return "none";

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    if (flags.fromEvent !== undefined) {
      return await capturedPromptByEvent(chronicleDir, log, flags.fromEvent);
    }
    return await lastCapturedPrompt(
      chronicleDir,
      log,
      flags.fromSession !== undefined ? { session: flags.fromSession } : {},
    );
  } finally {
    await log.close();
  }
}

export async function runPromptCommand(
  action: string,
  slug: string | undefined,
  rest: string[],
  flags: PromptFlags,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }

  try {
    switch (action) {
      case "save": {
        if (slug === undefined) {
          console.error(
            "usage: chronicle prompt save <slug> [--text …|--from-file …|--from-last|--from-event evt_…|--from-session ses_…]",
          );
          return EXIT_USAGE;
        }
        // A prompt you already typed can be promoted as-is — no retyping (ADR-0014).
        const captured = await resolveCaptured(chronicleDir, flags);
        if (captured === null) {
          console.error(
            flags.fromEvent !== undefined
              ? `prompt save: no captured prompt text for ${flags.fromEvent} (unknown event, or metadata-only capture)`
              : "prompt save: no captured prompt found to promote — type one first, or pass --text",
          );
          return EXIT_FAILURE;
        }
        const promoted = captured === "none" ? null : captured;
        const body =
          promoted?.text ??
          flags.text ??
          (flags.fromFile !== undefined ? readFileSync(flags.fromFile, "utf8") : undefined);
        const saved = await savePrompt(chronicleDir, {
          slug,
          ...(body !== undefined ? { body } : {}),
          ...(flags.title !== undefined ? { title: flags.title } : {}),
          ...(flags.note !== undefined ? { note: flags.note } : {}),
          ...(flags.tags !== undefined
            ? { tags: flags.tags.split(",").map((t) => t.trim()).filter((t) => t !== "") }
            : {}),
          // Explicit --session wins; otherwise a promoted prompt carries its
          // own provenance for free.
          ...(flags.session !== undefined
            ? { sourceSession: flags.session }
            : promoted?.session != null
              ? { sourceSession: promoted.session }
              : {}),
        });
        if (global.json === true) {
          printJson("prompt", {
            action,
            prompt: saved,
            ...(promoted !== null ? { promotedFrom: promoted.eventId } : {}),
          });
        } else {
          console.log(
            `✓ ${saved.slug} v${saved.version} saved (.chronicle/prompts/${saved.slug}/) — commit it and the team gets it`,
          );
          if (promoted !== null) {
            console.log(`  promoted from ${promoted.eventId} — the prompt you typed, not retyped`);
          }
        }
        return EXIT_OK;
      }
      case "list": {
        const prompts = await listPrompts(chronicleDir);
        // Lifecycle status is derived by joining the library against the log
        // — worth one scan; an unreadable log must not hide the library.
        const usage = await withLog(chronicleDir, (log) => promptUsage(chronicleDir, log)).catch(
          () => new Map<string, PromptUsageInfo>(),
        );
        if (global.json === true) {
          printJson("prompt", {
            action,
            count: prompts.length,
            prompts: prompts.map((p) => {
              const info = usage.get(p.slug);
              return {
                ...p,
                status: info?.status ?? "saved",
                uses: info?.total ?? 0,
                lastUsedTs: info?.lastUsedTs ?? null,
              };
            }),
          });
        } else if (prompts.length === 0)
          console.log('no prompts yet — chronicle prompt save <slug> --text "…"');
        else
          for (const p of prompts) {
            console.log(
              `${p.slug}  v${p.version}  ${statusLabel(usage.get(p.slug))}${p.tags.length > 0 ? `  [${p.tags.join(", ")}]` : ""}\n  ${p.title}`,
            );
          }
        return EXIT_OK;
      }
      case "show": {
        if (slug === undefined) return usage("show <slug> [version]");
        const version = rest[0] !== undefined ? Number(rest[0]) : undefined;
        const prompt = await getPrompt(chronicleDir, slug, version);
        if (global.json === true) printJson("prompt", { action, prompt });
        else console.log(`# ${prompt.title} (v${prompt.version})\n\n${prompt.body}`);
        return EXIT_OK;
      }
      case "versions": {
        if (slug === undefined) return usage("versions <slug>");
        const versions = await promptVersions(chronicleDir, slug);
        // Per-version usage: which version people ACTUALLY use. v3 at ×0
        // while v2 sits at ×5 is the library telling you v3 isn't better.
        const info = (
          await withLog(chronicleDir, (log) => promptUsage(chronicleDir, log)).catch(
            () => new Map<string, PromptUsageInfo>(),
          )
        ).get(slug);
        const countOf = (v: number): number =>
          info?.byVersion.find((b) => b.version === v)?.count ?? 0;
        if (global.json === true) {
          // `versions` stays number[] (the stable contract); details extend it.
          printJson("prompt", {
            action,
            slug,
            versions,
            details: await Promise.all(
              versions.map(async (v) => {
                const p = await getPrompt(chronicleDir, slug, v).catch(() => null);
                return { version: v, note: p?.note ?? null, savedAt: p?.savedAt ?? null, uses: countOf(v) };
              }),
            ),
          });
        } else {
          for (const v of versions) {
            const p = await getPrompt(chronicleDir, slug, v).catch(() => null);
            const uses = countOf(v);
            console.log(
              `v${v}${uses > 0 ? `  used ×${uses}` : ""}${p?.note != null ? `  "${p.note}"` : ""}`,
            );
          }
        }
        return EXIT_OK;
      }
      case "diff": {
        const [a, b] = [rest[0], rest[1]];
        if (slug === undefined || a === undefined || b === undefined) {
          return usage("diff <slug> <versionA> <versionB>");
        }
        const [pa, pb] = await Promise.all([
          getPrompt(chronicleDir, slug, Number(a)),
          getPrompt(chronicleDir, slug, Number(b)),
        ]);
        const diff = unifiedDiff(pa.body, pb.body, `${slug} v${a}`, `${slug} v${b}`);
        if (global.json === true) printJson("prompt", { action, slug, a: Number(a), b: Number(b), diff });
        else console.log(diff);
        return EXIT_OK;
      }
      case "use": {
        // "use" = get the prompt into your hands: body on stdout (pipeable),
        // --copy for the clipboard. Usage TRACKING is not done here — it is
        // derived when capture sees the text actually submitted, so counts
        // stay observations, never button clicks.
        if (slug === undefined) return usage("use <slug|slug@version> [--copy]");
        const ref = parseRef(slug);
        if (ref === null) return usage("use <slug|slug@version> [--copy]");
        const version = ref.version ?? (rest[0] !== undefined ? Number(rest[0]) : undefined);
        const prompt = await getPrompt(chronicleDir, ref.slug, version);
        const copied = flags.copy === true ? await copyToClipboard(prompt.body) : false;
        if (global.json === true) {
          printJson("prompt", { action, prompt, copied });
        } else {
          console.log(prompt.body);
          // Notes go to stderr so `chronicle prompt use x | pbcopy` stays clean.
          if (flags.copy === true) {
            console.error(
              copied
                ? `✓ ${ref.slug} v${prompt.version} copied — paste it into your AI tool`
                : "(no clipboard tool found — body printed above)",
            );
          }
        }
        return EXIT_OK;
      }
      case "compare": {
        // Cross-prompt diff — `diff` compares versions of ONE prompt; this
        // compares two prompts (two research variants, or yours vs a
        // teammate's), each at any version via slug@version.
        const other = rest[0];
        if (slug === undefined || other === undefined) {
          return usage("compare <slugA[@vA]> <slugB[@vB]>");
        }
        const [ra, rb] = [parseRef(slug), parseRef(other)];
        if (ra === null || rb === null) return usage("compare <slugA[@vA]> <slugB[@vB]>");
        const [pa, pb] = await Promise.all([
          getPrompt(chronicleDir, ra.slug, ra.version),
          getPrompt(chronicleDir, rb.slug, rb.version),
        ]);
        const labelA = `${pa.slug}@v${pa.version}`;
        const labelB = `${pb.slug}@v${pb.version}`;
        const diff = unifiedDiff(pa.body, pb.body, labelA, labelB);
        if (global.json === true) {
          printJson("prompt", { action, a: { slug: pa.slug, version: pa.version }, b: { slug: pb.slug, version: pb.version }, diff });
        } else {
          console.log(diff);
        }
        return EXIT_OK;
      }
      case "revert": {
        // Rollback, append-only: vTarget's body becomes a NEW current
        // version; the history keeps every step including the detour.
        const version = rest[0] !== undefined ? Number(rest[0]) : NaN;
        if (slug === undefined || !Number.isInteger(version) || version < 1) {
          return usage("revert <slug> <version> [--note …]");
        }
        const reverted = await revertPrompt(chronicleDir, slug, version, flags.note);
        if (global.json === true) {
          printJson("prompt", { action, prompt: reverted, revertedTo: version });
        } else {
          console.log(
            `✓ ${slug} v${reverted.version} saved — the content of v${version}, now current (nothing was rewritten)`,
          );
        }
        return EXIT_OK;
      }
      default:
        return usage("save|list|show|versions|diff|use|compare|revert");
    }
  } catch (error) {
    if (isChronicleError(error)) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

function usage(hint: string): number {
  console.error(`usage: chronicle prompt ${hint}`);
  return EXIT_USAGE;
}
