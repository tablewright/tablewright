// Stops what the dev scripts leave behind. A Ctrl+C in a Windows shell often
// ends `bun run` but not the Vite it spawned, which keeps port 1420, and a
// cloudflared tunnel can linger the same way; the next `dev:tunnel` then
// fails with the port in use. This finds whatever listens on the dev port
// and every cloudflared, and ends them, on Windows and on Linux alike.
//
// Usage: bun run stop

const PORTS = [1420];
const NAMES = ["cloudflared"];

const windows = process.platform === "win32";
const ended: string[] = [];

for (const port of PORTS) {
  for (const pid of listeners(port)) {
    end(pid, `port ${port}`);
  }
}
for (const name of NAMES) {
  for (const pid of named(name)) {
    end(pid, name);
  }
}
console.log(ended.length === 0 ? "nothing was running" : ended.join("\n"));

// Process ids listening on `port`.
function listeners(port: number): number[] {
  if (windows) {
    // Vite binds localhost as ::1, so both address families are read.
    const out = run("netstat", ["-ano", "-p", "tcp"]) + run("netstat", ["-ano", "-p", "tcpv6"]);
    return unique(
      out
        .split("\n")
        .filter((line) => line.includes(`:${port} `) && line.includes("LISTENING"))
        .map((line) => Number(line.trim().split(/\s+/).at(-1)))
    );
  }
  const out = run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  return unique(out.split("\n").map(Number));
}

// Process ids of every process called `name`.
function named(name: string): number[] {
  if (windows) {
    const out = run("tasklist", ["/FI", `IMAGENAME eq ${name}.exe`, "/FO", "CSV", "/NH"]);
    return unique(
      out
        .split("\n")
        .filter((line) => line.startsWith(`"${name}.exe"`))
        .map((line) => Number(line.split('","')[1]))
    );
  }
  const out = run("pgrep", ["-x", name]);
  return unique(out.split("\n").map(Number));
}

function end(pid: number, what: string): void {
  const result = windows
    ? Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"])
    : Bun.spawnSync(["kill", String(pid)]);
  ended.push(
    result.exitCode === 0 ? `ended ${what} (pid ${pid})` : `could not end ${what} (pid ${pid})`
  );
}

function run(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args]);
  return result.exitCode === 0 ? result.stdout.toString() : "";
}

function unique(pids: number[]): number[] {
  return [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
}
