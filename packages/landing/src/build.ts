import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, renderStyles } from './render.js';

/** Write the generated landing page and stylesheet into dist/. */
async function build(): Promise<void> {
  const outDir = dirname(fileURLToPath(import.meta.url));
  await mkdir(outDir, { recursive: true });

  const html = renderPage();
  const css = renderStyles();

  await writeFile(join(outDir, 'index.html'), html, 'utf8');
  await writeFile(join(outDir, 'styles.css'), css, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Built landing page → ${join(outDir, 'index.html')} (${html.length} bytes)`);
}

build().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Landing build failed:', error);
  process.exitCode = 1;
});
