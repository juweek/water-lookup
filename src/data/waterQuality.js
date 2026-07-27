import {
  COPPER,
  contaminantForCode,
  LEAD,
  toDisplayUnit,
} from "../lib/contaminants.js";
import { getScenario } from "./scenarios.js";

const EF_BASE = "https://data.epa.gov/efservice";
const ZIP_RE = /^\d{5}$/;
const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;
const BACTERIA_CODES = new Set(["3014", "3100"]);
const stateIndexCache = new Map();

const STATE_CODES = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
};

function pathValue(value) {
  return encodeURIComponent(String(value).trim().toUpperCase());
}

async function fetchJson(url, { label = "EPA lookup", retries = 0 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status >= 500)
        throw new Error(`${label} failed (${response.status}).`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? new Error(
              `${label} timed out. EPA’s service can be slow; please try again.`,
            )
          : error;
      if (attempt < retries)
        await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`${label} failed.`);
}

function efRows(table, filters, last = 99) {
  const path = filters
    .flatMap(([column, value]) => [column, pathValue(value)])
    .join("/");
  return `${EF_BASE}/${table}/${path}/rows/0:${last}/JSON`;
}

async function geocodeZip(zip) {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (response.ok) {
      const data = await response.json();
      const place = data?.places?.[0];
      if (place) {
        return {
          name: `${place["place name"]}, ${place["state abbreviation"]} ${zip}`,
          city: place["place name"],
          stateCode: place["state abbreviation"],
          zip,
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
        };
      }
    }
  } catch {
    // Open-Meteo below is the fallback.
  }
  throw new Error(`Couldn’t find ZIP code ${zip}.`);
}

export async function geocode(query) {
  const q = query.trim();
  if (ZIP_RE.test(q)) return geocodeZip(q);

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) throw new Error("The place lookup failed — try again.");
  const hit = (await response.json())?.results?.[0];
  if (!hit || hit.country_code !== "US") {
    throw new Error(`Couldn’t find a U.S. place called “${q}”.`);
  }
  const stateCode = STATE_CODES[hit.admin1] || null;
  if (!stateCode)
    throw new Error(`Couldn’t identify the state for “${q}”. Try “City, ST”.`);
  return {
    name: [hit.name, hit.admin1].filter(Boolean).join(", "),
    city: hit.name,
    stateCode,
    zip: null,
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

function normalizeIndexedSystem(pwsid, profile, stateCode, quarter) {
  return {
    pwsid,
    name: profile[0] || pwsid,
    population: Number(profile[1] || 0),
    sourceCode: profile[2] || null,
    sourceType: sourceName(profile[2]),
    stateCode,
    city: profile[3] || null,
    zip: profile[4] || null,
    lead: indexedMeasurement(profile[5], quarter, LEAD),
    copper: indexedMeasurement(profile[6], quarter, COPPER),
  };
}

function sourceName(code) {
  if (!code) return "Not reported";
  if (code === "GW") return "Ground water";
  if (code === "GWP") return "Purchased ground water";
  if (code === "SW") return "Surface water";
  if (code === "SWP") return "Purchased surface water";
  if (code === "GU" || code === "GUP")
    return "Ground water influenced by surface water";
  return code;
}

function isoDate(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "2023-05-31" → "May 2023" — the display convention for sampling periods.
function monthYear(iso) {
  if (!iso) return null;
  const [year, month] = iso.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : year;
}

function periodLabel(startDate, endDate) {
  const start = monthYear(startDate);
  const end = monthYear(endDate);
  if (start && end) return start === end ? end : `${start} – ${end}`;
  return end || start;
}

function indexedMeasurement(row, quarter, definition) {
  const name = definition.shortName.toLowerCase();
  if (!row) {
    return {
      key: definition.key,
      value: null,
      unit: definition.unit,
      date: null,
      periodLabel: null,
      tier: "unmeasured",
      definition,
      note: `No 90th-percentile ${name} result appears in EPA’s ${quarter} federal snapshot for this system.`,
    };
  }
  const startDate = isoDate(row[2]);
  const endDate = isoDate(row[3]);
  return {
    key: definition.key,
    value: toDisplayUnit(row[0], row[1], definition),
    unit: definition.unit,
    date: endDate,
    periodLabel: periodLabel(startDate, endDate),
    tier: "measured",
    definition,
    note: `EPA’s ${quarter} snapshot reports this system-wide 90th percentile, not the concentration at every tap.`,
  };
}

async function loadStateIndex(stateCode) {
  if (!stateIndexCache.has(stateCode)) {
    const base = import.meta.env.BASE_URL || "/";
    stateIndexCache.set(
      stateCode,
      fetch(`${base}data/water-systems/${stateCode}.json`).then((response) => {
        if (!response.ok) {
          throw new Error(`The local EPA index does not include ${stateCode}.`);
        }
        return response.json();
      }),
    );
  }
  return stateIndexCache.get(stateCode);
}

function indexedMatch(index, location) {
  const city = location.city.trim().toUpperCase();
  const candidates = [
    location.zip && {
      ids: index.zips[location.zip],
      kind: "zip-served",
      label: `EPA ${index.quarter} service-area ZIP match`,
      approximate: false,
    },
    {
      ids: index.cities[city],
      kind: "city-served",
      label: `EPA ${index.quarter} city service-area match`,
      approximate: true,
    },
    location.zip && {
      ids: index.adminZips[location.zip],
      kind: "admin-zip",
      label: `EPA ${index.quarter} utility mailing-address ZIP match`,
      approximate: true,
    },
    {
      ids: index.adminCities[city],
      kind: "admin-city",
      label: `EPA ${index.quarter} utility mailing-address city match`,
      approximate: true,
    },
  ].filter(Boolean);
  return candidates.find((candidate) => candidate.ids?.length);
}

export async function resolveSystems(location) {
  const index = await loadStateIndex(location.stateCode);
  const match = indexedMatch(index, location);
  if (match) {
    const systems = match.ids
      .map((pwsid) => {
        const profile = index.systems[pwsid];
        return profile
          ? normalizeIndexedSystem(
              pwsid,
              profile,
              location.stateCode,
              index.quarter,
            )
          : null;
      })
      .filter(Boolean);
    if (systems.length) {
      return {
        systems,
        resolution: {
          kind: match.kind,
          label: match.label,
          approximate: match.approximate,
        },
        dataQuarter: index.quarter,
      };
    }
  }

  throw new Error(
    `EPA does not publish a community-water-system match for ${location.name}. Try a nearby ZIP code or check your utility bill.`,
  );
}

function dedupeViolations(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key =
      row.violation_id || `${row.violation_code}-${row.compl_per_begin_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchViolations(pwsid) {
  const rows = await fetchJson(efRows("VIOLATION", [["PWSID", pwsid]], 499), {
    label: "Violation lookup",
  });
  const cutoff = Date.now() - TEN_YEARS_MS;
  return dedupeViolations(rows).filter((row) => {
    const date = Date.parse(row.compl_per_begin_date);
    return Number.isFinite(date) && date >= cutoff;
  });
}

function selectedPwsidFromKey(key) {
  const [query, search = ""] = String(key).split("?");
  return { query, preferred: new URLSearchParams(search).get("system") };
}

export async function getByQuery(key) {
  const { query, preferred } = selectedPwsidFromKey(key);
  const scenario = getScenario(query);
  if (scenario) return scenario;

  const location = await geocode(query);
  const { systems, resolution, dataQuarter } = await resolveSystems(location);
  const selected =
    systems.find((system) => system.pwsid === preferred) || systems[0];

  return {
    location,
    system: selected,
    systems,
    resolution,
    dataQuarter,
    violations: null,
    healthViolationCount: null,
    lead: selected.lead,
    copper: selected.copper,
    bacteriaRecord: null,
    scenario: false,
    source: {
      label: `EPA ECHO SDWIS ${dataQuarter} — ${selected.pwsid}`,
      url: "https://echo.epa.gov/tools/data-downloads",
    },
    contaminantViolations: [],
  };
}

export async function getComplianceByPwsid(pwsid) {
  const violations = await fetchViolations(pwsid);
  const healthViolations = violations.filter(
    (row) => row.is_health_based_ind === "Y",
  );
  const bacteriaViolations = violations.filter((row) =>
    BACTERIA_CODES.has(String(row.contaminant_code || "")),
  );
  const bacteriaHealthViolations = bacteriaViolations.filter(
    (row) => row.is_health_based_ind === "Y",
  );
  const bacteriaMonitoringViolations = bacteriaViolations.filter(
    (row) => row.is_health_based_ind !== "Y",
  );
  const latestBacteriaDate = bacteriaViolations
    .map((row) => isoDate(row.compl_per_begin_date))
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    pwsid,
    violations,
    healthViolationCount: healthViolations.length,
    bacteriaRecord: {
      periodLabel: "Last 10 years",
      healthViolationCount: bacteriaHealthViolations.length,
      monitoringViolationCount: bacteriaMonitoringViolations.length,
      latestDate: latestBacteriaDate,
      hasReportedEvents: bacteriaViolations.length > 0,
    },
    contaminantViolations: healthViolations
      .map((row) => ({
        row,
        definition: contaminantForCode(row.contaminant_code),
      }))
      .filter((item) => item.definition),
  };
}
