import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const preview = process.argv.includes('--preview');
const content = path.join(root, preview ? 'dist' : 'public/tesseract');
const assets = path.join(root, preview ? 'dist' : 'public');
const port = Number(process.env.PORT || 4321);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!preview && pathname.startsWith('/tesseract/')) pathname = pathname.slice('/tesseract'.length);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const candidates = [...new Set([content, assets])].map(base => {
      const file = path.resolve(base, '.' + pathname);
      if (!file.startsWith(base + path.sep)) throw new Error('Invalid path');
      return file;
    });
    let data, resolved;
    for (const file of candidates) {
      try { data = await readFile(file); resolved = file; break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!resolved) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`${preview ? 'Preview' : 'Portfolio'}: http://127.0.0.1:${port}`));
