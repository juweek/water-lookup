import { LEAD } from '../lib/contaminants.js';

const FLINT_SOURCE =
  'https://www.michigan.gov/-/media/Project/Websites/formergovernors/Folder6/FWATF_FINAL_REPORT_21March2016.pdf';

export const SCENARIOS = [
  {
    id: 'flint',
    label: 'Flint, 2015',
    description: 'Published crisis sampling',
  },
  {
    id: 'distilled',
    label: 'Distilled',
    description: 'A zero-contaminant baseline',
  },
];

const presets = {
  flint: {
    location: { name: 'Flint, Michigan — 2015 research sampling' },
    system: {
      pwsid: 'MI0002310',
      name: 'CITY OF FLINT',
      population: null,
      sourceType: 'Surface water during the crisis',
      stateCode: 'MI',
    },
    systems: [],
    resolution: {
      kind: 'scenario',
      label: 'Historical published scenario — not a live utility lookup',
      approximate: false,
    },
    violations: [],
    healthViolationCount: null,
    lead: {
      key: 'lead',
      value: 25,
      unit: LEAD.unit,
      date: '2015',
      periodLabel: '2015',
      tier: 'illustrative',
      definition: LEAD,
      note:
        'Virginia Tech research sampling of 252 homes found a 25 µg/L 90th percentile. This was not Flint’s official compliance sample.',
    },
    scenario: true,
    blurb:
      'A published snapshot from the water crisis. The official compliance sample was criticized for methods that biased results low; this scenario uses the independent 2015 research sample and labels it as such.',
    source: {
      label: 'Flint Water Advisory Task Force final report (March 2016), pp. 16–17',
      url: FLINT_SOURCE,
    },
  },
  distilled: {
    location: { name: 'Distilled-water baseline' },
    system: {
      pwsid: null,
      name: 'DISTILLED WATER',
      population: null,
      sourceType: 'Distilled',
      stateCode: null,
    },
    systems: [],
    resolution: {
      kind: 'scenario',
      label: 'Illustrative baseline — not a utility record',
      approximate: false,
    },
    violations: [],
    healthViolationCount: 0,
    lead: {
      key: 'lead',
      value: 0,
      unit: LEAD.unit,
      date: null,
      periodLabel: 'illustrative baseline',
      tier: 'illustrative',
      definition: LEAD,
      note: 'A conceptual zero used to show what zero looks like. It is not a sample.',
    },
    scenario: true,
    blurb:
      'A conceptual baseline: contaminants are set to zero. Real distilled water can pick up material from storage, containers, or plumbing.',
    source: {
      label: 'Illustrative zero-contaminant baseline',
      url: LEAD.sourceUrl,
    },
  },
};

export function getScenario(query) {
  const id = String(query || '').trim().toLowerCase();
  return presets[id] ? structuredClone(presets[id]) : null;
}
