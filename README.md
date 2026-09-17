# DealforceCRE Help Search

Search across the DealforceCRE help documentation. Results link straight to the relevant
page in Trainual.

Trainual hosts the content; this project builds a search index over it and ships a small
widget that any application can embed with one script tag. The output is three static
files, so a single build serves every environment.

## Requirements

- Node 20 or newer
- A Trainual API token with content read access
- Somewhere to host three static files (GitHub Pages works and is free)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| variable | needed for | notes |
|---|---|---|
| `TRAINUAL_API_TOKEN` | building | Trainual → Settings → API |
| `GH_PAGES_REPO` | `deploy:gh` | `https://github.com/<user>/<repo>.git`, public repo |
| `GH_PAGES_URL` | `deploy:gh` | only if Pages uses a custom domain — see Troubleshooting |

`.env` is gitignored. Never commit it.

## Commands

```bash
npm run build       # fetch content and build the index into dist/
npm run deploy:gh   # publish dist/ to GitHub Pages
npm run dev         # serve dist/ locally with CORS, for trying changes first
```

Always `build` before you deploy — `deploy` only uploads what is already in `dist/`.

`npm run build` writes four files to `dist/` and nothing else.

### Trying changes before publishing

`npm run dev` serves `dist/` on `http://localhost:4477` with permissive CORS. Point your
application's script tag at `http://localhost:4477/help-widget.js`, and each rebuild shows
up on the next page refresh — no deploy needed. Set `DEV_PORT` to use another port.

## Embedding

Add one line to your layout:

```html
<script src="https://<your-pages-url>/help-widget.js" defer></script>
```

`npm run deploy:gh` prints the exact tag with your URL filled in.

That is the entire integration. No markup is needed: the widget appends a floating
button to the bottom-right corner, renders its panel from there, and loads nothing until
someone opens it. Its styling lives in a shadow root, so it cannot clash with the host
page. Results open in a new tab.

Set `data-base` on the script tag to load the index from somewhere other than the
script's own folder — useful when testing a local build against a deployed widget.

## Choosing what is searchable

`config.json` lists the Trainual subjects to index:

```json
{ "id": 73743, "title": "Inbox", "group": "Everyday work", "uuid": "5735086f-…" }
```

- `id` — the subject id, from its Trainual URL
- `uuid` — its Public Share id, the last part of `https://share.trainual.com/subject/<uuid>`
- `group` — the heading it appears under in the widget
- `title` — a label for humans; the live title from Trainual is what gets indexed

**Order matters.** Subjects appear in the widget in the order listed here, and
consecutive entries sharing a `group` are shown together under one heading. Reordering
the file reorders the widget.

### Adding a subject

1. In Trainual, open the subject in **edit mode** → Share → Public share
2. Turn on **Allow public sharing**, leave **Allow duplication** off
3. Copy the link and add an entry to `config.json` with the uuid from it
4. `npm run build && npm run deploy:gh`

Only **published** subjects can be shared publicly.

> **Do not use the refresh icon** next to a share link in Trainual. It issues a new uuid
> and immediately breaks every existing link to that subject, including the ones already
> published in the search index. If someone does, paste the new uuid into `config.json`
> and rebuild.

The build checks every share link before fetching anything and stops if one no longer
works, so a broken link fails the build instead of reaching users.

### Removing a subject

Delete its entry from `config.json` and rebuild. Turning off public sharing in Trainual
without removing the entry will fail the next build, by design.

## Deploying

### GitHub Pages

Create an **empty public repository** — Pages needs public on the free plan — put its URL
in `GH_PAGES_REPO`, then:

```bash
npm run deploy:gh
```

First deploy only: in that repository, **Settings → Pages → Source → `gh-pages` branch**.
Pages can take a minute to become reachable, returning 404 until it does.

Publish only the built `dist/` folder this way. That is what `deploy:gh` does.

Content changes appear within about ten minutes of a deploy, which is how long GitHub
Pages caches files.

### Other hosts

Any static host works, as long as it serves the files with
`Access-Control-Allow-Origin: *`. Copy `dist/` there and point the script tag at it.

`npm run deploy:pages` publishes to Cloudflare Pages, which is also free and applies
updates immediately rather than after ten minutes.

## Troubleshooting

**Build stops with a list of subjects.** They have no `uuid` in `config.json`. Follow
*Adding a subject* above.

**Build stops with "Share link check failed".** That subject's share link was refreshed
or public sharing was switched off in Trainual. Get the current uuid, or remove the entry.

**Search box appears but finds nothing.** The index could not load. The widget says why
in the results panel.

"Failed to fetch" with the host reachable in a browser usually means a **redirect**. If
the Pages site has a custom domain, `<org>.github.io/...` redirects to it and the
redirect response carries no CORS header — which browsers reject even though the final
URL is fine. `curl` follows it happily, so it looks healthy from the terminal. Load the
widget from the canonical domain instead, and set `GH_PAGES_URL` so deploys print it.

**A result opens a Trainual page that says sign in.** Public sharing was turned off for
that subject after the last build. Re-enable it, or remove the subject and rebuild.

**Nothing changed after a deploy.** Give it ten minutes, or hard-reload. Confirm
`npm run build` ran before the deploy.
