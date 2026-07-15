/**
 * Pure JSON-Schema rendering from the built zod definitions (dist/).
 * Consumed by generate-json-schemas.mjs (writer CLI) and by
 * test/jsonschema-drift.test.ts (drift guard) — no side effects here.
 */
import { z } from "zod";
import { envelopeSchema, configSchema, CORE_EVENTS } from "../dist/index.js";

/** Render one zod schema to a JSON Schema document with a stable $id. */
export function render(name, schema) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://schemas.chronicle.dev/v1/${name}.json`,
    title: name,
    ...json,
  };
}

/** All Spec v1 documents, keyed by output path (without .json). */
export function generateAll() {
  const documents = new Map();
  documents.set("envelope", render("envelope", envelopeSchema));
  documents.set("config", render("config", configSchema));
  for (const [type, definition] of Object.entries(CORE_EVENTS)) {
    documents.set(
      `events/${type}.payload.${definition.payloadVersion}`,
      render(`${type}/${definition.payloadVersion}`, definition.payload),
    );
  }
  return documents;
}

/** Serialize exactly as the writer does — shared so drift checks are byte-accurate. */
export function serialize(doc) {
  return JSON.stringify(doc, null, 2) + "\n";
}
