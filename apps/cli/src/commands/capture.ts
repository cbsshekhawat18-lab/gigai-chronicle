/**
 * `chronicle capture <provider> --event <name>` — the hook ingestion path.
 * ABSOLUTE CONTRACT: exit 0 always, stderr only, never block the tool
 * (CAPTURE-SURFACES §2.1). Failures are recorded in-store as degradations
 * where possible and are otherwise silent.
 */
import { findChronicleDir } from "../context.js";

async function readStdin(timeoutMs = 2_000): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(data), timeoutMs);
    timer.unref();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

export async function runCaptureCommand(providerId: string, eventName: string): Promise<number> {
  try {
    if (providerId !== "claude-code") {
      console.error(`capture: unknown provider "${providerId}"`);
      return 0; // fire-and-forget: even misconfiguration must not break the tool
    }
    const chronicleDir = findChronicleDir(process.cwd());
    if (chronicleDir === null) return 0; // not a chronicle project — silently a no-op
    const stdinJson = await readStdin();
    const { runCapture } = await import("@gigaichronicle/provider-claude-code");
    const outcome = await runCapture(chronicleDir, eventName, stdinJson);
    if (!outcome.ok && outcome.note !== undefined) {
      console.error(`capture: ${outcome.note}`);
    }
  } catch (error) {
    console.error(`capture: ${(error as Error).message}`);
  }
  return 0;
}
