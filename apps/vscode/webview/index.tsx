/**
 * Timeline webview (§15.2/15.3): a pure projection — React + Zustand,
 * hydrated by one snapshot then mutated by patches. No business logic, no
 * fs/git access; VS Code theme via --vscode-* variables.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { HostMessage, SessionListItem } from "../src/protocol.js";
import type { ReplayFrame } from "@gigaichronicle/core";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

interface TimelineState {
  sessions: SessionListItem[];
  activeSession: string | null;
  frames: ReplayFrame[];
  apply(message: HostMessage): void;
}

const useStore = create<TimelineState>((set) => ({
  sessions: [],
  activeSession: null,
  frames: [],
  apply: (message) => {
    if (message.kind === "snapshot") set({ sessions: message.data.sessions });
    else if (message.kind === "patch")
      set({ activeSession: message.data.session, frames: message.data.frames });
  },
}));

let reqId = 0;
function query(name: "sessions"): void;
function query(name: "frames", args: { session: string }): void;
function query(name: string, args?: object): void {
  vscode.postMessage({ kind: "query", v: 1, reqId: ++reqId, name, ...(args ? { args } : {}) });
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  useStore.getState().apply(event.data);
});

const styles: Record<string, React.CSSProperties> = {
  app: { fontFamily: "var(--vscode-font-family)", color: "var(--vscode-foreground)", display: "flex", gap: 16, padding: 12 },
  list: { minWidth: 280, borderRight: "1px solid var(--vscode-panel-border)", paddingRight: 12 },
  item: { padding: "6px 8px", cursor: "pointer", borderRadius: 4 },
  badge: { fontSize: 11, opacity: 0.8 },
  frame: { padding: "3px 0", whiteSpace: "pre-wrap", borderBottom: "1px dotted var(--vscode-panel-border)" },
  warn: { color: "var(--vscode-editorWarning-foreground)" },
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "(not captured at this tier)";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 159)}…` : value;
  return `(large content: ${(value as { $blob: string }).$blob})`;
}

function FrameLine({ frame, prev }: { frame: ReplayFrame; prev: ReplayFrame | null }): React.JSX.Element | null {
  // Render the DELTA each frame introduced (frame i = state after event i).
  const time = frame.ts.slice(11, 16);
  if (prev === null || frame.conversation.length > prev.conversation.length) {
    const turn = frame.conversation[frame.conversation.length - 1];
    if (turn !== undefined)
      return (
        <div style={styles.frame}>
          [{time}] <strong>{turn.role === "human" ? "you" : "agent"}</strong> {text(turn.text)}
        </div>
      );
  }
  if (prev !== null && frame.tools.length > prev.tools.length) {
    const run = frame.tools[frame.tools.length - 1];
    if (run !== undefined)
      return (
        <div style={styles.frame}>
          [{time}] tool <code>{run.tool}</code> → {run.outcome} {run.summary !== null ? `(${text(run.summary)})` : ""}
        </div>
      );
  }
  if (prev !== null && frame.git.commits.length > prev.git.commits.length) {
    const commit = frame.git.commits[frame.git.commits.length - 1];
    if (commit !== undefined)
      return (
        <div style={styles.frame}>
          [{time}] git commit <code>{commit.sha}</code> “{commit.subject}”
        </div>
      );
  }
  if (prev !== null && frame.gaps.length > prev.gaps.length) {
    const gap = frame.gaps[frame.gaps.length - 1];
    if (gap !== undefined)
      return (
        <div style={{ ...styles.frame, ...styles.warn }}>
          [{time}] ⚠ capture gap: {gap.reason} {gap.detail ?? ""}
        </div>
      );
  }
  return null;
}

function App(): React.JSX.Element {
  const { sessions, activeSession, frames } = useStore();
  React.useEffect(() => query("sessions"), []);
  const last = frames[frames.length - 1];
  return (
    <div style={styles.app}>
      <div style={styles.list}>
        <h3>Sessions</h3>
        {sessions.length === 0 && <p style={styles.badge}>No sessions yet — run `chronicle import` or start working.</p>}
        {sessions.map((s) => (
          <div
            key={s.session}
            style={{ ...styles.item, background: s.session === activeSession ? "var(--vscode-list-activeSelectionBackground)" : undefined }}
            onClick={() => query("frames", { session: s.session })}
          >
            <div>{s.title ?? s.session}</div>
            <div style={styles.badge}>
              {s.startedTs?.slice(0, 16).replace("T", " ")} · {s.turns} turn(s) · fidelity {s.fidelity}
              {s.gaps > 0 ? <span style={styles.warn}> · ⚠ {s.gaps} gap(s)</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <h3>Replay {activeSession !== null ? <code>{activeSession}</code> : null}</h3>
        {last !== undefined && (
          <p style={styles.badge}>
            fidelity <strong>{last.fidelity}</strong> · {last.conversation.length} turn(s) · {last.tools.length} tool run(s)
            {last.gaps.length > 0 ? <span style={styles.warn}> · ⚠ {last.gaps.length} capture gap(s) — this record is knowingly incomplete</span> : null}
          </p>
        )}
        {frames.map((frame, i) => (
          <FrameLine key={frame.at} frame={frame} prev={i === 0 ? null : (frames[i - 1] ?? null)} />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
