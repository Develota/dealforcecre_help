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

`.env` is gitignored. Never commit it.

## Commands

```bash
npm run build       # fetch content and build the index into dist/
npm run deploy:gh   # publish dist/ to GitHub Pages
```

Always `build` before you deploy — `deploy` only uploads what is already in `dist/`.

`npm run build` writes four files to `dist/` and nothing else. Check the search itself on
the deployed URL after a deploy.

## Embedding

Add two lines wherever the search box belongs:

```html
<script src="https://<your-pages-url>/help-widget.js" defer></script>
<div id="dfcre-help"></div>
```

`npm run deploy:gh` prints the exact tag with your URL filled in.

That is the entire integration. The widget renders its own input and results, loads
nothing until someone clicks into the search box, and keeps its styling isolated so it
cannot clash with the host page. Results open in a new tab.

Optional attributes on the script tag:

| attribute | default | purpose |
|---|---|---|
| `data-mount` | `dfcre-help` | id of the element to render into |
| `data-base` | script's own folder | where to load the index from |

## Choosing what is searchable

`config.json` lists the Trainual subjects to index:

```json
{ "id": 73743, "title": "Inbox", "uuid": "5735086f-…" }
```

- `id` — the subject id, from its Trainual URL
- `uuid` — its Public Share id, the last part of `https://share.trainual.com/subject/<uuid>`
- `title` — a label for humans; the live title from Trainual is what gets indexed

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
