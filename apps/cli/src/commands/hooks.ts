/**
 * `chronicle hooks install|uninstall claude-code [--user]` — the settings
 * merge with etiquette: show the plan, never clobber, one-command uninstall
 * (M7 epic; consent boundary §5.9 — this file is committable team config).
 */
import path from "node:path";
import { EXIT_FAILURE, EXIT_NOT_A_PROJECT, EXIT_OK, findChronicleDir, printJson } from "../context.js";

export async function runHooksCommand(
  action: string,
  providerId: string,
  options: { user?: boolean },
  global: { json?: boolean },
): Promise<number> {
  if (providerId !== "claude-code") {
    console.error(`hooks: unknown provider "${providerId}"`);
    return EXIT_FAILURE;
  }
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null && options.user !== true) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const workspaceRoot = chronicleDir === null ? process.cwd() : path.dirname(chronicleDir);
  const { installHooks, uninstallHooks, renderInstallPlan, settingsPathFor } = await import(
    "@gigaichronicle/provider-claude-code"
  );
  const file = settingsPathFor(workspaceRoot, options.user === true ? "user" : "project");

  if (action === "install") {
    const plan = renderInstallPlan(file);
    const changed = installHooks(file);
    if (global.json === true) {
      printJson("hooks", { action, file, changed, plan });
    } else if (changed) {
      console.log([`✓ capture hooks installed in ${file}`, ...plan.map((p) => `  + ${p}`)].join("\n"));
      if (options.user !== true) {
        console.log("  commit .claude/settings.json and the whole team gets capture");
      }
    } else {
      console.log(`already installed (${file})`);
    }
    return EXIT_OK;
  }
  if (action === "uninstall") {
    const changed = uninstallHooks(file);
    if (global.json === true) printJson("hooks", { action, file, changed });
    else console.log(changed ? `✓ chronicle hooks removed from ${file}` : `nothing to remove (${file})`);
    return EXIT_OK;
  }
  console.error(`hooks: unknown action "${action}" (install|uninstall)`);
  return EXIT_FAILURE;
}
