/**
 * Workspace `.env` harvest (§9 stage 2, §18): values developers keep in env
 * files are secrets BY LOCATION, whatever they look like. Harvested values
 * live in process memory only, exclusively for match-and-replace at capture
 * time — they are never written, logged, or included in any report; markers
 * carry only a hash prefix.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Env files consulted at the workspace root (non-recursive, by design). */
export const ENV_FILE_NAMES = [".env", ".env.local"] as const;

const MIN_VALUE_LENGTH = 8;

/** Values that appear in env files but are configuration, not secrets. */
const TRIVIAL_VALUES = new Set([
  "true",
  "false",
  "yes",
  "no",
  "null",
  "development",
  "production",
  "test",
  "localhost",
  "info",
  "debug",
  "warn",
  "error",
]);

function parseEnvContent(content: string): string[] {
  const values: string[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    let value = (match[1] as string).trim();
    // Strip one layer of quotes and trailing comments on unquoted values.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (value.length < MIN_VALUE_LENGTH) continue;
    if (TRIVIAL_VALUES.has(value.toLowerCase())) continue;
    if (/^[0-9.]+$/.test(value)) continue; // ports, versions, numbers
    values.push(value);
  }
  return values;
}

/** Harvest redaction-worthy values from the workspace's env files. */
export async function harvestEnvValues(workspaceRoot: string): Promise<string[]> {
  const values = new Set<string>();
  for (const name of ENV_FILE_NAMES) {
    try {
      const content = await readFile(path.join(workspaceRoot, name), "utf8");
      for (const value of parseEnvContent(content)) values.add(value);
    } catch {
      // Missing env file is the normal case.
    }
  }
  return [...values];
}
