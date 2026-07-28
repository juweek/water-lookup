# What’s in the Glass

A single-purpose drinking-water data tool. Search a U.S. ZIP code or city to
find the largest active community water system EPA associates with that place,
then compare its latest federally reported lead 90th percentile with:

- the current federal lead action level (15 µg/L), and
- WHO’s provisional 10 µg/L guideline.

The tool does not invent a composite water score. It distinguishes measured
federal records from historical illustrative scenarios and renders missing
values as “not reported,” never as zero.

## Run

```sh
npm install
npm run dev
npm run build
```

## Refresh the EPA data indexes

The app resolves ZIPs and cities from small state-level files generated from
EPA's quarterly ECHO SDWIS download. It then compiles UCMR 5 PFAS occurrence
records into those same files. This keeps browser-time data transfers small.

```sh
npm run data:refresh
```

The core refresh uses HTTP range requests to download only the system,
geographic-area, and lead tables needed by the app. The Phase 2 refresh
automatically downloads EPA’s UCMR 5 by-state archive and EPA Water ICAT’s
public ArcGIS service-line layer.

EPA’s primary service-line dashboard export is session-bound. To use a newer
dashboard CSV in place of the Water ICAT snapshot, pass it as an override:

```sh
npm run data:refresh:phase2 -- --service-lines /path/to/SDWIS_service_line_inventory_2026Q2.csv
```

For a reproducible refresh using an already-downloaded UCMR archive:

```sh
npm run data:refresh:phase2 -- --ucmr5-archive /path/to/ucmr5-occurrence-data-by-state.zip
```

Try `/Detroit`, `/48226`, `/flint`, and `/distilled`.

## Data

- EPA ECHO SDWIS: water-system profile and lead/copper 90th-percentile result.
- EPA Public Water System Service Areas V3: point-in-boundary PWSID matching,
  with the quarterly city/ZIP index as a fallback.
- EPA SDWIS Federal Reporting Services: system-wide service-line inventory
  counts when a dashboard CSV has been compiled.
- EPA UCMR 5: per-system PFAS monitoring summary and highest reported detection
  for each analyte; below-MRL records are never represented as zero.
- EPA Envirofacts SDWIS: live 10-year violation history.
- Zippopotam.us / Open-Meteo: place resolution only.
- Historical scenarios deep-link their own sources in the result card.

EPA’s service-area reporting varies by state. A match based on a utility’s
mailing ZIP or a city is labeled approximate and should be confirmed against a
water bill.

## Scope

The app includes the Phase 1 record plus the Phase 2 service-area and UCMR 5
data foundation. Additional scenarios and the national monitoring map remain
phase-gated.
