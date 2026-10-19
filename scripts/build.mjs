import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('public/tesseract/', root), output, { recursive: true });
for (const file of ['CNAME', '.nojekyll', 'Eric_Sun_Resume.pdf']) {
  await cp(new URL(`public/${file}`, root), new URL(file, output));
}
// The source page lives one level deeper than the built homepage.
const index = new URL('index.html', output);
await writeFile(index, (await readFile(index, 'utf8')).replace('href="../Eric_Sun_Resume.pdf"', 'href="./Eric_Sun_Resume.pdf"'));
// Preserve the earlier preview URL after the active page becomes the homepage.
await mkdir(new URL('tesseract/', output));
await writeFile(new URL('tesseract/index.html', output), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=../"><title>Eric Sun</title><a href="../">Eric Sun’s portfolio</a></html>\n');
console.log('Built the tesseract portfolio in dist/ (no dependencies required).');
