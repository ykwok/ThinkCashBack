import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Zero-dependency static preview server for the generated dist/ output.
 * Run `pnpm --filter @thinkcashback/landing build` first, then this serves the
 * page on http://localhost:4321 (override with PORT).
 */
const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4321);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const rawPath = (req.url ?? '/').split('?')[0];
  const relative = rawPath === '/' ? 'index.html' : normalize(rawPath).replace(/^([/\\.]+)/, '');
  const filePath = join(DIST_DIR, relative);

  stat(filePath)
    .then((info) => {
      if (!info.isFile()) {
        throw new Error('not a file');
      }
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    })
    .catch(() => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found — run the build first: pnpm --filter @thinkcashback/landing build');
    });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Landing preview running at http://localhost:${PORT}`);
});
