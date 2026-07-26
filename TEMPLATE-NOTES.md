# Template extraction notes

Bootstrapped from `air-quality-react` commit
`5ebfa3b98a8adad74cad82011662a49357acac99` on 2026-07-24.

Kept as verbatim template files:

- `src/lib/useAsync.js`
- `src/lib/embedHeight.js`
- `src/viz/P5Sketch.jsx`
- `src/components/GourmetMediaContainer.jsx`
- `src/components/Layout.jsx`
- `src/components/Status.jsx`
- `src/components/LookupInput.jsx`
- `vercel.json`
- `tailwind.config.js`
- `src/index.css`

Convention slots replaced for this project:

- `src/data/waterQuality.js`
- `src/data/scenarios.js`
- `src/lib/contaminants.js`
- `src/lib/glassComposition.js`
- `src/viz/waterParticleSketch.js`
- `src/pages/WaterPage.jsx`
- `src/site.config.js`

The national map and compiled datasets are deliberately deferred to Phases 2–3
of `water-quality-plan.md`.

The current air app’s `coverage.js` imports air-specific monitor data, so it
was not copied as a false “generic” dependency. Its small geometric core should
be ported when Phase 3 supplies a water-station list.
