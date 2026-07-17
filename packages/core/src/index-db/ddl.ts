/**
 * Index schema — ARCHITECTURE.md §8, layer 2. The index is a disposable
 * cache: schema changes bump {@link INDEX_SCHEMA_VERSION} and trigger a
 * rebuild — index migrations do not exist.
 */

// v3: a session row exists for ANY event carrying a session id, not only for
// SessionStarted/SessionEnded. The bump is load-bearing: per-file cursors mean
// already-consumed events are never re-indexed, so without it existing stores
// would keep hiding sessions whose lifecycle events were missed.
export const INDEX_SCHEMA_VERSION = 3;

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  ts         TEXT NOT NULL,
  type       TEXT NOT NULL,
  session    TEXT,
  provider   TEXT,
  model      TEXT,
  branch     TEXT,
  head       TEXT,
  visibility TEXT NOT NULL,
  file       TEXT NOT NULL,
  json       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
CREATE TABLE IF NOT EXISTS sessions (
  id       TEXT PRIMARY KEY,
  started  TEXT,
  ended    TEXT,
  provider TEXT,
  model    TEXT,
  title    TEXT
);
CREATE TABLE IF NOT EXISTS files_touched (
  event_id TEXT NOT NULL,
  path     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_path ON files_touched(path);
CREATE TABLE IF NOT EXISTS links (
  commit_sha TEXT NOT NULL,
  session    TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_sha ON links(commit_sha);
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(text, event_id UNINDEXED);
`;
