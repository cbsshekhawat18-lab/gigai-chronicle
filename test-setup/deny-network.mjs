/**
 * Network-denial test harness — design law 7 ("zero network by default"),
 * made testable: every package's vitest run loads this setup file, so any
 * code path that attempts network I/O fails its test immediately.
 *
 * Denied:  fetch, http/https requests, TCP sockets, TLS, UDP, DNS.
 * Allowed: IPC (unix-domain sockets / named pipes via `path`) — local
 *          sockets are not network egress, and Phase 2's `chronicle daemon`
 *          legitimately uses them (ARCHITECTURE.md §14).
 *
 * This is a test harness, not a sandbox: it catches honest mistakes loudly.
 * The CI environment provides the second, harness-independent layer.
 */

import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import dns from "node:dns";

class NetworkDeniedError extends Error {
  constructor(api) {
    super(
      `Network access denied by test harness (${api}). ` +
        `Gigai Chronicle is zero-network by design (ARCHITECTURE.md §2, law 7).`,
    );
    this.name = "NetworkDeniedError";
  }
}

const deny = (api) => {
  throw new NetworkDeniedError(api);
};

// --- fetch ------------------------------------------------------------------
globalThis.fetch = async (input) => deny(`fetch(${String(input)})`);

// --- TCP / TLS ----------------------------------------------------------------
// Patching Socket.prototype.connect catches everything built on net,
// including http agents and third-party clients.
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patchedConnect(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const isIpc =
    typeof first === "string" ||
    (typeof first === "object" &&
      first !== null &&
      typeof first.path === "string" &&
      first.port == null);
  if (isIpc) return originalConnect.apply(this, args);
  return deny("net.Socket.connect");
};
tls.connect = () => deny("tls.connect");

// --- HTTP(S) (clearer error at the API the caller used) ----------------------
http.request = () => deny("http.request");
http.get = () => deny("http.get");
https.request = () => deny("https.request");
https.get = () => deny("https.get");

// --- UDP / DNS ----------------------------------------------------------------
dgram.createSocket = () => deny("dgram.createSocket");
dns.lookup = () => deny("dns.lookup");
dns.resolve = () => deny("dns.resolve");
dns.promises.lookup = async () => deny("dns.promises.lookup");
dns.promises.resolve = async () => deny("dns.promises.resolve");
