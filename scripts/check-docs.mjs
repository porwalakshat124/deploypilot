import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'];
async function collect(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.name === 'verification') continue;
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await collect(relative);
    else if (entry.name.endsWith('.md')) files.push(relative);
  }
}
await collect('docs');
const contents = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(root, file), 'utf8')])));
function anchors(text) {
  const counts = new Map(); const ids = new Set();
  for (const match of text.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(base) ?? 0; counts.set(base, count + 1); ids.add(count ? `${base}-${count}` : base);
  }
  return ids;
}
const failures = []; let links = 0;
for (const [file, text] of contents) {
  for (const match of text.replace(/```[\s\S]*?```/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = match[1]; if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const [location, fragment] = href.split('#');
    const target = location ? path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(location)) : path.join(root, file);
    if (!target.startsWith(root)) { failures.push(`${file}: link leaves repository`); continue; }
    try { await access(target); } catch { failures.push(`${file}: missing ${href}`); continue; }
    if (fragment && target.endsWith('.md') && !anchors(await readFile(target, 'utf8')).has(decodeURIComponent(fragment))) failures.push(`${file}: missing anchor ${href}`);
    links++;
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Documentation check passed: ${files.length} Markdown files, ${links} local links/anchors.`);
