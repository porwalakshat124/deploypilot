import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";

// GitHub tarballs have one root directory. Reject links and extended per-file
// metadata rather than letting tar materialize paths outside the checkout.
export function archiveEntries(archive: Buffer) {
  const data = gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 });
  const entries: { path: string; content: Buffer; mode: number; directory: boolean }[] = [];
  let top: string | undefined;
  for (let offset = 0; offset + 512 <= data.length;) {
    const h = data.subarray(offset, offset + 512);
    if (h.every(byte => byte === 0)) break;
    const field = (start: number, size: number) => h.subarray(start, start + size).toString("utf8").replace(/\0.*$/s, "").trim();
    const sizeText = field(124, 12);
    if (!/^[0-7]+$/.test(sizeText)) throw new Error("Invalid archive size");
    const size = parseInt(sizeText, 8);
    const type = field(156, 1) || "0";
    const path = [field(345, 155), field(0, 100)].filter(Boolean).join("/").replace(/\/$/, "");
    offset += 512;
    if (offset + size > data.length) throw new Error("Truncated source archive");
    if (type !== "g") {
      if (!["0", "5"].includes(type)) throw new Error("Source archives may only contain regular files and directories; links and extended paths are unsupported");
      if (!path || path.includes("\\") || path.includes(":") || path.startsWith("/") || path.split("/").some(part => !part || part === ".." || part === "." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw new Error("Unsafe archive path");
      const [root, ...parts] = path.split("/");
      top ??= root;
      if (root !== top) throw new Error("Archive must contain one repository root");
      if (parts.length) entries.push({ path: parts.join("/"), content: data.subarray(offset, offset + size), mode: parseInt(field(100, 8), 8) & 0o777, directory: type === "5" });
      if (entries.length > 20000) throw new Error("Archive contains too many files");
    }
    offset += Math.ceil(size / 512) * 512;
  }
  if (!entries.length) throw new Error("Source archive is empty");
  return entries;
}

export async function withSourceWorkspace(archive: Buffer, run: (workspace: string) => Promise<void>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const entries = archiveEntries(archive);
  const temp = resolve(tmpdir());
  const root = await mkdtemp(join(temp, "deploypilot-"));
  try {
    for (const entry of entries) {
      signal?.throwIfAborted();
      const target = resolve(root, entry.path);
      const rel = relative(root, target);
      if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Archive escapes workspace");
      if (entry.directory) await mkdir(target, { recursive: true });
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, entry.content, { mode: entry.mode || 0o600, flag: "wx" });
      }
    }
    await run(root);
  } finally {
    const rel = relative(temp, resolve(root));
    if (!rel.startsWith("deploypilot-") || rel.includes("/") || rel.includes("\\") || isAbsolute(rel)) throw new Error("Unsafe workspace cleanup");
    await rm(root, { recursive: true, force: true });
  }
}
