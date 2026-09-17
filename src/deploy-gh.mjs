#!/usr/bin/env node
// Publishes dist/ to the gh-pages branch of GH_PAGES_REPO.
//
// Builds the branch from scratch in a temp clone and force-pushes, so the branch
// contains exactly the built site and nothing else. GitHub Pages serves every file
// with Access-Control-Allow-Origin: * and pins Cache-Control to max-age=600, which
// it does not let you override; the widget tolerates that by retrying once with the
// HTTP cache bypassed if a cached manifest points at an index that is no longer there.
import { cp, mkdtemp, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = process.env.GH_PAGES_REPO;
if (!repo) {
  console.error(
    'GH_PAGES_REPO missing. Set it in .env, e.g.\n' +
      '  GH_PAGES_REPO=https://github.com/<user-or-org>/<repo>.git\n\n' +
      'Create an empty PUBLIC repo first — GitHub Pages needs public on the free plan.',
  );
  process.exit(1);
}

const files = await readdir('dist').catch(() => []);
if (!files.includes('manifest.json')) {
  console.error('dist/ is missing or stale — run `npm run build` first');
  process.exit(1);
}

const dir = await mkdtemp(join(tmpdir(), 'dfcre-pages-'));

// execFileSync throws an Error whose message is a byte dump; re-throw with git's own
// stderr so a push failure reads as one line rather than a stack trace. Throwing
// rather than exiting here keeps the temp directory cleanup in `finally` reachable.
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  } catch (err) {
    const detail = (err.stderr?.toString() || err.stdout?.toString() || err.message).trim();
    throw Object.assign(new Error(detail), { gitCommand: args[0] });
  }
};

let failure = null;
try {
  await cp('dist', dir, { recursive: true });
  git('init', '-q');
  git('checkout', '-q', '-b', 'gh-pages');
  git('add', '-A');
  git('-c', 'user.email=deploy@localhost', '-c', 'user.name=deploy',
      'commit', '-q', '-m', `help index ${new Date().toISOString()}`);
  git('push', '--force', '--quiet', repo, 'gh-pages:gh-pages');
} catch (err) {
  failure = err;
} finally {
  await rm(dir, { recursive: true, force: true });
}

if (failure) {
  console.error(`\ngit ${failure.gitCommand ?? ''} failed:\n${failure.message.replace(/^/gm, '  ')}\n`);
  if (/denied|403|authentication/i.test(failure.message)) {
    console.error('Check that you can push to GH_PAGES_REPO from this shell.');
  }
  process.exit(1);
}

// If the Pages site has a custom domain, github.io 301-redirects to it WITHOUT a
// CORS header, and browsers reject a cross-origin fetch whose redirect fails the
// CORS check — so the widget must be loaded from the canonical host. Set
// GH_PAGES_URL to that origin (plus path) when a custom domain is configured.
const m = repo.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
const base = (process.env.GH_PAGES_URL || (m ? `https://${m[1].toLowerCase()}.github.io/${m[2]}` : '')).replace(/\/$/, '') || '<your pages url>';
console.log(`published ${files.length} files to gh-pages\n`);
console.log(`  <script src="${base}/help-widget.js" defer></script>`);
console.log('  <div id="dfcre-help"></div>\n');
console.log('First deploy only: repo Settings -> Pages -> Source = gh-pages branch.');
console.log('Pages can take a minute to go live.');
