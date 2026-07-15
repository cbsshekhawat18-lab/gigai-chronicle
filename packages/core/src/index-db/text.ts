/**
 * FTS text extraction — which payload fields are searchable per event type.
 * Blob-spilled bodies (`{$blob}` refs) are not indexed inline; search covers
 * what is greppable in the event files themselves.
 */
import type { ChronicleEvent } from "@gigaichronicle/schema";

const TEXT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  PromptSubmitted: ["text"],
  PromptEdited: ["text"],
  AIResponseReceived: ["text"],
  ToolExecuted: ["summary", "tool"],
  GitCommitCreated: ["subject"],
  SessionStarted: ["title"],
  CaptureGap: ["detail"],
  CaptureDegraded: ["reason"],
};

/** Searchable text of an event, or null when it has none. */
export function extractSearchText(event: ChronicleEvent): string | null {
  const fields = TEXT_FIELDS[event.type];
  if (fields === undefined) return null;
  const payload = event.payload as Record<string, unknown>;
  const parts = fields
    .map((field) => payload[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return parts.length > 0 ? parts.join("\n") : null;
}
