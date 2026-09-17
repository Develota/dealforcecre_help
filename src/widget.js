// Drop-in help search. One script tag per host app:
//   <script src="https://<assets>/help-widget.js" defer></script>
//   <div id="dfcre-help"></div>
import MiniSearch from 'minisearch';

// Resolved at load time: currentScript is null once the script has finished.
const SELF = document.currentScript;
const BASE = (SELF?.dataset.base || SELF?.src || '').replace(/\/[^/]*$/, '');
const MOUNT_ID = SELF?.dataset.mount || 'dfcre-help';

const CSS = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
* { box-sizing: border-box; }
.wrap { position: relative; max-width: 560px; }
input {
  width: 100%; padding: 10px 14px; font-size: 15px; line-height: 1.4;
  border: 1px solid #cbd2d9; border-radius: 6px; outline: none; color: #1c1e21; background: #fff;
}
input:focus { border-color: #2b6cb0; box-shadow: 0 0 0 3px rgba(43,108,176,.15); }
.panel {
  position: absolute; z-index: 9999; left: 0; right: 0; top: calc(100% + 6px);
  background: #fff; border: 1px solid #cbd2d9; border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12); max-height: 420px; overflow-y: auto;
}
.hit { display: block; padding: 10px 14px; text-decoration: none; color: inherit; border-bottom: 1px solid #eef1f4; cursor: pointer; }
.hit:last-child { border-bottom: 0; }
.hit[aria-selected="true"] { background: #eef4fb; }
.crumb { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #7a869a; margin-bottom: 2px; }
.title { font-size: 14px; font-weight: 600; color: #1c1e21; }
.ctx { font-size: 13px; color: #55606e; margin-top: 3px; line-height: 1.45; }
mark { background: #fff3c4; color: inherit; padding: 0 1px; border-radius: 2px; }
.msg { padding: 14px; font-size: 13px; color: #7a869a; }
`;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Show the part of the page text around the first query term, not just the opening line.
function context(text, terms, len = 150) {
  let at = -1;
  for (const t of terms) {
    const i = text.toLowerCase().indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const start = at === -1 ? 0 : Math.max(0, at - 40);
  let out = esc(text.slice(start, start + len));
  for (const t of terms) {
    if (t.length < 2) continue;
    out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
  }
  return (start > 0 ? '… ' : '') + out + '…';
}

let mini = null;
let loading = null;

// Nothing is fetched until the user actually interacts with the box.
function load() {
  if (loading) return loading;
  loading = (async () => {
    const grab = async (url, opts) => {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`${r.status} fetching ${url}`);
      return r;
    };
    const manifest = await grab(`${BASE}/manifest.json`, { cache: 'no-cache' }).then((r) => r.json());
    let raw;
    try {
      raw = await grab(`${BASE}/${manifest.index}`).then((r) => r.text());
    } catch {
      // Hosts that force a fixed TTL (GitHub Pages pins everything to 600s) can serve
      // a cached manifest pointing at an index a later deploy removed. Bypass the HTTP
      // cache and retry once rather than leaving search broken until the TTL expires.
      const fresh = await grab(`${BASE}/manifest.json`, { cache: 'reload' }).then((r) => r.json());
      raw = await grab(`${BASE}/${fresh.index}`).then((r) => r.text());
    }
    mini = MiniSearch.loadJSON(raw, {
      fields: ['title', 'topic', 'subject', 'text'],
      storeFields: ['subject', 'topic', 'title', 'text', 'url'],
      searchOptions: { boost: { title: 4, topic: 2, subject: 1 }, prefix: true, fuzzy: 0.2 },
    });
  })().catch((err) => {
    loading = null; // let the next keystroke retry rather than wedging forever
    throw err;
  });
  return loading;
}

function mount(host) {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="wrap">
      <input type="search" placeholder="Search help…" autocomplete="off" aria-label="Search help" />
      <div class="panel" hidden></div>
    </div>`;

  const input = root.querySelector('input');
  const panel = root.querySelector('.panel');
  let hits = [];
  let sel = -1;

  const close = () => { panel.hidden = true; sel = -1; };

  function render(terms) {
    if (!hits.length) {
      panel.innerHTML = `<div class="msg">No results</div>`;
    } else {
      panel.innerHTML = hits
        .map(
          (h, i) => `<a class="hit" role="option" aria-selected="${i === sel}" href="${esc(h.url)}" target="_blank" rel="noopener">
            <div class="crumb">${esc(h.subject)} › ${esc(h.topic)}</div>
            <div class="title">${esc(h.title)}</div>
            ${h.text ? `<div class="ctx">${context(h.text, terms)}</div>` : ''}
          </a>`,
        )
        .join('');
    }
    panel.hidden = false;
  }

  async function run() {
    const q = input.value.trim();
    if (!q) return close();
    panel.innerHTML = `<div class="msg">Searching…</div>`;
    panel.hidden = false;
    try {
      await load();
    } catch (err) {
      // Most often: opened over file://, or the index host is missing CORS headers.
      const local = location.protocol === 'file:';
      panel.innerHTML = `<div class="msg">Search index could not be loaded.<br>${
        local ? 'This page must be served over http — open it through a web server, not from the filesystem.' : esc(String(err.message || err))
      }</div>`;
      return;
    }
    hits = mini.search(q).slice(0, 8);
    sel = -1;
    render(q.split(/\s+/).filter(Boolean));
  }

  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  input.addEventListener('focus', () => load().catch(() => {})); // warm the index; errors surface on search
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (panel.hidden || !hits.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : hits.length - 1) + (sel === -1 && e.key === 'ArrowUp' ? 1 : 0)) % hits.length;
      [...panel.querySelectorAll('.hit')].forEach((el, i) => el.setAttribute('aria-selected', i === sel));
      panel.querySelectorAll('.hit')[sel]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault();
      window.open(hits[sel].url, '_blank', 'noopener');
    }
  });
  document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
}

const start = () => {
  const host = document.getElementById(MOUNT_ID);
  if (host && !host.shadowRoot) mount(host);
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
