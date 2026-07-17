/**
 * Plain-text unified diff (§5.4: "prompt diff is a plain text diff — no
 * special machinery"). Line-based LCS; fine for prompt-sized documents.
 */

export function unifiedDiff(aText: string, bText: string, aLabel: string, bLabel: string): string {
  const a = aText.split("\n");
  const b = bText.split("\n");

  // LCS table (prompts are small; O(n·m) is plenty).
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      (lcs[i] as number[])[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, (lcs[i] as number[])[j + 1] as number);
    }
  }

  const lines: string[] = [`--- ${aLabel}`, `+++ ${bLabel}`];
  let i = 0;
  let j = 0;
  let changed = false;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(`  ${a[i] as string}`);
      i++;
      j++;
    } else if (
      j < b.length &&
      (i >= a.length || ((lcs[i] as number[])[j + 1] as number) >= ((lcs[i + 1] as number[])[j] as number))
    ) {
      lines.push(`+ ${b[j] as string}`);
      j++;
      changed = true;
    } else {
      lines.push(`- ${a[i] as string}`);
      i++;
      changed = true;
    }
  }
  return changed ? lines.join("\n") : `${aLabel} and ${bLabel} are identical`;
}
