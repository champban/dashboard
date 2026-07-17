/** Builds the self-contained DTP Simulator v0.1 (single HTML, kernel in Blob worker). */
import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'apps/simulator');
const common = { bundle: true, write: false, format: 'iife', minify: true, target: 'es2022' };

const worker = await esbuild.build({ ...common, entryPoints: [path.join(src, 'src/worker.ts')] });
const main = await esbuild.build({
  ...common,
  entryPoints: [path.join(src, 'src/app.tsx')],
  jsx: 'automatic',
  define: {
    __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text),
    'process.env.NODE_ENV': '"production"',
  },
});
const template = await readFile(path.join(src, 'template.html'), 'utf8');
const html = template.replace('<!--MAIN_SCRIPT-->', () => `<script>${main.outputFiles[0].text}</script>`);
const out = path.join(root, 'apps/simulator/dist.html');
await writeFile(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(0)} kB)`);
