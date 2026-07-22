/**
 * Sessions sidebar webview — the card list (founder feedback: the polished
 * sidebar look). Pure projection: renders snapshots, sends clicks back.
 * Auto-started EMPTY sessions group into a collapsed section so reload
 * artifacts never bury real work.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { PromptWithHistory, SessionListItem } from "../src/protocol.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

interface SidebarState {
  sessions: SessionListItem[];
  prompts: PromptWithHistory[];
  apply(sessions: SessionListItem[], prompts: PromptWithHistory[]): void;
}

const useStore = create<SidebarState>((set) => ({
  sessions: [],
  prompts: [],
  apply: (sessions, prompts) => set({ sessions, prompts }),
}));

window.addEventListener(
  "message",
  (event: MessageEvent<{ kind: string; data?: { sessions: SessionListItem[]; prompts?: PromptWithHistory[] } }>) => {
    if (event.data.kind === "snapshot" && event.data.data !== undefined) {
      useStore.getState().apply(event.data.data.sessions, event.data.data.prompts ?? []);
    }
  },
);
vscode.postMessage({ kind: "ready" });

const ACCENT = "#f97316";
const LIVE = "var(--vscode-charts-green, #3fb950)";

const styles: Record<string, React.CSSProperties> = {
  app: { fontFamily: "var(--vscode-font-family)", color: "var(--vscode-foreground)", padding: "0 0 20px" },
  // ---- quick-action toolbar (GitLens-style header) ----
  toolbar: {
    display: "flex",
    gap: 4,
    padding: "8px 8px 8px",
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "var(--vscode-sideBar-background, var(--vscode-editor-background))",
    borderBottom: "1px solid var(--vscode-panel-border)",
    flexWrap: "wrap",
  },
  toolBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flex: "1 1 auto",
    justifyContent: "center",
    fontSize: 11,
    padding: "5px 8px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid var(--vscode-panel-border)",
    background: "transparent",
    color: "var(--vscode-foreground)",
    whiteSpace: "nowrap",
  },
  toolBtnPrimary: { borderColor: `${ACCENT}88`, color: ACCENT },
  // ---- collapsible section header ----
  section: { padding: "0 10px" },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    userSelect: "none",
    padding: "10px 2px 6px",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.7,
    border: "none",
    background: "transparent",
    color: "var(--vscode-foreground)",
    width: "100%",
    textAlign: "left",
  },
  sectionChevron: { fontSize: 10, opacity: 0.6, width: 10, display: "inline-block" },
  sectionCount: { marginLeft: "auto", fontSize: 10, opacity: 0.6, fontWeight: 600 },
  card: {
    padding: "10px 12px",
    cursor: "pointer",
    borderRadius: 8,
    border: "1px solid var(--vscode-panel-border)",
    marginBottom: 8,
    background: "var(--vscode-editorWidget-background, transparent)",
  },
  cardLive: { borderColor: LIVE, boxShadow: `0 0 0 1px ${LIVE}44` },
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
  badge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${ACCENT}55`, color: ACCENT },
  quiet: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: "1px solid var(--vscode-panel-border)", opacity: 0.75 },
  liveBadge: { fontSize: 10, padding: "1px 8px", borderRadius: 9, border: `1px solid ${LIVE}`, color: LIVE, fontWeight: 600 },
  emptyGroup: { fontSize: 11, opacity: 0.8, marginTop: 10 },
  dayHeader: {
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    opacity: 0.55,
    margin: "12px 2px 6px",
  },
  // ---- prompt git-graph ----
  graphRow: { display: "flex", gap: 10, cursor: "pointer", borderRadius: 6, padding: "2px 4px" },
  rail: { position: "relative", width: 14, display: "flex", justifyContent: "center", flexShrink: 0 },
  node: {
    position: "relative",
    zIndex: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
    background: "var(--vscode-descriptionForeground)",
    border: "2px solid var(--vscode-editor-background)",
  },
  nodeHead: { background: ACCENT, boxShadow: `0 0 6px ${ACCENT}aa` },
  railLineTop: { position: "absolute", top: 0, bottom: "50%", width: 2, background: "var(--vscode-panel-border)" },
  railLineBottom: { position: "absolute", top: "50%", bottom: 0, width: 2, background: "var(--vscode-panel-border)" },
  commitBody: { flex: 1, minWidth: 0, paddingBottom: 8 },
  commitHeadline: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  versionTag: {
    fontSize: 10,
    fontWeight: 600,
    padding: "0 6px",
    borderRadius: 4,
    border: "1px solid var(--vscode-panel-border)",
    fontFamily: "var(--vscode-editor-font-family)",
  },
  versionTagHead: { borderColor: ACCENT, color: ACCENT },
  headLabel: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    padding: "0 5px",
    borderRadius: 8,
    background: `${ACCENT}22`,
    color: ACCENT,
  },
  graphStat: { fontSize: 10, marginLeft: "auto", fontFamily: "var(--vscode-editor-font-family)" },
  commitSubject: {
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  commitTime: { fontSize: 10, opacity: 0.5, marginTop: 1 },
};

// Row hover highlight (inline styles can't do :hover) — one tiny stylesheet.
const hoverStyle = document.createElement("style");
hoverStyle.textContent =
  ".chronicle-graph-row:hover{background:var(--vscode-list-hoverBackground);}";
document.head.appendChild(hoverStyle);

function dayLabel(ts: string | null): string {
  if (ts === null) return "Undated";
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function relative(ts: string | null): string {
  if (ts === null) return "?";
  const minutes = Math.floor((Date.now() - Date.parse(ts)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : ts.slice(0, 10);
}

function Card({ item }: { item: SessionListItem }): React.JSX.Element {
  return (
    <div
      style={{ ...styles.card, ...(item.live ? styles.cardLive : {}) }}
      onClick={() => vscode.postMessage({ kind: "open", item })}
      title={item.session}
    >
      <div style={styles.cardTitle}>{item.label}</div>
      <div style={styles.meta}>
        {relative(item.startedTs)} · {item.turns} turns · {item.tools} tools
        {item.gaps > 0 ? <span style={styles.warn}> · ⚠ {item.gaps}</span> : null}
      </div>
      <div style={styles.chipRow}>
        {item.live && <span style={styles.liveBadge}>● live now</span>}
        {[...item.providers, ...item.models].map((badge) => (
          <span key={badge} style={styles.badge}>
            {badge}
          </span>
        ))}
        <span style={styles.quiet}>fidelity {item.fidelity}</span>
      </div>
    </div>
  );
}

/** Display name: explicit title wins, else the first content line, else id. */
function promptName(p: { body: string; title: string; slug: string }): string {
  if (p.title !== "" && p.title !== p.slug) return p.title;
  const line = p.body.split("\n").map((l) => l.trim()).find((l) => l !== "");
  if (line !== undefined && line !== "") return line.length > 72 ? `${line.slice(0, 71)}…` : line;
  return p.slug;
}

/** A prompt rendered as a git-graph: a commit rail with one node per version. */
function PromptCard({ prompt }: { prompt: PromptWithHistory }): React.JSX.Element {
  const history = prompt.history.length > 0 ? prompt.history : [];
  return (
    <div style={{ ...styles.card, cursor: "default" }}>
      <div style={{ ...styles.cardTitle, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{promptName(prompt)}</span>
        {/* Lifecycle status — derived from the log (used = capture saw it
            submitted), so the badge is an observation, not a click counter. */}
        {prompt.status === "used" ? (
          <span style={styles.liveBadge}>● used{prompt.uses > 0 ? ` ×${prompt.uses}` : ""}</span>
        ) : prompt.status === "unknown" ? (
          <span style={{ ...styles.quiet, ...styles.warn }}>usage unavailable</span>
        ) : (
          <span style={styles.quiet}>○ saved for later</span>
        )}
        <button
          style={{ ...styles.chip, marginLeft: "auto" }}
          title="Copy this prompt to the clipboard — paste it into your AI tool"
          onClick={() =>
            vscode.postMessage({ kind: "promptUse", slug: prompt.slug, version: prompt.version })
          }
        >
          ▷ use
        </button>
      </div>
      <div style={styles.meta}>
        {prompt.slug}
        {prompt.tags.length > 0 ? ` · ${prompt.tags.join(", ")}` : ""}
        {prompt.lastUsedTs !== null ? ` · last used ${prompt.lastUsedTs.slice(0, 10)}` : ""}
      </div>
      <div style={{ marginTop: 8 }}>
        {history.map((node, i) => {
          const isHead = i === 0; // history is newest-first
          const isRoot = node.version === 1;
          return (
            <div
              key={node.version}
              style={styles.graphRow}
              className="chronicle-graph-row"
              title={
                isRoot
                  ? `v1 (initial) — click to view`
                  : `v${node.version - 1} → v${node.version} — click to see what changed`
              }
              onClick={() =>
                vscode.postMessage({ kind: "promptDiff", slug: prompt.slug, version: node.version })
              }
            >
              {/* The rail: a vertical line + a commit dot. */}
              <div style={styles.rail}>
                {!isHead && <span style={styles.railLineTop} />}
                <span style={{ ...styles.node, ...(isHead ? styles.nodeHead : {}) }} />
                {!isRoot && <span style={styles.railLineBottom} />}
              </div>
              {/* The commit body. */}
              <div style={styles.commitBody}>
                <div style={styles.commitHeadline}>
                  <span style={{ ...styles.versionTag, ...(isHead ? styles.versionTagHead : {}) }}>
                    v{node.version}
                  </span>
                  {isHead && <span style={styles.headLabel}>current</span>}
                  <span style={styles.graphStat}>
                    {node.added > 0 && <span style={{ color: LIVE }}>+{node.added}</span>}
                    {node.removed > 0 && <span style={{ color: "#f14c4c", marginLeft: 4 }}>−{node.removed}</span>}
                    <span style={{ opacity: 0.5, marginLeft: 6 }}>{node.lines} lines</span>
                  </span>
                </div>
                <div style={styles.commitSubject}>{node.preview}</div>
                <div style={styles.commitTime}>{relative(node.savedAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ToolbarCommand =
  | "chronicle.openTimeline"
  | "chronicle.savePrompt"
  | "chronicle.whyFile"
  | "chronicle.refresh";

/** GitLens-style quick-action toolbar — every top-level feature, one click. */
function Toolbar(): React.JSX.Element {
  const run = (command: ToolbarCommand): void => vscode.postMessage({ kind: "command", command });
  return (
    <div style={styles.toolbar}>
      <button style={{ ...styles.toolBtn, ...styles.toolBtnPrimary }} title="Open the Chronicle dashboard" onClick={() => run("chronicle.openTimeline")}>
        ◫ Dashboard
      </button>
      <button style={styles.toolBtn} title="Save a prompt you typed into the library" onClick={() => run("chronicle.savePrompt")}>
        ＋ Save prompt
      </button>
      <button style={styles.toolBtn} title="Why is the active file like this? (what was asked)" onClick={() => run("chronicle.whyFile")}>
        ◷ Why file
      </button>
      <button style={styles.toolBtn} title="Refresh the session &amp; prompt lists" onClick={() => run("chronicle.refresh")}>
        ↻ Refresh
      </button>
    </div>
  );
}

/** A collapsible titled section with a count — the GitLens sidebar idiom. */
function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={styles.section}>
      <button style={styles.sectionHead} onClick={() => setOpen((o) => !o)}>
        <span style={styles.sectionChevron}>{open ? "▾" : "▸"}</span>
        {title}
        {count !== undefined && <span style={styles.sectionCount}>{count}</span>}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function App(): React.JSX.Element {
  const { sessions, prompts } = useStore();
  const [providerFilter, setProviderFilter] = React.useState<string | null>(null);

  const allProviders = React.useMemo(
    () => [...new Set(sessions.flatMap((s) => s.providers))].sort(),
    [sessions],
  );
  const filtered =
    providerFilter === null ? sessions : sessions.filter((s) => s.providers.includes(providerFilter));

  // Reload artifacts: empty AND not live — grouped, collapsed, honest.
  const withContent = filtered.filter((s) => s.turns > 0 || s.tools > 0 || s.live);
  const empty = filtered.filter((s) => s.turns === 0 && s.tools === 0 && !s.live);

  // History by dates (founder request): browser-history style day groups,
  // newest day first; sessions within a day stay newest-first too.
  const groups: Array<{ day: string; items: SessionListItem[] }> = [];
  for (const item of withContent) {
    const day = dayLabel(item.startedTs);
    const group = groups[groups.length - 1];
    if (group !== undefined && group.day === day) group.items.push(item);
    else groups.push({ day, items: [item] });
  }

  const usedCount = prompts.filter((p) => p.status === "used").length;
  const promptCount =
    prompts.length === 0 ? undefined : usedCount > 0 ? `${prompts.length} · ${usedCount} in use` : `${prompts.length}`;

  return (
    <div style={styles.app}>
      <Toolbar />

      <Section title="Sessions" count={withContent.length > 0 ? String(withContent.length) : undefined}>
        {allProviders.length > 1 && (
          <div style={{ ...styles.chipRow, margin: "4px 0 8px" }}>
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
        {sessions.length === 0 ? (
          <p style={styles.meta}>
            No sessions yet — run <code>chronicle import claude-code</code> or start working with your AI tool.
          </p>
        ) : withContent.length === 0 ? (
          <p style={styles.meta}>No sessions match this filter.</p>
        ) : (
          groups.map((group) => (
            <div key={group.day}>
              <div style={styles.dayHeader}>{group.day}</div>
              {group.items.map((s) => (
                <Card key={s.session} item={s} />
              ))}
            </div>
          ))
        )}
      </Section>

      <Section title="Prompts" count={promptCount}>
        {prompts.length === 0 ? (
          <p style={styles.meta}>
            No saved prompts.{" "}
            <a
              style={{ color: ACCENT, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => vscode.postMessage({ kind: "command", command: "chronicle.savePrompt" })}
            >
              Save one you typed
            </a>{" "}
            — no retyping.
          </p>
        ) : (
          prompts.map((p) => <PromptCard key={p.slug} prompt={p} />)
        )}
      </Section>

      {empty.length > 0 && (
        <Section title="Empty sessions" count={String(empty.length)} defaultOpen={false}>
          <div style={{ ...styles.meta, margin: "2px 0 8px" }}>🌱 auto-started, nothing captured</div>
          {empty.map((s) => (
            <Card key={s.session} item={s} />
          ))}
        </Section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
