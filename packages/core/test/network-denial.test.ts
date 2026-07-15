/**
 * Proves the network-denial harness (test-setup/deny-network.mjs) is active
 * in package test runs — design law 7 made observable. Lives in core because
 * core is where a network call would be most damaging.
 */
import net from "node:net";
import { describe, expect, it } from "vitest";

describe("network-denial harness (design law 7)", () => {
  it("denies fetch", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(/denied by test harness/);
  });

  it("denies TCP connects", () => {
    expect(() => net.connect(80, "example.com")).toThrow(/denied by test harness/);
  });

  it("still allows IPC (path-based) sockets — daemon surface, not egress", () => {
    // Connecting to a nonexistent socket path must get PAST the harness
    // (no NetworkDeniedError); the eventual ENOENT arrives async and is
    // swallowed via the error listener.
    const socket = net.connect({ path: "/tmp/chronicle-test-nonexistent.sock" });
    socket.on("error", () => socket.destroy());
    expect(socket).toBeInstanceOf(net.Socket);
    socket.destroy();
  });
});
