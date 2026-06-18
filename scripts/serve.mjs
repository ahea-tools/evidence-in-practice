import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const types = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css']]);
createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const path = normalize(join(root, pathname));
  if (!path.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    response.writeHead(200, { 'content-type': types.get(extname(path)) ?? 'application/octet-stream' });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4173, () => console.log('Serving http://localhost:4173'));
