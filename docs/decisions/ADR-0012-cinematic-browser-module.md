# ADR-0012: Mount the supplied cinematic scene as a local browser module

Date: 2026-10-10. Status: accepted for the owner-authorized integration prototype.

The source is an existing Vite + Three.js application. The product is Next.js with
strict TypeScript and established farm routes. Installing dependencies and
rewriting the authored scene in a new rendering framework are outside this slice.

Mount the supplied scene in a client component with a server-rendered, readable
fallback. Native ESM modules live under `public/cinematic/`; React owns the mount
boundary and the scene owns its trusted static subtree. Its sticky stage stays
inside the home-page journey section, so it cannot cover the product sections.
The original landing is preserved at `/overview`. No iframe or runtime CDN.

Vendor the supplied pinned Three.js 0.170.0 and the used addons into one local ESM
module, with its MIT license. `scripts/build-cinematic-vendor.mjs` reproduces that
artifact using an already-installed source toolchain; no install is performed.
Only the vendor is generated: camera, model and lifecycle source remain directly
editable. Next.js serves those modules without bundling them into the React
runtime. The Vite preview mounts exactly the same source/markup/styles for HMR.

Tradeoff: the vendor adds a committed generated file (~693 KiB uncompressed) and
must be regenerated explicitly on library upgrades. This avoids widening the
Next.js dependency surface and makes the existing source runnable offline. It is
not live satellite data or a declaration of production readiness. Browser module
load, WebGL creation, context loss and required asset failures retain Thai fallback
content; OS reduced-motion bypasses GPU creation. Route cleanup aborts listeners,
cancels animation, and disposes geometries, materials, textures and render targets.
