#!/usr/bin/env node
// Publishes dist/ to the gh-pages branch of GH_PAGES_REPO.
// GitHub Pages serves every file with Access-Control-Allow-Origin: * and pins
// Cache-Control to max-age=600, which it does not let you override. The widget
// tolerates that: a stale manifest pointing at a removed index triggers one
// cache-bypassing retry.
import { publish } from 'gh-pages';
import { readdir } from 'node:fs/promises';

const repo = process.env.GH_PAGES_REPO;
if (!repo) {
  console.error(
    'GH_PAGES_REPO missing. Set it in .env, e.g.\n' +
      '  GH_PAGES_REPO=https://github.com/<user>/<repo>.git\n\n' +
      'Create an empty PUBLIC repo first — GitHub Pages needs public on the free plan.',
  );
  process.exit(1);
}

const files = await readdir('dist').catch(() => []);
if (!files.includes('manifest.json')) {
  console.error('dist/ is missing or stale — run `npm run build` first');
  process.exit(1);
}

await new Promise((resolve, reject) =>
  publish(
    'dist',
    {
      repo,
      branch: 'gh-pages',
      dotfiles: true, // keep _headers for hosts that read it
      // Old index.<hash>.json files are kept so a client holding a cached manifest
      // still resolves. Without this, search breaks for up to 10 minutes per deploy.
      add: true,
      message: `help index ${new Date().toISOString()}`,
    },
    (err) => (err ? reject(err) : resolve()),
  ),
);

const m = repo.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
const base = m ? `https://${m[1]}.github.io/${m[2]}` : '<your pages url>';
console.log(`\npublished to gh-pages\n\n  <script src="${base}/help-widget.js" defer></script>\n  <div id="dfcre-help"></div>\n`);
console.log('If this is the first deploy: repo Settings -> Pages -> Source = gh-pages branch.');
console.log('Pages can take a minute to go live.');
