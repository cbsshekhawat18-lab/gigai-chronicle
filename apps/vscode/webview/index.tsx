/**
 * Timeline webview (§15.2/15.3): a pure projection — React + Zustand,
 * hydrated by one snapshot then mutated by patches. No business logic, no
 * fs/git access; VS Code theme via --vscode-* variables. Filters, search,
 * and grouping are CLIENT-side view state (§15.3).
 *
 * Reading design (founder feedback): sessions carry human names, never raw
 * ids; the replay reads like a chat log; consecutive tool runs collapse
 * into one expandable group so conversation stays scannable; commits render
 * as git-style milestone rows; day boundaries get separators.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { HostMessage, SessionListItem } from "../src/protocol.js";
import type { ReplayFrame, Turn, ToolRun } from "@gigaichronicle/core";

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

/** Brand accent (assets/brand): forge orange on the VS Code theme. */
const ACCENT = "#f97316";

const styles: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: "var(--vscode-font-family)",
    color: "var(--vscode-foreground)",
    display: "flex",
    gap: 0,
    height: "100vh",
    boxSizing: "border-box",
  },
  list: {
    width: 300,
    minWidth: 240,
    borderRight: "1px solid var(--vscode-panel-border)",
    padding: 12,
    overflowY: "auto",
  },
  sectionTitle: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.6, margin: "4px 0 10px" },
  card: {
    padding: "10px 12px",
    cursor: "pointer",
    borderRadius: 8,
    border: "1px solid var(--vscode-panel-border)",
    marginBottom: 8,
  },
  cardActive: {
    borderColor: ACCENT,
    background: "var(--vscode-list-activeSelectionBackground)",
  },
  cardTitle: { fontWeight: 600, fontSize: 13, lineHeight: 1.35, marginBottom: 4, wordBreak: "break-word" },
  meta: { fontSize: 11, opacity: 0.75 },
  warn: { color: "var(--vscode-editorWarning-foreground)" },
  chipRow: { display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 },
  chip: {
    fontSize: 10,
    padding: "1px 8px",
    borderRadius: 9,
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
  badge: {
    fontSize: 10,
    padding: "1px 8px",
    borderRadius: 9,
    border: `1px solid ${ACCENT}55`,
    color: ACCENT,
  },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  header: {
    padding: "12px 18px 10px",
    borderBottom: "1px solid var(--vscode-panel-border)",
    background: "var(--vscode-editor-background)",
  },
  headerTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  toolbar: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 },
  search: {
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 12,
    border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))",
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    outline: "none",
    minWidth: 170,
  },
  stream: { overflowY: "auto", flex: 1, padding: "12px 18px 24px" },
  daySep: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "18px 0 10px",
    fontSize: 11,
    opacity: 0.6,
  },
  daySepLine: { flex: 1, borderTop: "1px solid var(--vscode-panel-border)" },
  row: { display: "flex", gap: 10, margin: "10px 0", alignItems: "flex-start" },
  time: { fontSize: 10, opacity: 0.5, minWidth: 34, paddingTop: 6, textAlign: "right" },
  bubbleHuman: {
    background: "var(--vscode-input-background)",
    border: "1px solid var(--vscode-panel-border)",
    borderLeft: `3px solid ${ACCENT}`,
    borderRadius: "4px 10px 10px 10px",
    padding: "7px 12px",
    maxWidth: "76%",
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  bubbleAgent: {
    background: "var(--vscode-editorWidget-background, var(--vscode-editor-background))",
    border: "1px solid var(--vscode-panel-border)",
    borderRadius: "10px 4px 10px 10px",
    padding: "7px 12px",
    maxWidth: "76%",
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  who: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.55, marginBottom: 3 },
  toolGroup: {
    border: "1px dashed var(--vscode-panel-border)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    opacity: 0.9,
    flex: 1,
  },
  toolLine: { padding: "2px 0", fontFamily: "var(--vscode-editor-font-family)", fontSize: 11.5, opacity: 0.85 },
  commit: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--vscode-panel-border)",
    background: "var(--vscode-merge-incomingContentBackground, transparent)",
    fontSize: 12.5,
  },
  commitDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    background: ACCENT,
    boxShadow: `0 0 6px ${ACCENT}88`,
    flexShrink: 0,
  },
  gapRow: {
    flex: 1,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--vscode-editorWarning-foreground)",
    fontSize: 12,
  },
};

function text(value: unknown, max = 4000): string {
  if (value === null || value === undefined) return "(not captured at this tier)";
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  return `(large content: ${(value as { $blob: string }).$blob})`;
}

// ---------------------------------------------------------------- stream model

type StreamEntry =
  | { kind: "day"; day: string }
  | { kind: "turn"; ts: string; turn: Turn }
  | { kind: "tools"; ts: string; runs: ToolRun[] }
  | { kind: "commit"; ts: string; sha: string; subject: string }
  | { kind: "file"; ts: string; path: string; status: string }
  | { kind: "gap"; ts: string; reason: string; detail: string | null };

/** Fold frames into a readable stream: deltas, with consecutive tools grouped. */
function buildStream(frames: readonly ReplayFrame[]): StreamEntry[] {
  const entries: StreamEntry[] = [];
  let day = "";
  const push = (entry: StreamEntry, ts: string): void => {
    const entryDay = ts.slice(0, 10);
    if (entryDay !== day) {
      day = entryDay;
      entries.push({ kind: "day", day });
    }
    entries.push(entry);
  };

  frames.forEach((frame, i) => {
    const prev = i === 0 ? null : (frames[i - 1] ?? null);
    if (prev === null || frame.conversation.length > (prev?.conversation.length ?? 0)) {
      const turn = frame.conversation[frame.conversation.length - 1];
      if (turn !== undefined) push({ kind: "turn", ts: frame.ts, turn }, frame.ts);
      return;
    }
    if (prev !== null && frame.tools.length > prev.tools.length) {
      const run = frame.tools[frame.tools.length - 1];
      if (run === undefined) return;
      const lastEntry = entries[entries.length - 1];
      if (lastEntry !== undefined && lastEntry.kind === "tools") lastEntry.runs.push(run);
      else push({ kind: "tools", ts: frame.ts, runs: [run] }, frame.ts);
      return;
    }
    if (prev !== null && frame.git.commits.length > prev.git.commits.length) {
      const commit = frame.git.commits[frame.git.commits.length - 1];
      if (commit !== undefined)
        push({ kind: "commit", ts: frame.ts, sha: commit.sha, subject: commit.subject }, frame.ts);
      return;
    }
    if (prev !== null && frame.workingSet.length > prev.workingSet.length) {
      const file = frame.workingSet[frame.workingSet.length - 1];
      if (file !== undefined)
        push({ kind: "file", ts: frame.ts, path: file.path, status: file.status }, frame.ts);
      return;
    }
    if (prev !== null && frame.gaps.length > prev.gaps.length) {
      const gap = frame.gaps[frame.gaps.length - 1];
      if (gap !== undefined)
        push({ kind: "gap", ts: frame.ts, reason: gap.reason, detail: gap.detail }, frame.ts);
    }
  });
  return entries;
}

function summarizeRuns(runs: readonly ToolRun[]): string {
  const counts = new Map<string, number>();
  let failures = 0;
  for (const run of runs) {
    counts.set(run.tool, (counts.get(run.tool) ?? 0) + 1);
    if (run.outcome === "failure") failures += 1;
  }
  const parts = [...counts.entries()].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool));
  return `${runs.length} tool run${runs.length > 1 ? "s" : ""} — ${parts.join(", ")}${failures > 0 ? ` · ${failures} failed` : ""}`;
}

const KIND_LABELS: ReadonlyArray<[string, string]> = [
  ["turn", "Conversation"],
  ["tools", "Tools"],
  ["commit", "Git"],
  ["file", "Files"],
  ["gap", "⚠ Gaps"],
];

// ---------------------------------------------------------------- components

function ToolGroup({ entry }: { entry: Extract<StreamEntry, { kind: "tools" }> }): React.JSX.Element {
  return (
    <details style={styles.toolGroup}>
      <summary style={{ cursor: "pointer" }}>🔧 {summarizeRuns(entry.runs)}</summary>
      {entry.runs.map((run, i) => (
        <div key={i} style={styles.toolLine}>
          {run.outcome === "failure" ? "✗" : "·"} {run.tool}
          {run.summary !== null ? ` — ${text(run.summary, 110)}` : ""}
        </div>
      ))}
    </details>
  );
}

function Entry({ entry }: { entry: StreamEntry }): React.JSX.Element | null {
  if (entry.kind === "day") {
    return (
      <div style={styles.daySep}>
        <span style={styles.daySepLine} />
        {new Date(`${entry.day}T00:00:00Z`).toDateString()}
        <span style={styles.daySepLine} />
      </div>
    );
  }
  const time = entry.ts.slice(11, 16);
  return (
    <div style={styles.row}>
      <span style={styles.time}>{time}</span>
      {entry.kind === "turn" ? (
        <div style={entry.turn.role === "human" ? styles.bubbleHuman : styles.bubbleAgent}>
          <div style={styles.who}>{entry.turn.role === "human" ? "You" : "Agent"}</div>
          {text(entry.turn.text)}
        </div>
      ) : entry.kind === "tools" ? (
        <ToolGroup entry={entry} />
      ) : entry.kind === "commit" ? (
        <div style={styles.commit}>
          <span style={styles.commitDot} />
          <code>{entry.sha}</code> {entry.subject}
        </div>
      ) : entry.kind === "file" ? (
        <div style={{ ...styles.toolGroup, borderStyle: "solid" }}>
          {entry.status === "accepted" ? "✅" : entry.status === "rejected" ? "❌" : "✏️"}{" "}
          <code>{entry.path}</code> {entry.status}
        </div>
      ) : (
        <div style={{ ...styles.gapRow, ...styles.warn }}>
          ⚠ capture gap: {entry.reason} {entry.detail ?? ""} — this record is knowingly incomplete here
        </div>
      )}
    </div>
  );
}

function App(): React.JSX.Element {
  const { sessions, activeSession, frames } = useStore();
  const [kinds, setKinds] = React.useState<Set<string>>(
    () => new Set(["turn", "tools", "commit", "file", "gap"]),
  );
  const [search, setSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => query("sessions"), []);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" }); // land on "now"
  }, [frames]);

  const allProviders = React.useMemo(
    () => [...new Set(sessions.flatMap((s) => s.providers))].sort(),
    [sessions],
  );
  const visibleSessions =
    providerFilter === null ? sessions : sessions.filter((s) => s.providers.includes(providerFilter));

  const stream = React.useMemo(() => buildStream(frames), [frames]);
  const visibleStream = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return stream.filter((entry) => {
      if (entry.kind === "day") return true;
      if (!kinds.has(entry.kind)) return false;
      if (needle === "") return true;
      const hay =
        entry.kind === "turn"
          ? text(entry.turn.text)
          : entry.kind === "tools"
            ? entry.runs.map((r) => `${r.tool} ${text(r.summary, 200)}`).join(" ")
            : entry.kind === "commit"
              ? `${entry.sha} ${entry.subject}`
              : entry.kind === "file"
                ? entry.path
                : `${entry.reason} ${entry.detail ?? ""}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [stream, kinds, search]);

  const active = sessions.find((s) => s.session === activeSession);
  const last = frames[frames.length - 1];
  const toggle = (kind: string): void =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div style={styles.app}>
      <div style={styles.list}>
        <div style={styles.sectionTitle}>Sessions</div>
        {allProviders.length > 1 && (
          <div style={{ ...styles.chipRow, marginBottom: 10 }}>
            {["All", ...allProviders].map((p) => {
              const value = p === "All" ? null : p;
              const on = providerFilter === value;
              return (
                <button
                  key={p}
                  style={{ ...styles.chip, ...(on ? styles.chipOn : {}) }}
                  onClick={() => setProviderFilter(on ? null : value)}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}
        {sessions.length === 0 && (
          <p style={styles.meta}>No sessions yet — run `chronicle import` or start working.</p>
        )}
        {visibleSessions.map((s) => (
          <div
            key={s.session}
            style={{ ...styles.card, ...(s.session === activeSession ? styles.cardActive : {}) }}
            onClick={() => query("frames", { session: s.session })}
            title={s.session}
          >
            <div style={styles.cardTitle}>{s.label}</div>
            <div style={styles.meta}>
              {s.startedTs?.slice(0, 16).replace("T", " ") ?? "?"} · {s.turns} turns · {s.tools} tools
              {s.gaps > 0 ? <span style={styles.warn}> · ⚠ {s.gaps}</span> : null}
            </div>
            <div style={styles.chipRow}>
              {[...s.providers, ...s.models].map((badge) => (
                <span key={badge} style={styles.badge}>
                  {badge}
                </span>
              ))}
              <span style={{ ...styles.chip, cursor: "default", opacity: 0.7 }}>fidelity {s.fidelity}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>{active?.label ?? "Replay"}</div>
          {last !== undefined && active !== undefined && (
            <div style={styles.meta}>
              {[...active.providers, ...active.models].join(" · ")}
              {" — "}
              {last.conversation.length} turns · {last.tools.length} tool runs · fidelity{" "}
              <strong>{last.fidelity}</strong>
              {last.gaps.length > 0 ? (
                <span style={styles.warn}> · ⚠ {last.gaps.length} capture gap(s)</span>
              ) : null}
              <span style={{ opacity: 0.45 }}> · {active.session}</span>
            </div>
          )}
          {frames.length > 0 && (
            <div style={styles.toolbar}>
              {KIND_LABELS.map(([kind, label]) => (
                <button
                  key={kind}
                  style={{ ...styles.chip, ...(kinds.has(kind) ? styles.chipOn : {}) }}
                  onClick={() => toggle(kind)}
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
            </div>
          )}
        </div>
        <div style={styles.stream}>
          {frames.length === 0 && (
            <p style={styles.meta}>Pick a session on the left — you land on its latest moment.</p>
          )}
          {visibleStream.map((entry, i) => (
            <Entry key={i} entry={entry} />
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
