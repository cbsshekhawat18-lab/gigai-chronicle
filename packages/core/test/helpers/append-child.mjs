/**
 * Child process for the real-kill fault-injection test: appends events in a
 * tight loop until killed. Runs against the BUILT package (dist/) exactly as
 * a real consumer would. argv[2] = chronicle dir, argv[3] = session id,
 * argv[4] = workspace id.
 */
import { EventLog } from "../../dist/index.js";
import { newId } from "@gigaichronicle/schema";

const [, , chronicleDir, sessionId, workspaceId] = process.argv;

const log = await EventLog.open(chronicleDir, { workspaceId, fsyncIntervalMs: 0 });

const ts = () => new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");

// Signal readiness so the parent can start its kill timer after real work began.
let appended = 0;
for (;;) {
  await log.append([
    {
      v: 1,
      id: newId("event"),
      ts: ts(),
      type: "PromptSubmitted",
      session: sessionId,
      actor: { kind: "human" },
      git: { head: null, branch: null, dirty: [] },
      payload: { text: `prompt ${appended} ${"x".repeat(200)}` },
      meta: {
        provider: "example-tool@1.0.0",
        workspace: workspaceId,
        schema: "PromptSubmitted/1",
        visibility: "shared",
      },
    },
  ]);
  appended += 1;
  if (appended === 5) console.log("APPENDING"); // parent waits for this
}
