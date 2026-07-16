/**
 * Timeline webview (§15.2/15.3): a pure projection — React + Zustand,
 * hydrated by one snapshot then mutated by patches. No business logic, no
 * fs/git access; VS Code theme via --vscode-* variables. Filters and search
 * are CLIENT-side view state (never sent anywhere, never persisted to the
 * store — §15.3).
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
  app: { fontFamily: "var(--vscode-font-family)", color: "var(--vscode-foreground)", display: "flex", gap: 16, padding: 12, height: "100vh", boxSizing: "border-box" },
  list: { minWidth: 280, borderRight: "1px solid var(--vscode-panel-border)", paddingRight: 12, overflowY: "auto" },
  item: { padding: "6px 8px", cursor: "pointer", borderRadius: 4 },
  badge: { fontSize: 11, opacity: 0.8 },
  frame: { padding: "3px 0", whiteSpace: "pre-wrap", borderBottom: "1px dotted var(--vscode-panel-border)" },
  warn: { color: "var(--vscode-editorWarning-foreground)" },
  toolbar: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" },
  chip: {
    fontSize: 11,
    padding: "2px 10px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid var(--vscode-panel-border)",
    background: "transparent",
    color: "var(--vscode-foreground)",
  },
  chipOn: {
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    borderColor: "var(--vscode-badge-background)",
  },
  search: {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 4,
    border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))",
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    outline: "none",
    minWidth: 180,
  },
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "(not captured at this tier)";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 159)}…` : value;
  return `(large content: ${(value as { $blob: string }).$blob})`;
}

type DeltaKind = "conversation" | "tools" | "git" | "files" | "gaps";

interface Delta {
  kind: DeltaKind;
  time: string;
  /** Plain text of the line — the search index. */
  plain: string;
  node: React.JSX.Element;
}

/** The delta frame i introduced over frame i-1 (frame i = state after event i). */
function deltaOf(frame: ReplayFrame, prev: ReplayFrame | null): Delta | null {
  const time = frame.ts.slice(11, 16);
  if (prev === null || frame.conversation.length > prev.conversation.length) {
    const turn = frame.conversation[frame.conversation.length - 1];
    if (turn !== undefined) {
      const who = turn.role === "human" ? "you" : "agent";
      const body = text(turn.text);
      return {
        kind: "conversation",
        time,
        plain: `${who} ${body}`,
        node: (
          <div style={styles.frame}>
            [{time}] <strong>{who}</strong> {body}
          </div>
        ),
      };
    }
  }
  if (prev !== null && frame.tools.length > prev.tools.length) {
    const run = frame.tools[frame.tools.length - 1];
    if (run !== undefined) {
      const summary = run.summary !== null ? `(${text(run.summary)})` : "";
      return {
        kind: "tools",
        time,
        plain: `tool ${run.tool} ${run.outcome} ${summary}`,
        node: (
          <div style={styles.frame}>
            [{time}] tool <code>{run.tool}</code> → {run.outcome} {summary}
          </div>
        ),
      };
    }
  }
  if (prev !== null && frame.git.commits.length > prev.git.commits.length) {
    const commit = frame.git.commits[frame.git.commits.length - 1];
    if (commit !== undefined) {
      return {
        kind: "git",
        time,
        plain: `git commit ${commit.sha} ${commit.subject}`,
        node: (
          <div style={styles.frame}>
            [{time}] git commit <code>{commit.sha}</code> “{commit.subject}”
          </div>
        ),
      };
    }
  }
  if (prev !== null && frame.workingSet.length > prev.workingSet.length) {
    const file = frame.workingSet[frame.workingSet.length - 1];
    if (file !== undefined) {
      return {
        kind: "files",
        time,
        plain: `file ${file.status} ${file.path}`,
        node: (
          <div style={styles.frame}>
            [{time}] file <code>{file.path}</code> {file.status}
          </div>
        ),
      };
    }
  }
  if (prev !== null && frame.gaps.length > prev.gaps.length) {
    const gap = frame.gaps[frame.gaps.length - 1];
    if (gap !== undefined) {
      return {
        kind: "gaps",
        time,
        plain: `gap ${gap.reason} ${gap.detail ?? ""}`,
        node: (
          <div style={{ ...styles.frame, ...styles.warn }}>
            [{time}] ⚠ capture gap: {gap.reason} {gap.detail ?? ""}
          </div>
        ),
      };
    }
  }
  return null;
}

const KIND_LABELS: ReadonlyArray<[DeltaKind, string]> = [
  ["conversation", "Conversation"],
  ["tools", "Tools"],
  ["git", "Git"],
  ["files", "Files"],
  ["gaps", "⚠ Gaps"],
];

function App(): React.JSX.Element {
  const { sessions, activeSession, frames } = useStore();
  const [kinds, setKinds] = React.useState<Set<DeltaKind>>(
    () => new Set<DeltaKind>(["conversation", "tools", "git", "files", "gaps"]),
  );
  const [search, setSearch] = React.useState("");
  const endRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => query("sessions"), []);
  // Latest always: when a session loads, land on "now" (the newest frame).
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [frames]);

  const deltas = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out: Delta[] = [];
    frames.forEach((frame, i) => {
      const delta = deltaOf(frame, i === 0 ? null : (frames[i - 1] ?? null));
      if (delta === null) return;
      if (!kinds.has(delta.kind)) return;
      if (needle !== "" && !delta.plain.toLowerCase().includes(needle)) return;
      out.push(delta);
    });
    return out;
  }, [frames, kinds, search]);

  const toggle = (kind: DeltaKind): void => {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const last = frames[frames.length - 1];
  const hidden = frames.length > 0 ? Math.max(0, framesWithDelta(frames) - deltas.length) : 0;

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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h3>Replay {activeSession !== null ? <code>{activeSession}</code> : null}</h3>
        {frames.length > 0 && (
          <div style={styles.toolbar}>
            {KIND_LABELS.map(([kind, label]) => (
              <button
                key={kind}
                style={{ ...styles.chip, ...(kinds.has(kind) ? styles.chipOn : {}) }}
                onClick={() => toggle(kind)}
                title={`show/hide ${label.toLowerCase()}`}
              >
                {label}
              </button>
            ))}
            <input
              style={styles.search}
              placeholder="search this session…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {hidden > 0 && <span style={styles.badge}>{hidden} line(s) filtered out</span>}
          </div>
        )}
        {last !== undefined && (
          <p style={styles.badge}>
            fidelity <strong>{last.fidelity}</strong> · {last.conversation.length} turn(s) · {last.tools.length} tool run(s)
            {last.gaps.length > 0 ? <span style={styles.warn}> · ⚠ {last.gaps.length} capture gap(s) — this record is knowingly incomplete</span> : null}
          </p>
        )}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {deltas.map((delta, i) => (
            <React.Fragment key={i}>{delta.node}</React.Fragment>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

function framesWithDelta(frames: readonly ReplayFrame[]): number {
  let count = 0;
  frames.forEach((frame, i) => {
    if (deltaOf(frame, i === 0 ? null : (frames[i - 1] ?? null)) !== null) count += 1;
  });
  return count;
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
