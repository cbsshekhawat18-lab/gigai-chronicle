/**
 * Conversation events — the prompt/response dialogue (ARCHITECTURE.md §5.3).
 *
 * Text bodies use {@link textOrBlobSchema}: inline up to the 64KB store
 * limit, spilled to a content-addressed sidecar beyond it (§7.2 rule 5).
 * Bodies are post-redaction by construction — the Event Engine redacts
 * before first write (§9); the schema layer never sees raw secrets.
 */
import { z } from "zod";
import { idPattern } from "../ids.js";
import { textOrBlobSchema } from "../shared.js";

/** Human submitted a prompt. */
export const promptSubmittedPayload = z
  .object({
    text: textOrBlobSchema,
  })
  .catchall(z.unknown());

/** Human revised/resubmitted a prior prompt. */
export const promptEditedPayload = z
  .object({
    text: textOrBlobSchema,
    /** The PromptSubmitted/PromptEdited event being revised. */
    revises: z.string().regex(new RegExp(idPattern("event"))),
  })
  .catchall(z.unknown());

/** The tool's response/turn completed. */
export const aiResponseReceivedPayload = z
  .object({
    /** Response body; null when the provider tier cannot capture content. */
    text: textOrBlobSchema.nullable(),
    /** The prompt event this responds to, when attributable. */
    inResponseTo: z
      .string()
      .regex(new RegExp(idPattern("event")))
      .nullable(),
  })
  .catchall(z.unknown());
