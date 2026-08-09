/**
 * Technical-debt memory (docs/development-intelligence.md §12). Debt discovered
 * through development — not a TODO-comment scan — derived from Project Memory:
 * test gaps, known issues, and TODOs whose language signals debt. Provenance on
 * every item.
 */
import type { EventLog } from "../store/event-log.js";
import { loadMemory, type Provenance } from "./signals.js";

const DEBT = /\b(?:duplicat|legacy|hack|workaround|deprecated|missing test|no test|incomplete|inconsistent|temporary|for now|technical debt|refactor|cleanup|brittle|fragile)\b/i;

export interface DebtItem {
  area: string;
  text: string;
  level: "high" | "medium" | "low";
  provenance: Provenance[];
}

export async function technicalDebt(chronicleDir: string, log: EventLog): Promise<DebtItem[]> {
  const memory = await loadMemory(chronicleDir, log);
  const items: DebtItem[] = [];
  for (const m of memory) {
    const debtLanguage = DEBT.test(m.content);
    const isDebtKind = m.kind === "test_gap" || (m.kind === "known_issue" && m.status !== "resolved");
    if (!isDebtKind && !debtLanguage) continue;
    if (m.kind === "todo" && !debtLanguage) continue; // a plain TODO isn't debt on its own
    const level: DebtItem["level"] =
      m.kind === "known_issue" || m.kind === "test_gap" ? "high" : debtLanguage ? "medium" : "low";
    items.push({
      area: m.tags[0] ?? m.kind,
      text: m.content,
      level,
      provenance: m.sourceRefs.slice(0, 1),
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.level] - rank[b.level] || a.area.localeCompare(b.area));
}
