# Deploying Mesh Studio (mesh.aashenaifi.com)

Mesh Studio is its own Cloudflare Pages project. It is built from this folder by Cloudflare on every push.

## Cloudflare Pages settings (one-time)

Workers & Pages -> Create -> Pages -> Connect to Git -> the source repository.
Settings -> About links to the public source (AGPL).

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/mesh-studio` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

Then: the new project -> Custom domains -> Set up a custom domain ->
`mesh.aashenaifi.com`. (Cloudflare adds the DNS record for you when
aashenaifi.com is on the same Cloudflare account.)

## What is in this folder that makes it work

- `public/_headers`: COOP `same-origin` + COEP `require-corp` + CORP `same-site`
  for the whole site (cross-origin isolation for multi-threaded Wasm), and cache
  rules. Do not add third-party scripts, fonts or iframes: COEP blocks them.
- `public/openscad/`: the OpenSCAD engine (Wasm, JS, libraries), loaded by
  `src/features/scad/scad.worker.ts`. `openscad.wasm` is ~9.2 MiB, under the
  25 MiB Pages file limit.
- `public/manifest.webmanifest` + icon files: app icon, home-screen install.

## Local checks

```bash
cd apps/mesh-studio
npm ci
npm run build                 # type-check + production build into dist/
npm run preview               # http://localhost:4173/ (sends the same isolation headers)
node tests/e2e/run-all.mjs http://localhost:4173/
```

## AI designer

Temporarily disabled (see `src/features.ts`). It needs the `/api/stl-ai`
Pages Function, which does not exist on this site.
