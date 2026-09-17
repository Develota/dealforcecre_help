// Floating help widget: a launcher button, a browsable topic list, and search.
// One script tag, no markup required:
//   <script src="https://<host>/help-widget.js" defer></script>
import MiniSearch from 'minisearch';

// Replaced by esbuild from config.json's ticketUrl.
const TICKET_URL = typeof __TICKET_URL__ === 'string' ? __TICKET_URL__ : '';

const SELF = document.currentScript;
const BASE = (SELF?.dataset.base || SELF?.src || '').replace(/\/[^/]*$/, '');

// Matches the host application: Montserrat, #dd5751 primary, soft card shadows.
const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root {
  font-family: Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px; line-height: 1.5; color: #656565;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }

.fab {
  position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%;
  background: #dd5751; color: #fff;
  box-shadow: 0 6px 20px rgba(221,87,81,.4);
  display: grid; place-items: center;
  transition: transform .15s ease, box-shadow .15s ease;
}
.fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(221,87,81,.5); }
.fab:focus-visible { outline: 3px solid rgba(221,87,81,.4); outline-offset: 2px; }
.fab svg { width: 26px; height: 26px; }

.panel {
  position: fixed; right: 24px; bottom: 92px; z-index: 2147483000;
  width: 380px; max-width: calc(100vw - 32px);
  height: 560px; max-height: calc(100vh - 140px);
  background: #fff; border-radius: 10px;
  /* No border: a pale 1px edge wrapped the coral header and read as a white
     outline around the whole widget. The shadow alone lifts it off the page. */
  box-shadow: 0 10px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
  display: flex; flex-direction: column; overflow: hidden;
  opacity: 0; transform: translateY(8px); pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}
.panel.open { opacity: 1; transform: none; pointer-events: auto; }

.head { position: relative; background: #dd5751; color: #fff; padding: 16px 18px; flex: none; }
.head h2 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: .01em; }
.head p { margin: 2px 0 0; font-size: 12px; opacity: .85; }
.close { position: absolute; top: 12px; right: 12px; color: #fff; opacity: .85; padding: 4px; line-height: 0; }
.close:hover { opacity: 1; }
.close svg { width: 18px; height: 18px; }

.searchbar { padding: 12px; border-bottom: 1px solid #f0f0f0; flex: none; position: relative; }
.searchbar svg { position: absolute; left: 24px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: #adb5bd; }
input {
  width: 100%; padding: 9px 12px 9px 34px; font: inherit; font-size: 13px;
  color: #212529; background: #f9f9f9;
  border: 1px solid #e9ecef; border-radius: 6px; outline: none;
}
input:focus { border-color: #dd5751; background: #fff; box-shadow: 0 0 0 3px rgba(221,87,81,.12); }
input::placeholder { color: #adb5bd; }

.body { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 4px; }

.group {
  padding: 14px 18px 6px; font-size: 10.5px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; color: #b9bfc6;
  background: #fcfcfd; border-bottom: 1px solid #f4f4f4;
}
.subject { border-bottom: 1px solid #f4f4f4; }
.subject > button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 18px; text-align: left; }
.subject > button:hover { background: #fcfcfc; }
.subject .name { flex: 1; font-weight: 600; color: #495057; font-size: 13px; }
.subject .count { font-size: 11px; color: #adb5bd; }
.chev { width: 14px; height: 14px; color: #ced4da; transition: transform .15s ease; flex: none; }
.subject.open .chev { transform: rotate(90deg); }
.pages { display: none; padding: 0 0 8px; }
.subject.open .pages { display: block; }

a.item { display: block; text-decoration: none; color: inherit; padding: 8px 18px 8px 42px; }
a.item:hover, a.item[aria-selected="true"] { background: #fdf3f2; }
a.item .t { font-size: 13px; color: #212529; }
a.item .c {
  font-size: 11px; color: #adb5bd; margin-bottom: 1px;
  /* Subject and topic names are long and often near-identical; keep the crumb to
     one line so it frames the result instead of dominating it. */
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
a.item .x { font-size: 12px; color: #868e96; margin-top: 2px; line-height: 1.45; }
.results a.item { padding-left: 18px; border-bottom: 1px solid #f4f4f4; }
mark { background: #ffe9c7; color: inherit; padding: 0 1px; border-radius: 2px; }

.msg { padding: 28px 18px; text-align: center; color: #adb5bd; font-size: 13px; }
.foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 14px 9px 18px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #adb5bd;
}
.ticket {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 6px; text-decoration: none;
  font-size: 12px; font-weight: 600; color: #dd5751; background: #fdf3f2;
}
.ticket:hover { background: #fbe7e5; }
.ticket svg { width: 14px; height: 14px; }

@media (max-width: 480px) {
  .panel { right: 12px; left: 12px; width: auto; bottom: 84px; }
  .fab { right: 16px; bottom: 16px; }
}
`;

const ICON = {
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 2.8c-.5.2-.8.7-.8 1.2v.6"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v13H4z"/><path d="M8 10h8M8 14h5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};

// "Construction Contracts & Change Orders › Construction Change Orders" is noise;
// show the topic alone when it already contains the subject's distinguishing words.
function crumbText(r) {
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const subj = new Set(norm(r.subject));
  const topicWords = norm(r.topic);
  const overlap = topicWords.filter((w) => subj.has(w)).length;
  if (topicWords.length && overlap / topicWords.length >= 0.6) return r.subject;
  return `${r.subject} › ${r.topic}`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Show the text around the first matching term rather than the opening line.
function context(text, terms, len = 140) {
  if (!text) return '';
  let at = -1;
  const low = text.toLowerCase();
  for (const t of terms) {
    const i = low.indexOf(t.toLowerCase());
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
let tree = null;
let loading = null;

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
      // A cached manifest can point at an index a later deploy removed.
      const fresh = await grab(`${BASE}/manifest.json`, { cache: 'reload' }).then((r) => r.json());
      raw = await grab(`${BASE}/${fresh.index}`).then((r) => r.text());
    }
    const opts = {
      fields: ['title', 'topic', 'subject', 'text'],
      storeFields: ['group', 'subject', 'topic', 'title', 'text', 'url'],
      searchOptions: { boost: { title: 4, topic: 2, subject: 1 }, prefix: true, fuzzy: 0.2 },
    };
    // The browse list is derived from the same file the search index uses, so it
    // needs no second request and can never drift out of sync with it.
    const stored = JSON.parse(raw).storedFields ?? {};
    const bySubject = new Map();
    for (const r of Object.values(stored)) {
      if (!bySubject.has(r.subject)) bySubject.set(r.subject, { group: r.group, pages: [] });
      bySubject.get(r.subject).pages.push(r);
    }
    // Insertion order follows config.json, so the grouping stays whatever was
    // configured rather than being re-sorted here.
    tree = [...bySubject.entries()].map(([subject, v]) => ({ subject, group: v.group, pages: v.pages }));
    mini = MiniSearch.loadJSON(raw, opts);
  })().catch((err) => {
    loading = null; // let the next interaction retry
    throw err;
  });
  return loading;
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="root">
      <button class="fab" aria-label="Help" aria-expanded="false">${ICON.help}</button>
      <div class="panel" role="dialog" aria-label="Help">
        <div class="head">
          <h2>Help center</h2>
          <p>Browse topics or search the documentation</p>
          <button class="close" aria-label="Close">${ICON.close}</button>
        </div>
        <div class="searchbar">${ICON.search}
          <input type="search" placeholder="Search help…" autocomplete="off" aria-label="Search help" />
        </div>
        <div class="body" role="listbox"><div class="msg">Loading…</div></div>
        <div class="foot">
          <span>Opens in Trainual</span>
          ${TICKET_URL ? `<a class="ticket" href="${esc(TICKET_URL)}" target="_blank" rel="noopener">${ICON.ticket}Submit a ticket</a>` : ''}
        </div>
      </div>
    </div>`;

  const fab = root.querySelector('.fab');
  const panel = root.querySelector('.panel');
  const input = root.querySelector('input');
  const body = root.querySelector('.body');
  let hits = [];
  let sel = -1;

  // Search results carry a breadcrumb and an excerpt; browse entries sit under
  // their subject already, so they need neither.
  const itemHTML = (r, terms) => `
    <a class="item" href="${esc(r.url)}" target="_blank" rel="noopener" role="option">
      ${terms ? `<div class="c" title="${esc(r.subject)} › ${esc(r.topic)}">${esc(crumbText(r))}</div>` : ''}
      <div class="t">${esc(r.title)}</div>
      ${terms && r.text ? `<div class="x">${context(r.text, terms)}</div>` : ''}
    </a>`;

  function renderBrowse() {
    sel = -1; hits = [];
    let lastGroup = null;
    body.innerHTML = tree
      .map((s) => {
        const head = s.group && s.group !== lastGroup ? `<div class="group">${esc(s.group)}</div>` : '';
        lastGroup = s.group;
        return head + `<div class="subject">
          <button aria-expanded="false">
            <span class="chev">${ICON.chev}</span>
            <span class="name">${esc(s.subject)}</span>
            <span class="count">${s.pages.length}</span>
          </button>
          <div class="pages">${s.pages.map((p) => itemHTML(p, null)).join('')}</div>
        </div>`;
      })
      .join('');
    body.querySelectorAll('.subject > button').forEach((b) =>
      b.addEventListener('click', () => {
        const expanded = b.parentElement.classList.toggle('open');
        b.setAttribute('aria-expanded', String(expanded));
      }),
    );
  }

  function renderResults(terms) {
    body.innerHTML = hits.length
      ? `<div class="results">${hits.map((h) => itemHTML(h, terms)).join('')}</div>`
      : `<div class="msg">No results for that search.</div>`;
  }

  async function run() {
    const q = input.value.trim();
    try {
      await load();
    } catch (err) {
      body.innerHTML = `<div class="msg">Help is unavailable right now.<br>${esc(err.message || err)}</div>`;
      return;
    }
    if (!q) return renderBrowse();
    hits = mini.search(q).slice(0, 20);
    sel = -1;
    renderResults(q.split(/\s+/).filter(Boolean));
  }

  const open = async (yes) => {
    panel.classList.toggle('open', yes);
    fab.setAttribute('aria-expanded', String(yes));
    fab.innerHTML = yes ? ICON.close : ICON.help;
    if (yes) { await run(); input.focus(); }
  };

  fab.addEventListener('click', () => open(!panel.classList.contains('open')));
  root.querySelector('.close').addEventListener('click', () => open(false));

  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  input.addEventListener('keydown', (e) => {
    const items = [...body.querySelectorAll('a.item')];
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = e.key === 'ArrowDown' ? (sel + 1) % items.length : (sel <= 0 ? items.length : sel) - 1;
      items.forEach((el, i) => el.setAttribute('aria-selected', String(i === sel)));
      items[sel].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault();
      window.open(items[sel].href, '_blank', 'noopener');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) open(false);
  });
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !e.composedPath().includes(host)) open(false);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
