import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] || process.env.CRT_EFFECT_DIR || path.join(website, '..', 'crt-effect'));
const destination = path.join(website, 'public', 'tesseract', 'assets', 'vendor', 'crt-effect');
const files = ['dist/crt-effect.js', 'dist/version.json', 'LICENSE'];
// Read and validate everything first, so a missing/unbuilt library leaves the vendor copy intact.
const [module, version, license] = await Promise.all(files.map(file => readFile(path.join(source, file))));
const metadata = JSON.parse(version.toString());
if (metadata.name !== 'crt-effect' || !/^\d+\.\d+\.\d+/.test(metadata.version) || metadata.license !== 'MIT') {
  throw new Error('Invalid crt-effect version metadata. Run npm run build in the library repository.');
}
await mkdir(destination, { recursive: true });
for (const [file, data] of [['crt-effect.js', module], ['version.json', version], ['LICENSE', license]]) {
  await writeFile(path.join(destination, file), data);
}
console.log(`Synced crt-effect ${metadata.version} from ${source}`);
