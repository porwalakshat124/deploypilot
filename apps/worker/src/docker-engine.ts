import { request } from "node:http";
import { runProcess, type Runner } from "./process-runner.js";
export class DockerEngine {
  private socket?: string;
  constructor(private readonly run: Runner = runProcess) {}
  private async socketPath() {
    if (this.socket) return this.socket;
    const result = await this.run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], 10000);
    const host = result.output.trim();
    if (host.startsWith("unix:///")) this.socket = host.slice(7);
    else if (host.startsWith("npipe:////./pipe/")) this.socket = host.slice(8).replaceAll("/", "\\");
    else throw new Error("Secret injection requires a local Docker Unix socket or named pipe");
    return this.socket;
  }
  async call(method: string, path: string, body?: object, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const socketPath = await this.socketPath();
    const input = body ? JSON.stringify(body) : "";
    return new Promise((resolve, reject) => {
      const req = request({ socketPath, method, path: "/v1.47" + path, signal, timeout: 30000, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(input) } }, response => {
        let text = "";
        response.on("data", chunk => { text += chunk; if (text.length > 65536) req.destroy(new Error("Docker API response too large")); });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode >= 300) return reject(new Error("Docker API operation failed (HTTP " + response.statusCode + ")"));
          try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error("Invalid Docker API response")); }
        });
      });
      req.on("timeout", () => req.destroy(new Error("Docker API timed out")));
      req.on("error", () => reject(new Error("Docker API connection failed")));
      req.end(input);
    });
  }
}
