/**
 * Timeline webview (§15.2/15.3): PURE REPLAY over the host's compact stream
 * projection, lazy-loaded in newest-first windows (raw frames never cross
 * the wire — they're quadratic). The native sidebar is the one session
 * list; clicking there patches this panel. No business logic here.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { HostMessage, SessionListItem } from "../src/protocol.js";
import type { StreamEntry, StreamSummary, ToolRunLite } from "../src/stream.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

interface TimelineState {
  activeSession: string | null;
  info: SessionListItem | null;
  summary: StreamSummary | null;
  entries: StreamEntry[];
  offset: number;
  totalEntries: number;
  apply(message: HostMessage): void;
}

const useStore = create<TimelineState>((set, get) => ({
  activeSession: null,
  info: null,
  summary: null,
  entries: [],
  offset: 0,
  totalEntries: 0,
  apply: (message) => {
    if (message.kind !== "patch") return;
    const data = message.data;
    if (data.mode === "prepend" && get().activeSession === data.session) {
      const existing = get().entries;
      set({
        entries: [...data.entries, ...existing],
        offset: data.offset,
        ...(data.info !== undefined ? { info: data.info } : {}),
      });
    } else {
      set({
        activeSession: data.session,
        info: data.info ?? null,
        summary: data.summary,
        entries: data.entries,
        offset: data.offset,
        totalEntries: data.totalEntries,
      });
    }
  },
}));

let reqId = 0;
function loadEarlier(session: string, before: number): void {
  vscode.postMessage({ kind: "query", v: 1, reqId: ++reqId, name: "earlier", args: { session, before } });
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  useStore.getState().apply(event.data);
});

/** Brand accent (assets/brand) + live-session green. */
const ACCENT = "#f97316";
const LIVE = "var(--vscode-charts-green, #3fb950)";

const styles: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: "var(--vscode-font-family)",
    color: "var(--vscode-foreground)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    boxSizing: "border-box",
  },
  meta: { fontSize: 11, opacity: 0.75 },
  warn: { color: "var(--vscode-editorWarning-foreground)" },
  badge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${ACCENT}55`, color: ACCENT },
  liveBadge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${LIVE}`, color: LIVE, fontWeight: 600 },
  header: { padding: "12px 18px 10px", borderBottom: "1px solid var(--vscode-panel-border)", background: "var(--vscode-editor-background)" },
  headerTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  toolbar: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 },
  chip: { fontSize: 10, padding: "1px 8px", borderRadius: 9, cursor: "pointer", border: "1px solid var(--vscode-panel-border)", background: "transparent", color: "var(--vscode-foreground)" },
  chipOn: { background: "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", borderColor: "var(--vscode-badge-background)" },
  search: { fontSize: 12, padding: "3px 10px", borderRadius: 12, border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))", background: "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", outline: "none", minWidth: 170 },
  stream: { overflowY: "auto", flex: 1, padding: "12px 18px 24px" },
  loadEarlier: {
    display: "block",
    margin: "0 auto 14px",
    fontSize: 11,
    padding: "4px 14px",
    borderRadius: 12,
    cursor: "pointer",
    border: `1px solid ${ACCENT}77`,
    background: "transparent",
    color: ACCENT,
  },
  centerNote: { margin: "48px auto", maxWidth: 480, textAlign: "center", fontSize: 13, lineHeight: 1.6, opacity: 0.85 },
  daySep: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px", fontSize: 11, opacity: 0.6 },
  daySepLine: { flex: 1, borderTop: "1px solid var(--vscode-panel-border)" },
  sessionMark: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.65, fontStyle: "italic", flex: 1, padding: "2px 0" },
  row: { display: "flex", gap: 10, margin: "10px 0", alignItems: "flex-start" },
  time: { fontSize: 10, opacity: 0.5, minWidth: 34, paddingTop: 6, textAlign: "right" },
  bubbleHuman: { background: "var(--vscode-input-background)", border: "1px solid var(--vscode-panel-border)", borderLeft: `3px solid ${ACCENT}`, borderRadius: "4px 10px 10px 10px", padding: "7px 12px", maxWidth: "76%", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  bubbleAgent: { background: "var(--vscode-editorWidget-background, var(--vscode-editor-background))", border: "1px solid var(--vscode-panel-border)", borderRadius: "10px 4px 10px 10px", padding: "7px 12px", maxWidth: "76%", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  who: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.55, marginBottom: 3 },
  toolGroup: { border: "1px dashed var(--vscode-panel-border)", borderRadius: 8, padding: "5px 10px", fontSize: 12, opacity: 0.9, flex: 1 },
  toolLine: { padding: "2px 0", fontFamily: "var(--vscode-editor-font-family)", fontSize: 11.5, opacity: 0.85 },
  commit: { display: "flex", alignItems: "center", gap: 8, flex: 1, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--vscode-panel-border)", background: "var(--vscode-merge-incomingContentBackground, transparent)", fontSize: 12.5 },
  commitDot: { width: 9, height: 9, borderRadius: 5, background: ACCENT, boxShadow: `0 0 6px ${ACCENT}88`, flexShrink: 0 },
  gapRow: { flex: 1, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--vscode-editorWarning-foreground)", fontSize: 12 },
};

function turnText(entry: Extract<StreamEntry, { kind: "turn" }>, max = 4000): string {
  if (entry.large !== null) return `(large content: ${entry.large})`;
  if (entry.text === null) return "(not captured at this tier)";
  return entry.text.length > max ? `${entry.text.slice(0, max - 1)}…` : entry.text;
}

function summarizeRuns(runs: readonly ToolRunLite[]): string {
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
      {entry.kind === "session" ? (
        <div style={styles.sessionMark}>
          <span style={{ ...styles.commitDot, background: "var(--vscode-descriptionForeground)", boxShadow: "none" }} />
          {entry.note}
        </div>
      ) : entry.kind === "turn" ? (
        <div style={entry.role === "human" ? styles.bubbleHuman : styles.bubbleAgent}>
          <div style={styles.who}>{entry.role === "human" ? "You" : "Agent"}</div>
          {turnText(entry)}
        </div>
      ) : entry.kind === "tools" ? (
        <details style={styles.toolGroup}>
          <summary style={{ cursor: "pointer" }}>🔧 {summarizeRuns(entry.runs)}</summary>
          {entry.runs.map((run, i) => (
            <div key={i} style={styles.toolLine}>
              {run.outcome === "failure" ? "✗" : "·"} {run.tool}
              {run.summary !== null ? ` — ${run.summary.slice(0, 110)}` : ""}
            </div>
          ))}
        </details>
      ) : entry.kind === "commit" ? (
        <div style={styles.commit}>
          <span style={styles.commitDot} />
          <code>{entry.sha}</code> {entry.subject}
        </div>
      ) : entry.kind === "file" ? (
        <div style={{ ...styles.toolGroup, borderStyle: "solid" }}>
          {entry.status === "accepted" ? "✅" : entry.status === "rejected" ? "❌" : "✏️"} <code>{entry.path}</code> {entry.status}
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
  const { activeSession, info, summary, entries, offset, totalEntries } = useStore();
  const [kinds, setKinds] = React.useState<Set<string>>(() => new Set(["turn", "tools", "commit", "file", "gap"]));
  const [search, setSearch] = React.useState("");
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const lastMode = React.useRef<"replace" | "prepend">("replace");

  // Land on "now" only when a session is (re)selected — not when history
  // is prepended (that would yank the reader away from what they loaded).
  React.useEffect(() => {
    if (lastMode.current === "replace") endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);
  React.useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      lastMode.current = state.activeSession !== prev.activeSession ? "replace" : "prepend";
    });
    return unsub;
  }, []);

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entry.kind === "day" || entry.kind === "session") return true;
      if (!kinds.has(entry.kind)) return false;
      if (needle === "") return true;
      const hay =
        entry.kind === "turn"
          ? (entry.text ?? "")
          : entry.kind === "tools"
            ? entry.runs.map((r) => `${r.tool} ${r.summary ?? ""}`).join(" ")
            : entry.kind === "commit"
              ? `${entry.sha} ${entry.subject}`
              : entry.kind === "file"
                ? entry.path
                : `${entry.reason} ${entry.detail ?? ""}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [entries, kinds, search]);

  const isEmpty = summary !== null && summary.turns === 0 && summary.tools === 0;
  const toggle = (kind: string): void =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div style={styles.app}>
      <div style={{ ...styles.header, ...(info?.live === true ? { borderTop: `2px solid ${LIVE}` } : {}) }}>
        <div style={styles.headerTitle}>{info?.label ?? "Chronicle Replay"}</div>
        {summary !== null && (
          <div style={styles.meta}>
            {info?.live === true && <span style={{ ...styles.liveBadge, marginRight: 6 }}>● live now</span>}
            {info !== null &&
              [...info.providers, ...info.models].map((badge) => (
                <span key={badge} style={{ ...styles.badge, marginRight: 4 }}>
                  {badge}
                </span>
              ))}
            {summary.turns} turns · {summary.tools} tool runs · fidelity <strong>{summary.fidelity}</strong>
            {summary.gaps > 0 ? <span style={styles.warn}> · ⚠ {summary.gaps} capture gap(s)</span> : null}
            {activeSession !== null ? <span style={{ opacity: 0.45 }}> · {activeSession}</span> : null}
          </div>
        )}
        {entries.length > 0 && !isEmpty && (
          <div style={styles.toolbar}>
            {KIND_LABELS.map(([kind, label]) => (
              <button key={kind} style={{ ...styles.chip, ...(kinds.has(kind) ? styles.chipOn : {}) }} onClick={() => toggle(kind)}>
                {label}
              </button>
            ))}
            <input style={styles.search} placeholder="search loaded moments…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>
      <div style={styles.stream}>
        {activeSession === null ? (
          <div style={styles.centerNote}>
            <p style={{ fontSize: 28, margin: "0 0 8px" }}>🕰️</p>
            Pick a session in the <strong>Chronicle sidebar</strong> to replay it here.
            <br />
            You always land on its latest moment.
          </div>
        ) : isEmpty ? (
          <div style={styles.centerNote}>
            <p style={{ fontSize: 28, margin: "0 0 8px" }}>🌱</p>
            This session started at <strong>{summary?.startedTs?.slice(11, 16) ?? "?"}</strong> (UTC) but nothing has
            been captured in it yet — no prompts, no tool runs.
            <br />
            <span style={styles.meta}>It fills up live as that session is used. Chronicle shows empty sessions honestly instead of hiding them.</span>
          </div>
        ) : (
          <>
            {offset > 0 && (
              <button style={styles.loadEarlier} onClick={() => loadEarlier(activeSession, offset)}>
                ↑ load earlier moments ({offset} before this point)
              </button>
            )}
            {visible.map((entry, i) => (
              <Entry key={offset + i} entry={entry} />
            ))}
            <span style={{ ...styles.meta, display: "block", textAlign: "center", marginTop: 8 }}>
              showing {entries.length} of {totalEntries} moments
            </span>
          </>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
