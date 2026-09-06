# Web example

A single-page front-end that generates Hospital/Resident instances and solves
them with `simple-matching-ts`, entirely in the browser.

## Run it

The example depends on the library through `file:../..`, so build the library
first:

```bash
# in the repository root
npm install   # or: bun install
npm run build # emits dist/, which the example imports

# here
cd examples/web
npm install
npm run dev   # http://localhost:5173
```

`npm run build` type-checks the page and bundles it into `dist/`, and
`npm run preview` serves that bundle.

> **`index.html` を静的サーバーで直接開かないでください。**
> このページは `<script type="module" src="/src/main.ts">` で TypeScript を
> そのまま読み込み、Vite に変換させています。`python3 -m http.server` や
> VS Code の Live Server などで開くと、`.ts` が JavaScript として配信されず
> `Failed to load module script: ... MIME type of "text/vnd.trolltech.linguist"`
> で止まります。素の静的サーバーで配信したいときは `npm run build` で
> `dist/` にバンドルしてから、その `dist/` を配信してください
> (`npm run preview` がそれをします)。

## What it shows

- **`HospitalResident.generate()`** — a uniformly random instance from a seed,
  so the same seed always gives the same page (and the same instance as the
  Python version).
- **`generateBiasedHR()`** — an instance whose residents (and hospitals) agree
  with each other to the degree the two `alpha` sliders set.
- **`cutResidentPrefences()` / `setTieLast()`** — incomplete preference lists,
  optionally with the hospitals left out tied at the last rank.
- **`setCapacities()`** — even capacities, a capacity of your own, or `tight`
  capacities that add up to exactly the number of residents.
- **`solve()`** — the resident-oriented Gale-Shapley matching, drawn as the two
  tables and summarised above them.
- **`normalize()`** — renumbering the residents and the hospitals by
  popularity.
- **`toText()` / `fromText()`** — the instance file format, editable in the
  panel at the bottom and downloadable as a `.txt`.

## Embedding the library yourself

The library is plain ES modules with no runtime dependency, so a bundler pulls
it in as it is. One thing to know: `HospitalResident.save()` and
`HospitalResident.load()` take file paths, so `hospitalResident.ts` imports
`node:fs` and `node:path` at its top, and a browser build has to deal with
those two imports even though the page never calls either method.

This example aliases them to a stub that throws if it is ever reached
(`src/nodeStub.ts`, wired up in `vite.config.ts`):

```ts
export default defineConfig({
  resolve: {
    alias: {
      "node:fs": nodeStub,
      "node:path": nodeStub,
    },
  },
});
```

Use `toText()` and `fromText()`, which work on strings, wherever you would
reach for `save()` and `load()` on the server.
