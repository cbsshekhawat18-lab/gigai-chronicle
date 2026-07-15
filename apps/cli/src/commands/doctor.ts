import { runDoctor, isChronicleError } from "@gigaichronicle/core";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

export async function runDoctorCommand(
  options: { reindex?: boolean; scanSecrets?: boolean },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  try {
    const report = await runDoctor(chronicleDir, {
      workspaceId: await resolveWorkspace(chronicleDir),
      reindex: options.reindex === true,
      scanSecrets: options.scanSecrets === true,
    });

    if (global.json === true) {
      printJson("doctor", { report });
    } else {
      const lines = [
        `store    ${report.store.scannedFiles} stream file(s), ${report.store.healed.length} healed, ${report.store.problems.length} problem(s)`,
        `index    v${report.index.schemaVersion} — ${report.index.eventsIndexed}/${report.index.eventsInLog} events${report.index.reindexed ? " (rebuilt)" : ""}${report.index.fresh ? "" : " — STALE"}`,
        `egress   ${report.egress.verdict}${report.egress.endpoints.length > 0 ? `: ${report.egress.endpoints.join(", ")}` : " (no endpoints configured, telemetry: none)"}`,
      ];
      if (report.secrets !== undefined) {
        lines.push(
          `secrets  ${report.secrets.eventsScanned} event(s) scanned, ${report.secrets.findings.length} finding(s)`,
        );
        for (const finding of report.secrets.findings) {
          lines.push(`  ✗ ${finding.file} ${finding.eventId}: ${finding.kinds.join(", ")}`);
        }
      }
      lines.push(report.ok ? "✓ healthy" : "✗ issues found");
      console.log(lines.join("\n"));
    }
    return report.ok ? EXIT_OK : EXIT_FAILURE;
  } catch (error) {
    if (isChronicleError(error, "E_NOT_INITIALIZED")) {
      console.error(error.message);
      return EXIT_NOT_A_PROJECT;
    }
    throw error;
  }
}
