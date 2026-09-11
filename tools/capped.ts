// Runs a command held to a share of this machine, so the stories and other
// heavy work leave the desktop usable while they run. On Windows the command
// and everything it starts share one job object: at most a quarter of the
// processor time and a quarter of the memory, at below-normal priority, and
// nothing left running once the command ends. Elsewhere it only runs at the
// lowest priority. A run that cannot be held is not run at all.
// Usage: bun run tools/capped.ts <command> [args...]

import { dlopen, FFIType, ptr } from "bun:ffi";
import { constants, cpus, platform, setPriority, totalmem } from "node:os";

// The share of the machine a run may take: slower runs, a usable desktop.
const SHARE = 0.25;

// Win32 values, from winnt.h and the job object documentation.
const EXTENDED_LIMIT_INFORMATION = 9;
const CPU_RATE_CONTROL_INFORMATION = 15;
const LIMIT_JOB_MEMORY = 0x200;
const LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
const CPU_RATE_CONTROL_ENABLE = 0x1;
const CPU_RATE_CONTROL_HARD_CAP = 0x4;
// The handle every process has for itself.
const CURRENT_PROCESS = -1n;

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("capped: nothing to run. Usage: bun run tools/capped.ts <command> [args...]");
  process.exit(2);
}

if (platform() === "win32") {
  holdInJob();
  lower(constants.priority.PRIORITY_BELOW_NORMAL);
} else {
  lower(constants.priority.PRIORITY_LOW);
  console.warn("capped: no hard ceiling on this system; the run goes at the lowest priority.");
}

const cores = Math.max(1, Math.floor(cpus().length * SHARE));
const child = Bun.spawn(command, {
  stdio: ["inherit", "inherit", "inherit"],
  // Cargo starts a job per core; past the ceiling they would only queue.
  env: { ...process.env, CARGO_BUILD_JOBS: process.env["CARGO_BUILD_JOBS"] ?? String(cores) },
});
process.exit((await child.exited) ?? 1);

// Puts this process in a new job with the ceilings. Whatever it starts from
// here on joins the job, and the job ends everything in it when this exits.
function holdInJob(): void {
  const { symbols } = dlopen("kernel32.dll", {
    CreateJobObjectW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
    SetInformationJobObject: {
      args: [FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
    AssignProcessToJobObject: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.i32 },
    GetLastError: { args: [], returns: FFIType.u32 },
  });
  const job = symbols.CreateJobObjectW(null, null);
  if (job === null) {
    refuse("create the job", symbols.GetLastError());
  }
  // JOBOBJECT_EXTENDED_LIMIT_INFORMATION is 144 bytes on 64-bit Windows,
  // with LimitFlags at offset 16 and JobMemoryLimit at offset 120.
  const limits = new Uint8Array(144);
  const limitFields = new DataView(limits.buffer);
  limitFields.setUint32(16, LIMIT_JOB_MEMORY | LIMIT_KILL_ON_JOB_CLOSE, true);
  limitFields.setBigUint64(120, BigInt(Math.floor(totalmem() * SHARE)), true);
  if (
    symbols.SetInformationJobObject(job, EXTENDED_LIMIT_INFORMATION, ptr(limits), limits.length) ===
    0
  ) {
    refuse("set the memory ceiling", symbols.GetLastError());
  }
  // JOBOBJECT_CPU_RATE_CONTROL_INFORMATION: the flags, then the rate in
  // hundredths of a percent of all the processors together.
  const rate = new Uint8Array(8);
  const rateFields = new DataView(rate.buffer);
  rateFields.setUint32(0, CPU_RATE_CONTROL_ENABLE | CPU_RATE_CONTROL_HARD_CAP, true);
  rateFields.setUint32(4, Math.round(SHARE * 10_000), true);
  if (
    symbols.SetInformationJobObject(job, CPU_RATE_CONTROL_INFORMATION, ptr(rate), rate.length) === 0
  ) {
    refuse("set the processor ceiling", symbols.GetLastError());
  }
  if (symbols.AssignProcessToJobObject(job, CURRENT_PROCESS) === 0) {
    refuse("join the job", symbols.GetLastError());
  }
}

// Children inherit a lowered priority, so the desktop's own work goes first.
function lower(priority: number): void {
  try {
    setPriority(priority);
  } catch (error) {
    console.warn(`capped: priority left as it was: ${String(error)}`);
  }
}

function refuse(what: string, code: number): never {
  console.error(`capped: could not ${what} (Windows error ${code}), so the run does not start.`);
  process.exit(1);
}
