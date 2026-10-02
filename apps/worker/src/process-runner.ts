import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export type RunOptions = { signal?: AbortSignal; onOutput?: (line: string) => void; env?: Record<string,string>; suppressOutput?: boolean };
export type Runner = (command: string, args: string[], timeoutMs: number, options?: RunOptions) => Promise<{ code: number; output: string }>;
export const runProcess: Runner = (command, args, timeoutMs, options = {}) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(options.signal.reason ?? new Error("Cancelled"));
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...(options.env ? { env: { ...process.env, ...options.env } } : {}) });
  let output = "";
  let failure: Error | undefined;
  const terminate = (error: Error) => { failure = error; child.kill("SIGKILL"); };
  const abort = () => terminate(options.signal?.reason instanceof Error ? options.signal.reason : new Error("Cancelled"));
  const timer = setTimeout(() => terminate(new Error("Execution timed out")), timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder("utf8");
    let pending = "";
    const flush = (text: string, final = false) => {
      if (options.suppressOutput) return;
      output = (output + text).slice(-16000);
      pending += text;
      let index: number;
      while ((index = pending.search(/[\r\n]/)) >= 0 || pending.length > 4000) {
        const end = index >= 0 ? Math.min(index, 4000) : 4000;
        const line = pending.slice(0, end);
        pending = pending.slice(end + (index === end ? 1 : 0));
        if (line) options.onOutput?.(line);
      }
      if (final && pending) options.onOutput?.(pending);
    };
    stream.on("data", chunk => flush(decoder.write(chunk)));
    stream.on("end", () => flush(decoder.end(), true));
  }
  const clean = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
  child.once("error", error => { clean(); reject(error); });
  child.once("close", code => {
    clean();
    if (failure) reject(failure);
    else if (code !== 0) reject(new Error(`${command} failed with exit code ${code}: ${output.trim().slice(-4000)}`));
    else resolve({ code: 0, output });
  });
});
