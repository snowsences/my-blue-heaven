# My Blue Heaven

A personal life-tracking PWA — albums, songs, restaurants, hikes/parks/roads,
photos, books/movies/games, trips, activities — all ranked or organized by
head-to-head "duels" or manual ordering. Single user, Firebase-backed,
no build step.

## File layout

- `index.html` — page shell: `<head>`, the full HTML body (every tab's
  markup, all dialogs/overlays/sheets), and two small `<link>`/`<script
  src>` references into the files below. Keep this file about markup only.
- `styles.css` — all CSS, previously an inline `<style>` block.
- `app.js` — the entire application: one big `(function(){ ... })();` IIFE,
  previously an inline `<script>` block. Every tab's rendering, state, and
  Firebase/Cloudinary/Last.fm/MusicBee integration lives in here, sharing
  one closure. ~740 functions, ~19k lines.
- `sw.js` — service worker. Precaches `index.html`/`styles.css`/`app.js` (the
  `SHELL` array) so the installed app opens offline; everything same-origin
  is otherwise network-first (always fresh when online, cached copy only as
  an offline fallback). **Bump `CACHE`'s version string whenever you change
  which files are precached**, so installed clients pick up the new set.
- `manifest.json`, icon/favicon PNGs — standard PWA install metadata.

There is no build step, no bundler, no package.json, no CI. These are
static files served as-is. `index.html`, `styles.css`, and `app.js` used to
be one 25,667-line file; they were split along those exact boundaries with
nothing rewritten (verified byte-for-byte against the original before and
after). Splitting `app.js` further — into per-feature modules — would mean
converting a single shared closure into real ES modules (explicit
imports/exports touching every one of those ~740 functions) or very
carefully preserving classic-script global scope across multiple `<script>`
tags. Don't attempt that without a build step and much more test coverage
than this project currently has; the risk/reward isn't there yet.

## Architecture inside app.js

- **One closure, no modules.** Everything — state, DOM element references,
  every function — lives inside the single top-level IIFE. Nothing is
  exported to `window` deliberately, so **none of it is reachable from
  outside the page** (see Testing below).
- **Each tab is mostly self-contained.** Search for its own `---------- TAB
  NAME ----------` banner comment to find a tab's state, render function,
  and event wiring together in one place. Shared helpers (date parsing,
  `escapeHtml`/`escapeAttr`, the generic sheet/modal components) sit outside
  any one tab's section and are reused across all of them.
- **Ranking via "duels"** (Albums, Songs, and previously Photos — now
  retired for Photos, see its own section comment) use a shared
  `mergeSortGen`/`estimateComparisons` head-to-head merge sort. Each has its
  own independent state (`photoDuelItems`, etc.) rather than sharing one
  generic ranker — intentional, see the Photos section's own comment for why.
- **"Draft until Save" edit screens** (Photos' Edit Mode, Albums' Edit
  Items, etc.): nothing touches the real data array until a Save button is
  clicked. In-progress changes live in local `Map`s or on-screen DOM state;
  Cancel just re-renders from the untouched source of truth. When extending
  one of these screens, keep new fields in the same draft-until-save shape
  rather than mutating the live array early.
- **Insights charts** (By Year, By Month, By Artist, etc.) are a copy-paste
  pattern: a `.insights-section` > `.insights-block` > `.artist-list` of
  `.artist-row` bars, built by a small per-tab `render*Insights()` function
  with its own local `show(id, on)` helper. Grep any existing one
  (`renderPhotoInsights`, `renderHikeInsights`) before building a new one
  from scratch.
- **Filters** (Albums' Year/Artist/Grouping, Photos' Year/Season, Dishes'
  Restaurant) are a text `<input>` + `<datalist>` + a ✕ clear button, gated
  through `setGatedDatalistOptions`/`wireDatalistGating` so suggestions only
  show once you start typing, and committed only on an exact match (so
  mid-typing never flashes a wrong/empty list). Multiple filters on one tab
  combine as AND. Edit/rearrange modes always ignore active filters and show
  everything — see any `skipFilters`-style parameter on that tab's
  `*DisplayRows()` function.
- **`tsheetOpen(cfg)`** is a generic bottom sheet (title + arbitrary
  `bodyHtml` + an `actions` array of buttons) used all over — trip pickers,
  small forms, confirmation flows with input fields. Prefer it over a new
  bespoke overlay.
- **The lightbox** (`#art-lightbox-overlay`) is one shared component for
  every photo viewer in the app (Photos tab, restaurant galleries, dish
  photos, hikes). A change to its CSS or nav affects all of them at once —
  that's by design, not a coincidence to work around.

## Testing

There is no automated test suite checked into the repo. This project's own
sessions write throwaway Playwright scripts against a local
`python3 -m http.server`, pointed at a deployed copy of the three app
files, driving the real UI. **Closure-scoped functions and variables are
not reachable via `page.evaluate()`** — calling e.g. `photoDisplayRows()`
or reading `photoRows` from outside the page always throws
`ReferenceError`. Drive everything through real clicks/fills, or dispatch
real DOM events (e.g. `DragEvent` for drag-and-drop — mouse-event-only
simulation doesn't reliably trigger HTML5 drag in headless Chromium and can
hang). Seed test data via `window.storage.set('<storage-key>', json,
false)` then reload, matching each tab's own `*_STORAGE_KEY`.

## Before changing index.html / styles.css / app.js

- Keep markup in `index.html`, styles in `styles.css`, behavior in
  `app.js`. Don't reintroduce an inline `<style>` or a second inline
  `<script>` — it defeats the split and the service worker's precache list.
- If you add a new top-level static asset the app needs on first paint
  (another .js/.css file), add it to `sw.js`'s `SHELL` array and bump
  `CACHE`'s version.
- `app.js` has no `type="module"` and isn't deferred — it's a classic,
  render-blocking script, same as when it was inline. Don't add `type="module"`
  or `defer`/`async` to its `<script>` tag without checking every place
  that currently assumes the DOM is already fully parsed and the script
  runs synchronously at that point (most of the app does, via top-level
  `document.getElementById(...)` calls at the top of the IIFE).
