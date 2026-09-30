import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { archiveEntries, withSourceWorkspace } from "./source-workspace.js";
function archive(path: string, type = "0", content = "FROM scratch") {
  const header = Buffer.alloc(512);
  header.write(path, 0); header.write("0000644", 100); header.write(content.length.toString(8).padStart(11, "0"), 124); header.write(type, 156);
  return gzipSync(Buffer.concat([header, Buffer.from(content), Buffer.alloc((512 - content.length % 512) % 512), Buffer.alloc(1024)]));
}
describe("source workspace", () => {
  it.each(["repo/../escape", "/repo/file", "repo/C:/escape", "repo/foo\\bar", "repo/CON", "repo/foo./bar"])("rejects unsafe path %s", path => expect(() => archiveEntries(archive(path))).toThrow("Unsafe archive path"));
  it.each(["1", "2", "3", "6", "x"])("rejects links and special archive type %s", type => expect(() => archiveEntries(archive("repo/file", type))).toThrow("regular files"));
  it("extracts source and deletes the exact workspace even on failure", async () => {
    let path = "";
    await expect(withSourceWorkspace(archive("repo/Dockerfile"), async root => {
      path = root;
      expect(await readFile(join(root, "Dockerfile"), "utf8")).toBe("FROM scratch");
      throw new Error("build failed");
    })).rejects.toThrow("build failed");
    await expect(access(path)).rejects.toThrow();
  });
  it("rejects invalid gzip", () => expect(() => archiveEntries(Buffer.from("invalid"))).toThrow());
});
