# Editing the integrated journey

The working source is `apps/web/public/cinematic/` (camera, spacecraft, Earth,
terrain and mount lifecycle), with markup/styles in
`apps/web/components/cinematic/`. These are shared by Next.js and the Vite preview.
No ZIP generation or extraction is involved.

From the owned integration or refinement worktree:

```sh
npm -w apps/web run dev -- --hostname 127.0.0.1 --port 5180
/Users/bill/agriscope-cinematic/node_modules/.bin/vite --config tools/cinematic/vite.config.mjs --port 5182
```

Next.js: `http://127.0.0.1:5180/`; original landing: `/overview`.
Vite scene preview with hot reload: `http://127.0.0.1:5182/`.
Native scene module changes appear on a Next.js page reload; markup/styles use
Next.js refresh. Vite refreshes changes to all three. Ports are explicit; neither
server stops another listener. Use a free port if occupied.

The local worktree reuses installed Next.js dependencies through an ignored
`node_modules` symlink. No packages were installed for this integration. Three.js
is the supplied pinned 0.170.0, vendored with its license. To regenerate only that
vendor from the existing toolchain:

```sh
node scripts/build-cinematic-vendor.mjs /Users/bill/agriscope-cinematic
```

Focused checks (Chrome must be installed):

```sh
node tests/cinematic/timeline.mjs
node tests/cinematic/terrain.mjs
node tests/cinematic/blender-assets.mjs
CINEMATIC_EVIDENCE=/absolute/evidence/path node tests/cinematic/browser.mjs
CINEMATIC_EVIDENCE=/absolute/evidence/path ./node_modules/.bin/playwright test --config tests/cinematic/playwright.config.ts --reporter=line
npm -w apps/web run typecheck
npm -w apps/web run build
```

Stop the integration's own Next.js dev process before building into `.next`.
The source prototype is retained at `/Users/bill/agriscope-cinematic`; new browser
screenshots/reports and original-file backups are under its
`evidence/integration-20261010/`. The terrain, metrics and dates are illustrative;
only the existing authenticated app handles real farm/field data.


The current refinement adds original Blender meshes and a shorter ten-shot
product story. See `blender/README.md` for editable .blend generation, standard
GLB export and renders. Runtime assets are supplied as local mesh JSON;
Blender is needed only to author/rebuild them, not to launch the website.

Login/register CTAs select the existing form with `?mode=login` or
`?mode=register`. Home retains three concise supporting sections; `/overview`
retains the original full landing. Public examples are explicitly synthetic.

For a non-system Chromium or software-WebGL validation environment, set
`CINEMATIC_CHROMIUM=/absolute/path/to/chromium` and, only for that environment,
`CINEMATIC_SOFTWARE_WEBGL=1`. Reports identify software rendering and emulation;
it is not a hardware performance measurement.
