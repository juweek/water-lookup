# What’s in the Glass — agent handoff

## Product promise

Search a U.S. ZIP or city and show exactly what the federal drinking-water
record publishes for the selected community water system—and the shape of what
it does not publish.

## Priorities

1. Data honesty beats visual drama.
2. Never invent a composite water-quality index.
3. Every displayed measurement carries a sampling period.
4. Lead’s legal comparison is an action level, not an MCL.
5. Missing or unreported never means zero or clean.
6. Scenario values are illustrative published figures, never live data.
7. Every selected lookup/system state stays in the URL.
8. Verify layouts and interactions in the browser at desktop and mobile widths.

## Architecture

`/:query` → `WaterPage` → `useAsync(getByQuery, key)` →
geocode → resolve systems → fetch system violations + lead results/sample dates.

The optional `?system=PWSID` parameter selects an alternate matched system.
`/flint` and `/distilled` short-circuit network access through scenarios.

The glass view renders `viz/WaterStream.jsx` → `viz/waterStreamScene.js`: a
three.js pour where fine droplets fall from a tap into a continuous BODY of
water (an animated translucent mesh — droplets are absorbed at the surface
with ripples and a brief splash, they do not pile up as particles). The CPU
physics sim is elementary but honest: gravity, continuity taper, splash, and
density-true settling (lead marks stay particulate, sink through the body,
and linger on the glass floor). The compact threshold views still use the p5
`waterParticleSketch`. Both libraries are dynamic-imported so neither ships
in the initial bundle.

## Honesty tiers

- measured: solid marks, with date
- illustrative: scenario marks, explicitly labeled
- unreported: dotted device; never an empty “clean” glass

The glass mark count is a visibility encoding, not a literal particle count.
Zero values receive no contaminant marks.

## Deferred

PFAS/UCMR5, the compiled ZIP crosswalk, bottled/private-well scenarios, and the
national map are Phases 2–3. Do not slip them into Phase 1 maintenance.
