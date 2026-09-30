import { describe, it, expect } from "vitest";
import { runProcess } from "./process-runner.js";
describe("process runner", () => {
  it("streams both stdout and stderr before returning bounded output", async () => {
    const lines: string[] = [];
    const result = await runProcess(process.execPath, ["-e", "console.log('first'); console.error('second');"], 5000, { onOutput: line => lines.push(line) });
    expect(lines).toContain("first"); expect(lines).toContain("second"); expect(result.code).toBe(0);
  });
  it("terminates timed-out processes", async () => {
    await expect(runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], 100)).rejects.toThrow("timed out");
  });
  it("terminates processes on cancellation", async () => {
    const controller = new AbortController();
    const result = runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], 5000, { signal: controller.signal });
    controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled");
  });
  it("bounds output retained in memory", async () => {
    const result = await runProcess(process.execPath, ["-e", "console.log('x'.repeat(50000))"], 5000);
    expect(result.output.length).toBeLessThanOrEqual(16000);
  });
});
