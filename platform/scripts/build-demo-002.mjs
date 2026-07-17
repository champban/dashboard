/** Builds the self-contained Demo-002 HTML: kernel bundled into a Blob worker. */
import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'demos/demo-002-src');

const common = { bundle: true, write: false, format: 'iife', minify: true, target: 'es2022' };

const worker = await esbuild.build({ ...common, entryPoints: [path.join(src, 'worker.ts')] });
const workerCode = worker.outputFiles[0].text;

const main = await esbuild.build({
  ...common,
  entryPoints: [path.join(src, 'main.ts')],
  define: { __WORKER_SOURCE__: JSON.stringify(workerCode) },
});

const template = await readFile(path.join(src, 'template.html'), 'utf8');
const html = template.replace('<!--MAIN_SCRIPT-->', `<script>${main.outputFiles[0].text}</script>`);
const out = path.join(root, 'demos/demo-002-kernel.html');
await writeFile(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB)`);
