import { describe, it, expect } from "vitest";
import { createSseParser, type StreamEvent } from "./sse";
describe("SSE parser", () => {
  it("handles split frames, CRLF, and multiple events without duplication", () => {
    const events: StreamEvent[] = []; const parse = createSseParser(e => events.push(e));
    parse('id: a\r\nevent: log.appended\r\ndata: {"seq');
    parse('uence":1}\r\n\r\nid: b\nevent: deployment.completed\ndata: {"status":"SUCCEEDED"}\n\n');
    expect(events).toEqual([{ id: "a", type: "log.appended", data: { sequence: 1 } }, { id: "b", type: "deployment.completed", data: { status: "SUCCEEDED" } }]);
    parse(":keepalive\n\n"); expect(events).toHaveLength(2);
  });
  it("supports multiline JSON data", () => {
    const events: StreamEvent[] = []; const parse = createSseParser(e => events.push(e));
    parse('id: c\ndata: {\ndata: "ok": true}\n\n');
    expect(events[0].data).toEqual({ ok: true });
  });
});
