/**
 * Correlation override events (ARCHITECTURE.md §11).
 *
 * Links themselves are DERIVED (index edges, never in the log). What IS
 * recorded is the human's judgment: confirming or severing a link — which
 * thereafter overrides heuristics permanently.
 */
import { z } from "zod";
import { idPattern } from "../ids.js";
import { gitShaSchema } from "../shared.js";

const linkShape = {
  commit: gitShaSchema,
  session: z.string().regex(new RegExp(idPattern("session"))),
};

/** Human confirmed a commit↔session link. */
export const linkConfirmedPayload = z.object(linkShape).catchall(z.unknown());

/** Human severed a commit↔session link. */
export const linkRejectedPayload = z.object(linkShape).catchall(z.unknown());
