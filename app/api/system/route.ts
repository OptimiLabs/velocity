import { NextResponse } from "next/server";
import os from "os";

// Track previous CPU snapshot for delta-based usage calculation
let prevCpuTimes: { idle: number; total: number } | null = null;

// Warm up on module load so the first real request gets a delta
(() => {
  const cpus = os.cpus();
  let idle = 0,
    total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }
  prevCpuTimes = { idle, total };
})();

function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }

  if (!prevCpuTimes) {
    prevCpuTimes = { idle, total };
    return 0;
  }

  const idleDelta = idle - prevCpuTimes.idle;
  const totalDelta = total - prevCpuTimes.total;
  prevCpuTimes = { idle, total };

  if (totalDelta === 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

export async function GET() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const proc = process.memoryUsage();

  return NextResponse.json({
    cpu: getCpuUsage(),
    cpuCount: os.cpus().length,
    memory: {
      total: totalMem,
      used: usedMem,
      percent: Math.round((usedMem / totalMem) * 100),
    },
    process: {
      rss: proc.rss,
      heapUsed: proc.heapUsed,
      heapTotal: proc.heapTotal,
    },
  });
}
