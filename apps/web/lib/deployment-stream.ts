import { accessToken } from "./api";
import { createSseParser, type StreamEvent } from "./sse";
export async function watchDeployment(id: string, signal: AbortSignal, onEvent: (event: StreamEvent) => void, onStatus: (status: string) => void) {
  let cursor = "", attempt = 0;
  while (!signal.aborted) {
    try {
      onStatus(attempt ? "Reconnecting…" : "Connecting…");
      const token = await accessToken();
      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + "/v1/deployments/" + encodeURIComponent(id) + "/events", { headers: { Authorization: "Bearer " + token, Accept: "text/event-stream", ...(cursor ? { "Last-Event-ID": cursor } : {}) }, signal, cache: "no-store" });
      if (!response.ok || !response.body) throw new Error("Event stream unavailable (HTTP " + response.status + ")");
      onStatus("Live"); attempt = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser(event => { onEvent(event); if (event.id) cursor = event.id; });
      try {
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          parse(decoder.decode(chunk.value, { stream: true }));
        }
      } finally { await reader.cancel().catch(() => undefined); }
    } catch { if (signal.aborted) return; }
    onStatus("Disconnected; reconnecting…");
    const wait = Math.min(1000 * 2 ** attempt++, 15000);
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, wait);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}
