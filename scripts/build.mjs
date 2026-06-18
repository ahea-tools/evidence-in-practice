import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

await mkdir('dist/assets', { recursive: true });
await cp('src/styles.css', 'dist/assets/styles.css');
let html = await readFile('index.html', 'utf8');
html = html.replaceAll('/assets/', './assets/');
await writeFile('dist/index.html', html);
if (!existsSync('dist/assets/main.js')) {
  throw new Error('TypeScript did not produce dist/assets/main.js');
}
