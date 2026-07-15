/**
 * Extension event types — `Ext.<providerId>.<EventName>` (ARCHITECTURE.md §5.3).
 *
 * Provider- or plugin-specific moments with no core meaning live in this
 * sandboxed namespace (e.g. `Ext.example-tool.SubagentStarted`). Core, replay,
 * and UI treat them as opaque timeline entries; nothing downstream may depend
 * on them. Their payload schemas are registered at provider activation
 * (plugin-kit, M7) — at the spec layer the payload is `unknown`.
 */

/** provider id: lowercase kebab; event name: PascalCase. */
export const EXT_TYPE_REGEX = /^Ext\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[A-Z][A-Za-z0-9]*$/;

export function isExtEventType(type: string): boolean {
  return EXT_TYPE_REGEX.test(type);
}

/** Split a valid ext type into its parts; throws on malformed input. */
export function parseExtEventType(type: string): { providerId: string; eventName: string } {
  if (!isExtEventType(type)) throw new TypeError(`not an extension event type: ${type}`);
  const [, providerId, eventName] = type.split(".") as [string, string, string];
  return { providerId, eventName };
}
