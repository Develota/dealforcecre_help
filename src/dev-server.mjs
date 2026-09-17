#!/usr/bin/env node
// Serves dist/ with permissive CORS so a locally running app can load the widget
// from here while iterating, without deploying.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const PORT = Number(process.env.DEV_PORT ?? 4477);
const TYPES = { '.json': 'application/json', '.js': 'text/javascript', '.html': 'text/html' };

createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'manifest.json';
  try {
    const body = await readFile(join('dist', name));
    res.writeHead(200, {
      'Content-Type': TYPES[extname(name)] ?? 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store', // always serve the newest build while iterating
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`serving dist/ on http://localhost:${PORT}`);
  console.log(`\n  <script src="http://localhost:${PORT}/help-widget.js" defer></script>\n`);
});
