import { readdir, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const page = path.join(root, 'public/tesseract');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const sourceFiles = [...await walk(page), ...await walk(path.join(root, 'scripts'))];
for (const file of sourceFiles) {
  if (/\.(?:m?js)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (!/\.(?:html|js)$/.test(file) || !file.startsWith(page)) continue;
  const source = await readFile(file, 'utf8');
  const references = file.endsWith('.html') ? [...source.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
    : [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const reference of references) {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) continue;
    await access(path.resolve(path.dirname(file), reference.split(/[?#]/)[0]));
  }
}
console.log('JavaScript syntax and local page references pass.');
