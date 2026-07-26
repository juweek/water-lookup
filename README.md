# What’s in the Glass

A single-purpose drinking-water data tool. Search a U.S. ZIP code or city to
find the largest active community water system EPA associates with that place,
then compare its latest federally reported lead 90th percentile with:

- the current federal lead action level (15 µg/L), and
- EPA’s non-enforceable health goal (MCLG) of zero.

The tool does not invent a composite water score. It distinguishes measured
federal records from historical illustrative scenarios and renders missing
values as “not reported,” never as zero.

## Run

```sh
npm install
npm run dev
npm run build
```

## Refresh the EPA water-system index

The app resolves ZIPs and cities from small state-level files generated from
EPA's quarterly ECHO SDWIS download. This keeps the primary lookup independent
of the slow Envirofacts API.

```sh
npm run data:refresh
```

The refresh script uses HTTP range requests to download only the system,
service-area, and lead tables needed by the app, then rewrites
`public/data/water-systems/`.

Try `/Detroit`, `/48226`, `/flint`, and `/distilled`.

## Data

- EPA Envirofacts SDWIS: water-system profile, violations, lead/copper
  90th-percentile result, and sampling period.
- Zippopotam.us / Open-Meteo: place resolution only.
- Historical scenarios deep-link their own sources in the result card.

EPA’s service-area reporting varies by state. A match based on a utility’s
mailing ZIP or a city is labeled approximate and should be confirmed against a
water bill.

## Scope

This repository implements the plan’s Phase 1 MVP. The compiled ZIP→PWS and
UCMR5 PFAS datasets, additional scenarios, and national monitoring map remain
phase-gated.
