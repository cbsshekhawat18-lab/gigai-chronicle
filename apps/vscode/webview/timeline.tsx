/**
 * The Chronicle dashboard (§15.2, roadmap v0.2): ONE webview, now a workspace
 * — a nav rail, a tabbed session view, a prompt library, and settings — still
 * PURE REPLAY over the host's compact stream projection. Raw frames never
 * cross the wire (they're quadratic); windows lazy-load newest-first. No
 * business logic, no fs/git here.
 *
 * Honesty rule the UI obeys: it shows only what the store actually holds —
 * turns, tool runs, files touched, fidelity, gaps. There is no token meter,
 * because Chronicle captures no token counts.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { HostMessage, PromptWithHistory, SessionListItem, SettingsInfo } from "../src/protocol.js";
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
  sessions: SessionListItem[];
  prompts: PromptWithHistory[];
  settings: SettingsInfo | null;
  apply(message: HostMessage): void;
}

const useStore = create<TimelineState>((set, get) => ({
  activeSession: null,
  info: null,
  summary: null,
  entries: [],
  offset: 0,
  totalEntries: 0,
  sessions: [],
  prompts: [],
  settings: null,
  apply: (message) => {
    if (message.kind === "snapshot") {
      set({
        sessions: message.data.sessions,
        ...(message.data.prompts !== undefined ? { prompts: message.data.prompts } : {}),
        ...(message.data.settings !== undefined ? { settings: message.data.settings } : {}),
      });
      return;
    }
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
function send(message: Record<string, unknown>): void {
  vscode.postMessage({ v: 1, reqId: ++reqId, ...message });
}
function loadSessions(): void {
  send({ kind: "query", name: "sessions" });
}
function openSession(session: string): void {
  send({ kind: "query", name: "frames", args: { session } });
}
function loadEarlier(session: string, before: number): void {
  send({ kind: "query", name: "earlier", args: { session, before } });
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  useStore.getState().apply(event.data);
});

/** Brand accent (assets/brand) + live-session green. */
const ACCENT = "#f97316";
const LIVE = "var(--vscode-charts-green, #3fb950)";
const BORDER = "1px solid var(--vscode-panel-border)";

const styles: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: "var(--vscode-font-family)",
    color: "var(--vscode-foreground)",
    display: "flex",
    height: "100vh",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  // ---- nav rail ---------------------------------------------------------
  rail: {
    width: 208,
    flexShrink: 0,
    borderRight: BORDER,
    background: "var(--vscode-sideBar-background, var(--vscode-editor-background))",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  brand: { padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 3, background: ACCENT, boxShadow: `0 0 8px ${ACCENT}88` },
  brandName: { fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 },
  navGroupLabel: { padding: "10px 16px 4px", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.45 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 16px",
    fontSize: 13,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "var(--vscode-foreground)",
    width: "100%",
    textAlign: "left",
  },
  navItemOn: { background: "var(--vscode-list-activeSelectionBackground)", color: "var(--vscode-list-activeSelectionForeground)", boxShadow: `inset 3px 0 0 ${ACCENT}` },
  navGlyph: { width: 16, textAlign: "center", opacity: 0.85 },
  recentItem: { padding: "6px 16px 6px 18px", cursor: "pointer", border: "none", background: "transparent", color: "var(--vscode-foreground)", width: "100%", textAlign: "left", display: "block", borderLeft: "2px solid transparent" },
  recentItemOn: { borderLeft: `2px solid ${ACCENT}`, background: "var(--vscode-list-inactiveSelectionBackground)" },
  recentTitle: { fontSize: 12.5, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  recentMeta: { fontSize: 10, opacity: 0.55, marginTop: 1 },
  // ---- main -------------------------------------------------------------
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  meta: { fontSize: 11, opacity: 0.75 },
  warn: { color: "var(--vscode-editorWarning-foreground)" },
  badge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${ACCENT}55`, color: ACCENT },
  liveBadge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${LIVE}`, color: LIVE, fontWeight: 600 },
  header: { padding: "14px 20px 0", borderBottom: BORDER, background: "var(--vscode-editor-background)" },
  headerTitle: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  statChip: { display: "inline-flex", gap: 5, alignItems: "baseline", marginRight: 12 },
  statNum: { fontWeight: 600 },
  tabs: { display: "flex", gap: 2, marginTop: 10, alignItems: "center", flexWrap: "wrap" },
  tab: { fontSize: 12, padding: "6px 12px", cursor: "pointer", border: "none", borderBottom: "2px solid transparent", background: "transparent", color: "var(--vscode-foreground)", opacity: 0.7 },
  tabOn: { opacity: 1, borderBottom: `2px solid ${ACCENT}`, fontWeight: 600 },
  search: { marginLeft: "auto", fontSize: 12, padding: "3px 10px", borderRadius: 12, border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))", background: "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", outline: "none", minWidth: 160 },
  compareBar: { display: "flex", alignItems: "center", gap: 10, padding: "6px 20px", fontSize: 12, background: `${ACCENT}18`, borderBottom: `1px solid ${ACCENT}55` },
  stream: { overflowY: "auto", flex: 1, padding: "12px 20px 28px" },
  panel: { overflowY: "auto", flex: 1, padding: "18px 22px 28px" },
  loadEarlier: { display: "block", margin: "0 auto 14px", fontSize: 11, padding: "4px 14px", borderRadius: 12, cursor: "pointer", border: `1px solid ${ACCENT}77`, background: "transparent", color: ACCENT },
  centerNote: { margin: "56px auto", maxWidth: 480, textAlign: "center", fontSize: 13, lineHeight: 1.6, opacity: 0.85 },
  daySep: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px", fontSize: 11, opacity: 0.6 },
  daySepLine: { flex: 1, borderTop: BORDER },
  sessionMark: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.65, fontStyle: "italic", flex: 1, padding: "2px 0" },
  row: { display: "flex", gap: 10, margin: "10px 0", alignItems: "flex-start" },
  time: { fontSize: 10, opacity: 0.5, minWidth: 34, paddingTop: 6, textAlign: "right" },
  bubbleHuman: { background: "var(--vscode-input-background)", border: BORDER, borderLeft: `3px solid ${ACCENT}`, borderRadius: "4px 10px 10px 10px", padding: "7px 12px", maxWidth: "76%", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  bubbleAgent: { background: "var(--vscode-editorWidget-background, var(--vscode-editor-background))", border: BORDER, borderRadius: "10px 4px 10px 10px", padding: "7px 12px", maxWidth: "76%", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  who: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.55, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 },
  miniBtn: { fontSize: 10, padding: "1px 8px", borderRadius: 9, cursor: "pointer", border: BORDER, background: "transparent", color: "var(--vscode-foreground)" },
  miniBtnOn: { border: `1px solid ${ACCENT}`, color: ACCENT, fontWeight: 600 },
  toolGroup: { border: "1px dashed var(--vscode-panel-border)", borderRadius: 8, padding: "5px 10px", fontSize: 12, opacity: 0.9, flex: 1 },
  toolLine: { padding: "2px 0", fontFamily: "var(--vscode-editor-font-family)", fontSize: 11.5, opacity: 0.85 },
  commit: { display: "flex", alignItems: "center", gap: 8, flex: 1, padding: "6px 12px", borderRadius: 8, border: BORDER, background: "var(--vscode-merge-incomingContentBackground, transparent)", fontSize: 12.5 },
  commitDot: { width: 9, height: 9, borderRadius: 5, background: ACCENT, boxShadow: `0 0 6px ${ACCENT}88`, flexShrink: 0 },
  gapRow: { flex: 1, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--vscode-editorWarning-foreground)", fontSize: 12 },
  card: { border: BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 10, cursor: "pointer", background: "var(--vscode-editorWidget-background, transparent)" },
  cardTitle: { fontSize: 13.5, fontWeight: 600, marginBottom: 4 },
  panelH: { fontSize: 15, fontWeight: 700, margin: "0 0 4px" },
  panelSub: { fontSize: 12, opacity: 0.7, margin: "0 0 16px" },
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

type Tab = "conversation" | "tools" | "git" | "files" | "gaps";
const TABS: ReadonlyArray<[Tab, string]> = [
  ["conversation", "Conversation"],
  ["tools", "Tools"],
  ["git", "Git"],
  ["files", "Files"],
  ["gaps", "⚠ Gaps"],
];
const TAB_KIND: Record<Exclude<Tab, "conversation">, string> = { tools: "tools", git: "commit", files: "file", gaps: "gap" };

type View = "timeline" | "sessions" | "prompts" | "settings";
const NAV: ReadonlyArray<{ view: View; label: string; glyph: string; tab?: Tab }> = [
  { view: "timeline", label: "Timeline", glyph: "◷" },
  { view: "sessions", label: "Sessions", glyph: "▤" },
  { view: "prompts", label: "Prompts", glyph: "▷" },
  { view: "timeline", label: "Commits", glyph: "⎇", tab: "git" },
  { view: "timeline", label: "Files", glyph: "▦", tab: "files" },
  { view: "settings", label: "Settings", glyph: "⚙" },
];

function Entry({
  entry,
  compareA,
  onCompare,
}: {
  entry: StreamEntry;
  compareA: string | null;
  onCompare: (eventId: string) => void;
}): React.JSX.Element | null {
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
          <div style={styles.who}>
            <span>{entry.role === "human" ? "You" : "Agent"}</span>
            {entry.role === "human" && (
              <button
                style={{ ...styles.miniBtn, ...(compareA === entry.eventId ? styles.miniBtnOn : {}) }}
                title="Compare this prompt's wording against another (opens the native diff editor)"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onCompare(entry.eventId);
                }}
              >
                {compareA === entry.eventId ? "✓ comparing…" : "⇄ compare"}
              </button>
            )}
            {entry.role === "human" && entry.restorable && (
              <button
                style={styles.miniBtn}
                title="Put your code back to how it was at this prompt (safety-checkpointed)"
                onClick={(ev) => {
                  ev.stopPropagation();
                  send({ kind: "restore", eventId: entry.eventId });
                }}
              >
                ⏪ restore code
              </button>
            )}
          </div>
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

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }): React.JSX.Element {
  return (
    <span style={{ ...styles.statChip, ...(warn === true ? styles.warn : {}) }}>
      <span style={styles.statNum}>{n}</span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </span>
  );
}

function NavRail({
  view,
  tab,
  sessions,
  activeSession,
  onNav,
}: {
  view: View;
  tab: Tab;
  sessions: SessionListItem[];
  activeSession: string | null;
  onNav: (view: View, tab?: Tab) => void;
}): React.JSX.Element {
  return (
    <div style={styles.rail}>
      <div style={styles.brand}>
        <span style={styles.brandDot} />
        <span style={styles.brandName}>Gigai Chronicle</span>
      </div>
      {NAV.map((item) => {
        const on = item.tab !== undefined ? view === "timeline" && tab === item.tab : view === item.view && (item.view !== "timeline" || tab === "conversation");
        return (
          <button
            key={item.label}
            style={{ ...styles.navItem, ...(on ? styles.navItemOn : {}) }}
            onClick={() => onNav(item.view, item.tab)}
          >
            <span style={styles.navGlyph}>{item.glyph}</span>
            {item.label}
          </button>
        );
      })}
      <div style={styles.navGroupLabel}>Recent sessions</div>
      {sessions.length === 0 ? (
        <div style={{ ...styles.recentMeta, padding: "2px 16px 10px" }}>none yet</div>
      ) : (
        sessions.slice(0, 10).map((s) => (
          <button
            key={s.session}
            style={{ ...styles.recentItem, ...(activeSession === s.session ? styles.recentItemOn : {}) }}
            title={s.label}
            onClick={() => openSession(s.session)}
          >
            <div style={styles.recentTitle}>
              {s.live ? "● " : ""}
              {s.label}
            </div>
            <div style={styles.recentMeta}>
              {s.turns} turns{s.tools > 0 ? ` · ${s.tools} tools` : ""}
              {s.gaps > 0 ? ` · ⚠${s.gaps}` : ""}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

/**
 * A prompt's display name — full automation: an explicit title wins, else the
 * first line of the content (like a commit subject), else the id. So you never
 * have to name a prompt; it names itself from what you write.
 */
function promptName(p: { body: string; title: string; slug: string }): string {
  if (p.title !== "") return p.title; // an explicit title always wins
  const line = p.body.split("\n").map((l) => l.trim()).find((l) => l !== "");
  if (line !== undefined && line !== "") return line.length > 72 ? `${line.slice(0, 71)}…` : line;
  return p.slug;
}

/**
 * The prompt library with its lifecycle: ● used (capture observed it
 * submitted) vs ○ saved for later (research, waiting). "Use" copies the body
 * to the clipboard; the used-count only moves when capture actually sees the
 * prompt submitted — an observation, never a click counter.
 */
function PromptsPanel({ prompts }: { prompts: PromptWithHistory[] }): React.JSX.Element {
  const [compareA, setCompareA] = React.useState<{ slug: string; version: number } | null>(null);
  const used = prompts.filter((p) => p.status === "used");
  const saved = prompts.filter((p) => p.status === "saved");
  const unavailable = prompts.filter((p) => p.status === "unknown");

  const onCompare = (slug: string, version: number): void => {
    if (compareA === null) {
      setCompareA({ slug, version });
    } else if (compareA.slug === slug && compareA.version === version) {
      setCompareA(null);
    } else {
      send({ kind: "compareLibrary", aSlug: compareA.slug, aVersion: compareA.version, bSlug: slug, bVersion: version });
      setCompareA(null);
    }
  };

  const card = (p: PromptWithHistory): React.JSX.Element => {
    const comparing = compareA !== null && compareA.slug === p.slug;
    return (
      <div key={p.slug} style={{ ...styles.card, cursor: "default" }}>
        <div style={{ ...styles.cardTitle, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ cursor: "pointer" }} onClick={() => send({ kind: "openPrompt", slug: p.slug, version: p.version })}>
            {promptName(p)}
          </span>
          {p.status === "used" ? (
            <span style={{ ...styles.badge, borderColor: `${LIVE}`, color: LIVE }}>
              ● used{p.uses > 0 ? ` ×${p.uses}` : ""}
            </span>
          ) : p.status === "unknown" ? (
            <span style={{ ...styles.badge, ...styles.warn, borderColor: "var(--vscode-editorWarning-foreground)" }}>
              usage unavailable
            </span>
          ) : (
            <span style={{ ...styles.badge, opacity: 0.75, borderColor: "var(--vscode-panel-border)", color: "var(--vscode-foreground)" }}>
              ○ saved for later
            </span>
          )}
        </div>
        <div style={styles.meta}>
          <code>{p.slug}</code> · v{p.version}
          {p.tags.length > 0 ? ` · ${p.tags.map((t) => `#${t}`).join(" ")}` : ""}
          {p.lastUsedTs !== null ? ` · last used ${p.lastUsedTs.slice(0, 10)}` : ""}
          {p.note !== null ? ` · “${p.note}”` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button
            style={styles.miniBtn}
            title="Copy the prompt to your clipboard — paste it into your AI tool. Counts as used once capture sees it submitted."
            onClick={() => send({ kind: "usePrompt", slug: p.slug, version: p.version })}
          >
            ▷ use
          </button>
          <button
            style={styles.miniBtn}
            title="View this version in the editor"
            onClick={() => send({ kind: "openPrompt", slug: p.slug, version: p.version })}
          >
            open
          </button>
          <button
            style={{ ...styles.miniBtn, ...(comparing ? styles.miniBtnOn : {}) }}
            title="Compare this prompt against another (opens the native diff editor)"
            onClick={() => onCompare(p.slug, p.version)}
          >
            {comparing ? "✓ comparing…" : "⇄ compare"}
          </button>
        </div>
        {p.history.length > 1 && (
          <div style={{ ...styles.meta, marginTop: 8 }}>
            {p.history.slice(0, 4).map((node) => (
              <div key={node.version} style={{ padding: "1px 0" }}>
                <code>v{node.version}</code> {node.preview.slice(0, 70)}
                <span style={{ opacity: 0.6 }}>
                  {node.added > 0 ? ` +${node.added}` : ""}
                  {node.removed > 0 ? ` −${node.removed}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={styles.panelH}>Prompt library</h2>
        <button
          style={{ ...styles.miniBtn, borderColor: `${ACCENT}88`, color: ACCENT }}
          title="Save a prompt you typed into the library — pick from your captured prompts, no retyping"
          onClick={() => send({ kind: "savePrompt" })}
        >
          ＋ Save a prompt
        </button>
      </div>
      <p style={styles.panelSub}>
        Versioned, diffable, shared by git. <strong>▷ use</strong> copies a prompt for your AI tool; it counts as{" "}
        <strong>used</strong> only when capture sees it actually submitted.
      </p>
      {compareA !== null && (
        <div style={{ ...styles.compareBar, borderRadius: 8, marginBottom: 12 }}>
          <span>⇄ Comparing {compareA.slug} — pick a second prompt, or</span>
          <button style={styles.miniBtn} onClick={() => setCompareA(null)}>
            cancel
          </button>
        </div>
      )}
      {prompts.length === 0 ? (
        <div style={styles.centerNote}>
          <p style={{ fontSize: 26, margin: "0 0 8px" }}>▷</p>
          Nothing saved yet.
          <br />
          <button
            style={{ ...styles.loadEarlier, margin: "14px auto 6px", padding: "6px 16px" }}
            onClick={() => send({ kind: "savePrompt" })}
          >
            ＋ Save a prompt
          </button>
          <br />
          <span style={styles.meta}>
            Write a new one to keep for later, or promote a prompt you typed — no retyping.
          </span>
        </div>
      ) : (
        <>
          {used.length > 0 && (
            <>
              <div style={styles.navGroupLabel}>In use · {used.length}</div>
              {used.map(card)}
            </>
          )}
          {saved.length > 0 && (
            <>
              <div style={styles.navGroupLabel}>Saved for later · {saved.length}</div>
              {saved.map(card)}
            </>
          )}
          {unavailable.length > 0 && (
            <>
              <div style={{ ...styles.navGroupLabel, ...styles.warn }}>Usage unavailable · {unavailable.length}</div>
              {unavailable.map(card)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SessionsPanel({ sessions }: { sessions: SessionListItem[] }): React.JSX.Element {
  return (
    <div style={styles.panel}>
      <h2 style={styles.panelH}>Sessions</h2>
      <p style={styles.panelSub}>Every captured session, newest first. Open one to replay it — conversation, tools, git and files interleaved.</p>
      {sessions.length === 0 ? (
        <div style={styles.centerNote}>No sessions captured yet. They appear here live as you work with capture running.</div>
      ) : (
        sessions.map((s) => (
          <div key={s.session} style={styles.card} onClick={() => openSession(s.session)}>
            <div style={styles.cardTitle}>
              {s.live ? <span style={{ color: LIVE }}>● </span> : null}
              {s.label}
            </div>
            <div style={styles.meta}>
              {[...s.providers, ...s.models].map((b) => (
                <span key={b} style={{ ...styles.badge, marginRight: 4 }}>
                  {b}
                </span>
              ))}
              {s.turns} turns · {s.tools} tool runs · fidelity <strong>{s.fidelity}</strong>
              {s.gaps > 0 ? <span style={styles.warn}> · ⚠ {s.gaps} gap(s)</span> : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "3px 0", fontSize: 12 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
}

/** on/off pill — green when a protective setting is on. */
function OnOff({ on }: { on: boolean }): React.JSX.Element {
  return <span style={{ color: on ? LIVE : undefined, opacity: on ? 1 : 0.55 }}>{on ? "on" : "off"}</span>;
}

function SettingsPanel({
  settings,
  sessions,
  prompts,
}: {
  settings: SettingsInfo | null;
  sessions: SessionListItem[];
  prompts: PromptWithHistory[];
}): React.JSX.Element {
  const providersSeen = [...new Set(sessions.flatMap((s) => s.providers))].sort();
  const modelsSeen = [...new Set(sessions.flatMap((s) => s.models))].sort();
  const fidelity: Record<string, number> = { full: 0, partial: 0, lossy: 0 };
  for (const s of sessions) fidelity[s.fidelity] = (fidelity[s.fidelity] ?? 0) + 1;
  const gaps = sessions.reduce((n, s) => n + s.gaps, 0);

  return (
    <div style={styles.panel}>
      <h2 style={styles.panelH}>Settings &amp; posture</h2>
      <p style={styles.panelSub}>
        A read-only view of this repo&apos;s Chronicle store. It never calls a model and nothing here
        leaves your machine — change capture from the CLI; the dashboard only reads.
      </p>

      <div style={{ ...styles.card, cursor: "default" }}>
        <div style={styles.cardTitle}>Project</div>
        <Row label="name">{settings?.projectName ?? "—"}</Row>
        <Row label="store">
          <code style={{ fontSize: 11, opacity: 0.85 }}>{settings?.storePath ?? ".chronicle"}</code>
        </Row>
      </div>

      <div style={{ ...styles.card, cursor: "default" }}>
        <div style={styles.cardTitle}>Capture</div>
        <Row label="providers">
          {settings && settings.providers.length > 0
            ? settings.providers.map((p) => (
                <span key={p.id} style={{ ...styles.badge, marginLeft: 4, opacity: p.mode === "off" ? 0.4 : 1 }}>
                  {p.id} · {p.mode}
                </span>
              ))
            : "—"}
        </Row>
        <Row label="redact secrets">
          <OnOff on={settings?.redactSecrets ?? true} />
          {settings && settings.customPatterns > 0 ? (
            <span style={styles.meta}> · {settings.customPatterns} custom</span>
          ) : null}
        </Row>
        <Row label="default visibility">{settings?.visibility ?? "private"}</Row>
        <Row label="git commit trailer">
          <OnOff on={settings?.gitTrailer ?? false} />
        </Row>
      </div>

      <div style={{ ...styles.card, cursor: "default" }}>
        <div style={styles.cardTitle}>What Chronicle is holding</div>
        <Row label="sessions">{sessions.length}</Row>
        <Row label="saved prompts">{prompts.length}</Row>
        {providersSeen.length > 0 && <Row label="providers seen">{providersSeen.join(", ")}</Row>}
        {modelsSeen.length > 0 && <Row label="models seen">{modelsSeen.join(", ")}</Row>}
        <Row label="fidelity">
          {fidelity.full} full
          {fidelity.partial ? <span style={styles.meta}> · {fidelity.partial} partial</span> : null}
          {fidelity.lossy ? <span style={styles.meta}> · {fidelity.lossy} lossy</span> : null}
        </Row>
        {gaps > 0 && (
          <Row label="capture gaps">
            <span style={styles.warn}>{gaps}</span>
          </Row>
        )}
      </div>

      <div style={{ ...styles.card, cursor: "default" }}>
        <div style={styles.cardTitle}>Storage</div>
        <Row label="retention">{settings?.retention ?? "keep-all"}</Row>
        <Row label="session digests">
          <OnOff on={settings?.sessionDigest ?? false} />
        </Row>
      </div>

      <div style={{ ...styles.card, cursor: "default" }}>
        <div style={styles.cardTitle}>The promises</div>
        <div style={{ ...styles.meta, lineHeight: 1.7 }}>
          Local-first · plain text · zero network by default · never calls a model · never writes your
          git history · never scores developers.
          <br />
          Change capture, redaction, and privacy from the CLI: <code>chronicle init</code> ·{" "}
          <code>chronicle doctor</code> · <code>chronicle hooks</code>.
        </div>
      </div>
    </div>
  );
}

function App(): React.JSX.Element {
  const { activeSession, info, summary, entries, offset, totalEntries, sessions, prompts, settings } = useStore();
  const [view, setView] = React.useState<View>("timeline");
  const [tab, setTab] = React.useState<Tab>("conversation");
  const [search, setSearch] = React.useState("");
  const [compareA, setCompareA] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const lastMode = React.useRef<"replace" | "prepend">("replace");

  React.useEffect(() => loadSessions(), []);
  React.useEffect(() => {
    if (view === "timeline" && lastMode.current === "replace") endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, view]);
  React.useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      lastMode.current = state.activeSession !== prev.activeSession ? "replace" : "prepend";
    });
    return unsub;
  }, []);

  const onNav = (next: View, nextTab?: Tab): void => {
    setView(next);
    if (next === "timeline") setTab(nextTab ?? "conversation");
    if (nextTab === undefined && next === "timeline") setTimeout(() => searchRef.current?.focus(), 0);
  };

  const onCompare = (eventId: string): void => {
    if (compareA === null) {
      setCompareA(eventId);
    } else if (compareA === eventId) {
      setCompareA(null);
    } else {
      send({ kind: "compare", a: compareA, b: eventId });
      setCompareA(null);
    }
  };

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      // Day/session separators are chronological chrome — only in Conversation.
      // In a filtered tab they'd be orphans (all the empty date lines the user
      // saw), so drop them: the tab shows its entries, or a clean empty state.
      if (entry.kind === "day") return tab === "conversation";
      if (entry.kind === "session") return tab === "conversation";
      if (tab !== "conversation" && entry.kind !== TAB_KIND[tab]) return false;
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
  }, [entries, tab, search]);

  const isEmpty = summary !== null && summary.turns === 0 && summary.tools === 0;

  return (
    <div style={styles.app}>
      <NavRail view={view} tab={tab} sessions={sessions} activeSession={activeSession} onNav={onNav} />
      <div style={styles.main}>
        {view === "prompts" ? (
          <PromptsPanel prompts={prompts} />
        ) : view === "sessions" ? (
          <SessionsPanel sessions={sessions} />
        ) : view === "settings" ? (
          <SettingsPanel settings={settings} sessions={sessions} prompts={prompts} />
        ) : (
          <>
            <div style={{ ...styles.header, ...(info?.live === true ? { borderTop: `2px solid ${LIVE}` } : {}) }}>
              <div style={styles.headerTitle}>{info?.label ?? (activeSession === null ? "Chronicle" : "Replay")}</div>
              {summary !== null && (
                <div style={styles.meta}>
                  {info?.live === true && <span style={{ ...styles.liveBadge, marginRight: 6 }}>● live now</span>}
                  {info !== null &&
                    [...info.providers, ...info.models].map((badge) => (
                      <span key={badge} style={{ ...styles.badge, marginRight: 4 }}>
                        {badge}
                      </span>
                    ))}
                  <span style={{ marginLeft: info !== null ? 6 : 0 }}>
                    <Stat n={summary.turns} label="turns" />
                    <Stat n={summary.tools} label="tool runs" />
                    <Stat n={summary.files} label="files" />
                    <span style={styles.statChip}>
                      <span style={styles.statNum}>{summary.fidelity}</span>
                      <span style={{ opacity: 0.7 }}>fidelity</span>
                    </span>
                    {summary.gaps > 0 ? <Stat n={summary.gaps} label="gaps" warn /> : null}
                  </span>
                </div>
              )}
              <div style={styles.tabs}>
                {TABS.map(([key, label]) => (
                  <button key={key} style={{ ...styles.tab, ...(tab === key ? styles.tabOn : {}) }} onClick={() => setTab(key)}>
                    {label}
                  </button>
                ))}
                <input
                  ref={searchRef}
                  style={styles.search}
                  placeholder="search loaded moments…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {compareA !== null && (
              <div style={styles.compareBar}>
                <span>⇄ Comparing — pick a second prompt to diff its wording, or</span>
                <button style={styles.miniBtn} onClick={() => setCompareA(null)}>
                  cancel
                </button>
              </div>
            )}
            <div style={styles.stream}>
              {activeSession === null ? (
                <div style={styles.centerNote}>
                  <p style={{ fontSize: 28, margin: "0 0 8px" }}>🕰️</p>
                  Pick a session on the left to replay it here.
                  <br />
                  You always land on its latest moment.
                </div>
              ) : isEmpty ? (
                <div style={styles.centerNote}>
                  <p style={{ fontSize: 28, margin: "0 0 8px" }}>🌱</p>
                  This session started at <strong>{summary?.startedTs?.slice(11, 16) ?? "?"}</strong> (UTC) but nothing has been
                  captured in it yet.
                  <br />
                  <span style={styles.meta}>It fills up live as that session is used. Chronicle shows empty sessions honestly instead of hiding them.</span>
                </div>
              ) : (
                <>
                  {tab === "conversation" && offset > 0 && (
                    <button style={styles.loadEarlier} onClick={() => loadEarlier(activeSession, offset)}>
                      ↑ load earlier moments ({offset} before this point)
                    </button>
                  )}
                  {(tab === "git" || tab === "files") && visible.length > 0 && (
                    <div style={{ ...styles.meta, textAlign: "center", marginBottom: 10 }}>
                      {tab === "git" ? "Real commits" : "Files those commits changed"} — read from git
                      history, timed to this session&apos;s active window.
                    </div>
                  )}
                  {visible.length === 0 ? (
                    <div style={{ ...styles.centerNote, marginTop: 32 }}>Nothing in this view for the loaded window.</div>
                  ) : (
                    visible.map((entry, i) => <Entry key={offset + i} entry={entry} compareA={compareA} onCompare={onCompare} />)
                  )}
                  <span style={{ ...styles.meta, display: "block", textAlign: "center", marginTop: 8 }}>
                    showing {entries.length} of {totalEntries} moments
                  </span>
                </>
              )}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
