/**
 * Kill any process holding a given TCP port before we try to bind it.
 * Prevents EADDRINUSE crashes when a previous server process was not cleanly shut down.
 *
 * Security hardening (T-EXEC-01 B22): Uses execFile with array arguments.
 * Atomic port allocation (T-FILE-03 B18): freePort() returns confirmed-free port number.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as net from "node:net";

const execFileAsync = promisify(execFile);

async function getPidsOnPort(port: number): Promise<number[]> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"]);
      const pids = new Set<number>();
      const portStr = String(port);
      for (const line of stdout.split(String.fromCharCode(10))) {
        if (line.includes(":" + portStr + " ") || line.includes(":" + portStr + String.fromCharCode(9))) {
          if (line.includes("LISTENING")) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid && !isNaN(pid) && pid !== process.pid) pids.add(pid);
          }
        }
      }
      return [...pids];
    } else {
      const portStr = String(port);
      const { stdout } = await execFileAsync("lsof", ["-t", "-i:" + portStr]);
      return stdout
        .split(String.fromCharCode(10))
        .map((l) => parseInt(l.trim(), 10))
        .filter((p) => !isNaN(p) && p !== process.pid);
    }
  } catch {
    return [];
  }
}

async function killPid(pid: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/F"]);
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Process may have already exited
  }
}

/** Bind port 0 atomically, capture OS-assigned port, release socket, return port. */
function getEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/** Check if a port is free by briefly trying to bind to it. Returns true if free. */
function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Free a port by killing any process holding it, then confirm it is bindable.
 *
 * Returns the confirmed-free port number (eliminates kill-then-sleep TOCTOU race).
 * If port is 0: atomically pick an ephemeral port and return it.
 * If still busy after kill: falls back to an ephemeral port.
 */
export async function freePort(port: number): Promise<number> {
  if (port === 0) {
    return getEphemeralPort();
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid port number: " + port);
  }

  const pids = await getPidsOnPort(port);
  if (pids.length > 0) {
    console.log("[kill-port] Port " + port + " held by PID(s) " + pids.join(", ") + " - killing...");
    for (const pid of pids) {
      await killPid(pid);
    }
  }

  // Verify the port is actually free (up to 3 attempts with 50ms backoff)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await Bun.sleep(50);
    const isFree = await checkPortFree(port);
    if (isFree) return port;
  }

  console.warn("[kill-port] Port " + port + " still in use after kill - using ephemeral port");
  return getEphemeralPort();
}