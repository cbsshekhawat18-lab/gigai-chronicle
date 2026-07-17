/**
 * Sessions sidebar webview — the card list (founder feedback: the polished
 * sidebar look). Pure projection: renders snapshots, sends clicks back.
 * Auto-started EMPTY sessions group into a collapsed section so reload
 * artifacts never bury real work.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { SessionListItem } from "../src/protocol.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

interface SidebarState {
  sessions: SessionListItem[];
  apply(sessions: SessionListItem[]): void;
}

const useStore = create<SidebarState>((set) => ({
  sessions: [],
  apply: (sessions) => set({ sessions }),
}));

window.addEventListener(
  "message",
  (event: MessageEvent<{ kind: string; data?: { sessions: SessionListItem[] } }>) => {
    if (event.data.kind === "snapshot" && event.data.data !== undefined) {
      useStore.getState().apply(event.data.data.sessions);
    }
  },
);
vscode.postMessage({ kind: "ready" });

const ACCENT = "#f97316";
const LIVE = "var(--vscode-charts-green, #3fb950)";

const styles: Record<string, React.CSSProperties> = {
  app: { fontFamily: "var(--vscode-font-family)", color: "var(--vscode-foreground)", padding: "10px 10px 20px" },
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
};

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

function App(): React.JSX.Element {
  const { sessions } = useStore();
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

  return (
    <div style={styles.app}>
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
        <p style={styles.meta}>
          No sessions yet — run <code>chronicle import claude-code</code> or start working with your
          AI tool.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.day}>
          <div style={styles.dayHeader}>{group.day}</div>
          {group.items.map((s) => (
            <Card key={s.session} item={s} />
          ))}
        </div>
      ))}
      {empty.length > 0 && (
        <details style={styles.emptyGroup}>
          <summary style={{ cursor: "pointer" }}>
            🌱 {empty.length} empty session{empty.length > 1 ? "s" : ""} (auto-started, nothing
            captured)
          </summary>
          <div style={{ marginTop: 8 }}>
            {empty.map((s) => (
              <Card key={s.session} item={s} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
