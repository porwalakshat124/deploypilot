export type StreamEvent = { id: string; type: string; data: unknown };
export function createSseParser(emit: (event: StreamEvent) => void) {
  let pending = "";
  return (chunk: string) => {
    pending += chunk;
    if (pending.length > 1024 * 1024) throw new Error("Event stream frame is too large");
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(pending))) {
      const frame = pending.slice(0, match.index);
      pending = pending.slice(match.index + match[0].length);
      let id = "", type = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("id:")) id = line.slice(3).trimStart();
        if (line.startsWith("event:")) type = line.slice(6).trimStart();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) emit({ id, type, data: JSON.parse(data.join("\n")) });
    }
  };
}
