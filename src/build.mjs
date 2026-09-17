#!/usr/bin/env node
// Builds the static help-search index and widget bundle. See README.md.
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import * as cheerio from 'cheerio';
import { build as esbuild } from 'esbuild';

const API = 'https://api.trainual.com/v3';
const SHARE = 'https://share.trainual.com';
const DIST = 'dist';

const TOKEN = process.env.TRAINUAL_API_TOKEN;
if (!TOKEN) throw new Error('TRAINUAL_API_TOKEN missing (expected in .env)');

/* ---------- HTTP ---------- */

// Trainual 403s the default Node user-agent, so one must always be set.
const UA = 'dfcre-help-search/0.1';

async function get(url, { auth = false, attempt = 0 } = {}) {
  const headers = { Accept: 'application/json', 'User-Agent': UA };
  if (auth) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (res.ok) return res.json();
  if ([429, 500, 502, 503].includes(res.status) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return get(url, { auth, attempt: attempt + 1 });
  }
  throw new Error(`${res.status} on ${url}`);
}

const api = (path) => get(`${API}/${path}`, { auth: true });

// The account limit is 20 req/s in a hard one-second window; stay well under it.
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/* ---------- config ---------- */

const { subjects: configured } = JSON.parse(await readFile('config.json', 'utf8'));

const missing = configured.filter((s) => !s.uuid);
if (missing.length) {
  console.error(
    `\n${missing.length} of ${configured.length} subjects have no Public Share uuid.\n` +
      `Deep links cannot be built for them, so the index would contain dead results.\n\n` +
      missing.map((s) => `  ${String(s.id).padStart(8)}  ${s.title}`).join('\n') +
      `\n\nIn Trainual: open the subject -> Share -> enable public sharing -> copy link.\n` +
      `The uuid is the last path segment of ${SHARE}/subject/<uuid>\n`,
  );
  process.exit(1);
}

/* ---------- share-link health check ---------- */

// Trainual invalidates a share link whenever someone refreshes it, and gives no
// API signal that it happened. Verifying here turns silent breakage into a
// failed build instead of dead links in front of customers.
async function checkShareLinks() {
  const bad = [];
  await pool(configured, 6, async (s) => {
    try {
      const { data } = await get(`${SHARE}/ajax/public_share/public_curriculums/${s.uuid}`);
      if (Number(data?.id) !== Number(s.id)) {
        bad.push(`${s.title}: uuid resolves to subject ${data?.id}, expected ${s.id}`);
      }
    } catch {
      bad.push(`${s.title}: uuid ${s.uuid} does not resolve (link refreshed or sharing disabled)`);
    }
  });
  if (bad.length) {
    console.error(`\nShare link check failed:\n${bad.map((b) => `  - ${b}`).join('\n')}\n`);
    process.exit(1);
  }
  console.log(`share links ok (${configured.length})`);
}

/* ---------- content ---------- */

// Video and attachment embeds render as links whose visible text is the raw URL,
// which is noise in both the index and the excerpt. Strip those from what gets
// indexed, but judge emptiness on the original text so a page that is *only* an
// embed is still kept and found by its title.
function extract(html) {
  const raw = cheerio.load(html ?? '').root().text().replace(/\s+/g, ' ').trim();
  const text = raw
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\/dealforcecre\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const empty = !raw && !/<iframe|<img|step_attachment/i.test(html ?? '');
  return { text, empty };
}

async function buildRecords() {
  const records = [];
  const byId = new Map(configured.map((s) => [Number(s.id), s]));

  const all = (await api('subjects?page[size]=100')).data.filter((s) => byId.has(Number(s.id)));

  // Sequential over subjects keeps the log readable; parallelism is inside.
  for (const subject of all) {
    const cfg = byId.get(Number(subject.id));
    const subjectTitle = subject.attributes.title.trim();

    const full = await api(`subjects/${subject.id}?include=content`);
    // A subject may also hold tests, videos and files; only documents carry prose.
    const documents = (full.included ?? []).filter((c) => c.type === 'document');

    const perDoc = await pool(documents, 6, async (doc) => {
      const withPages = await api(`documents/${doc.id}?include=pages`);
      const pages = (withPages.included ?? [])
        .filter((p) => p.type === 'page')
        .sort((a, b) => (a.attributes.position ?? 0) - (b.attributes.position ?? 0));

      return pool(pages, 6, async (p) => {
        const { data } = await api(`pages/${p.id}`);
        const { text, empty } = extract(data.attributes.content_html);
        if (empty) return null; // genuinely empty step
        return {
          id: `${doc.id}-${p.id}`,
          subject: subjectTitle,
          topic: doc.attributes.title.trim(),
          title: data.attributes.title?.trim() || doc.attributes.title.trim(),
          text,
          url: `${SHARE}/subject/${cfg.uuid}/topic/${doc.id}/step/${p.id}`,
        };
      });
    });

    const got = perDoc.flat().filter(Boolean);
    records.push(...got);
    console.log(`  ${subjectTitle} — ${documents.length} topics, ${got.length} pages`);
  }
  return records;
}

/* ---------- output ---------- */

await checkShareLinks();
console.log('\nfetching content…');
const records = await buildRecords();

const mini = new MiniSearch({
  fields: ['title', 'topic', 'subject', 'text'],
  storeFields: ['subject', 'topic', 'title', 'text', 'url'],
  searchOptions: {
    boost: { title: 4, topic: 2, subject: 1 },
    prefix: true,
    fuzzy: 0.2,
  },
});
mini.addAll(records);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const indexJson = JSON.stringify(mini);
const hash = createHash('sha256').update(indexJson).digest('hex').slice(0, 8);
const indexName = `index.${hash}.json`;

await writeFile(join(DIST, indexName), indexJson);
await writeFile(
  join(DIST, 'manifest.json'),
  JSON.stringify({ index: indexName, built: new Date().toISOString(), records: records.length }, null, 2),
);

await esbuild({
  entryPoints: ['src/widget.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: join(DIST, 'help-widget.js'),
  logLevel: 'warning',
});

// Cloudflare Pages reads this at deploy time. S3 ignores it (deploy.mjs sets the
// same headers via object metadata instead), so it is harmless to always emit.
await writeFile(
  join(DIST, '_headers'),
  [
    '/manifest.json',
    '  Cache-Control: no-cache',
    '  Access-Control-Allow-Origin: *',
    '',
    '/index.*.json',
    '  Cache-Control: public, max-age=31536000, immutable',
    '  Access-Control-Allow-Origin: *',
    '',
    '/help-widget.js',
    '  Cache-Control: public, max-age=300',
    '  Access-Control-Allow-Origin: *',
    '',
  ].join('\n'),
);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `\n${records.length} pages from ${configured.length} subjects\n` +
    `  ${indexName}  ${kb(indexJson.length)}\n` +
    `  help-widget.js\n` +
    `  manifest.json, _headers\n`,
);
