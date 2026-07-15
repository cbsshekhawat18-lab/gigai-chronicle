# Path-edge fixtures

Cross-platform path handling is a first-class test target
([ARCHITECTURE.md §21](../../../docs/ARCHITECTURE.md#21-testing-strategy)) —
this repository itself lives in a directory with a space in its name, which
is exactly the class of bug these fixtures exist to catch.

Committed fixtures:

- [`dir with spaces/`](dir%20with%20spaces/) — spaces in every path segment.
- [`ünïcødé/`](ünïcødé/) — non-ASCII names; also exercises the macOS NFD /
  Linux NFC unicode-normalization mismatch on checkout, deliberately.

**Long-path cases (Windows MAX_PATH) are generated at test time**, not
committed: a committed >260-char path would break `git clone` for Windows
contributors without `core.longpaths` — the fixture would cause the failure
mode it tests for. Test helpers create long paths under `os.tmpdir()` and
clean up (arrives with M3's store tests, the first consumer).
