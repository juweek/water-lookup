import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { inflateRawSync } from "node:zlib";

const UCMR5_ARCHIVE_URL =
  "https://www.epa.gov/system/files/other-files/2023-08/ucmr5-occurrence-data-by-state.zip";
const SERVICE_LINE_DASHBOARD_URL =
  "https://sdwis.epa.gov/ords/sfdw_pub/r/sfdw/sdwis_fed_reports_public/service-line-inventory";
const SERVICE_LINE_LAYER_URL =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Community_Water_Systems_June_8_2024_all_CWS/FeatureServer/477";
const WATER_ICAT_URL =
  "https://www.epa.gov/waterfinancecenter/water-infrastructure-and-capacity-assessment-tool";
const SERVICE_AREA_URL =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Water_System_Boundaries/FeatureServer/0";
const OUTPUT_DIR = new URL("../public/data/water-systems/", import.meta.url);
const UCMR5_TABLES = ["UCMR5_All_MA_WY.txt", "UCMR5_All_Tribes_AK_LA.txt"];
const PIPE_SLOT = 7;
const PFAS_SLOT = 8;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const UCMR5_SOURCE = argument("--ucmr5-archive");
const SERVICE_LINE_SOURCE = argument("--service-lines");
const SKIP_UCMR5 = process.argv.includes("--skip-ucmr5");
const SKIP_SERVICE_LINES = process.argv.includes("--skip-service-lines");

function zipEntries(archive) {
  const endOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error("Could not read the ZIP directory.");
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  const central = archive.subarray(centralOffset, centralOffset + centralSize);
  const entries = new Map();

  for (let offset = 0; offset < central.length; ) {
    if (central.readUInt32LE(offset) !== 0x02014b50) break;
    const method = central.readUInt16LE(offset + 10);
    const compressedSize = central.readUInt32LE(offset + 20);
    const nameLength = central.readUInt16LE(offset + 28);
    const extraLength = central.readUInt16LE(offset + 30);
    const commentLength = central.readUInt16LE(offset + 32);
    const localOffset = central.readUInt32LE(offset + 42);
    const name = central
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString();
    entries.set(basename(name), { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipEntry(archive, entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`${name} is missing from the UCMR 5 archive.`);
  const nameLength = archive.readUInt16LE(entry.localOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = archive.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

function parseDelimitedLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t");
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function eachDelimitedRow(buffer, delimiter, visit) {
  let headers;
  let start = 0;
  for (let index = 0; index <= buffer.length; index += 1) {
    if (index < buffer.length && buffer[index] !== 10) continue;
    const end = index > start && buffer[index - 1] === 13 ? index - 1 : index;
    const line = buffer.toString("utf8", start, end);
    start = index + 1;
    if (!line) continue;
    const values = parseDelimitedLine(line, delimiter);
    if (!headers) {
      headers = values.map((value) => value.replace(/^\uFEFF/, ""));
      continue;
    }
    visit(
      Object.fromEntries(
        headers.map((header, column) => [header, values[column] || ""]),
      ),
    );
  }
}

function isoDate(value) {
  const numeric = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) {
    return `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
  }
  const named = String(value || "")
    .toUpperCase()
    .match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
  if (!named) return null;
  const month = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ].indexOf(named[2]);
  return month < 0
    ? null
    : `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

function finiteNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function normalizedHeaders(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
      value,
    ]),
  );
}

function firstValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return "";
}

function attachServiceLineRows(rows, reportingPeriod) {
  for (const index of indexes.values()) {
    for (const profile of Object.values(index.systems)) {
      if (profile[PFAS_SLOT]) {
        profile[PIPE_SLOT] = null;
      } else {
        profile.length = Math.min(profile.length, PIPE_SLOT);
      }
    }
  }

  let matched = 0;
  let quarter = "";
  for (const rawRow of rows) {
    const row = normalizedHeaders(rawRow);
    const pwsid = row.pwsid;
    const state = stateForPwsid.get(pwsid);
    const profile = indexes.get(state)?.systems[pwsid];
    if (!profile) continue;
    quarter ||= row.submissionyearquarter;
    const reportStatus = firstValue(
      row,
      "servicelinereportstatus",
      "slrptstatus",
    );
    profile[PIPE_SLOT] = [
      row.submissionyearquarter || reportingPeriod || "",
      finiteNumber(
        firstValue(
          row,
          "galvanizedrequiringreplacementservicelines",
          "numgalvanizedrequiringreplacementsl",
        ),
      ),
      finiteNumber(firstValue(row, "leadservicelines", "numleadservicelines")),
      finiteNumber(
        firstValue(
          row,
          "leadstatusunknownservicelines",
          "numleadstatusunknownsl",
        ),
      ),
      finiteNumber(
        firstValue(row, "nonleadservicelines", "numnonleadservicelines"),
      ),
      finiteNumber(
        firstValue(
          row,
          "totalservicelinesreported",
          "totalnumservicelinesreported",
        ),
      ),
      row.anyservicelinetypereported || (reportStatus ? "Y" : ""),
      reportStatus,
      isoDate(row.latestalesamplestartdate),
    ];
    matched += 1;
  }
  return { matched, quarter };
}

async function fetchServiceLineRows() {
  const metadataResponse = await fetch(`${SERVICE_LINE_LAYER_URL}?f=json`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!metadataResponse.ok) {
    throw new Error(
      `Water ICAT service-line metadata failed (${metadataResponse.status}).`,
    );
  }
  const metadata = await metadataResponse.json();
  const dateParts = String(metadata.name || "").match(
    /(\d{4})_(\d{2})_(\d{2})/,
  );
  const reportingPeriod = dateParts
    ? `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`
    : null;
  const rows = [];
  const fields = [
    "PWSID",
    "SL_RPT_STATUS",
    "TOTAL_NUM_SERVICE_LINES_REPORTED",
    "NUM_LEAD_SERVICE_LINES",
    "NUM_GALVANIZED_REQUIRING_REPLACEMENT_SL",
    "NUM_LEAD_STATUS_UNKNOWN_SL",
    "NUM_NONLEAD_SERVICE_LINES",
  ].join(",");

  for (let offset = 0; ; offset += 2000) {
    const url = new URL(`${SERVICE_LINE_LAYER_URL}/query`);
    url.searchParams.set("where", "1=1");
    url.searchParams.set("outFields", fields);
    url.searchParams.set("orderByFields", "OBJECTID");
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "2000");
    url.searchParams.set("f", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(
        `Water ICAT service-line page failed (${response.status}).`,
      );
    }
    const payload = await response.json();
    const page = (payload.features || []).map(
      (feature) => feature.attributes || {},
    );
    rows.push(...page);
    if (!payload.exceededTransferLimit && page.length < 2000) break;
  }
  return {
    rows,
    reportingPeriod,
    sourceModified: metadata.editingInfo?.dataLastEditDate
      ? new Date(metadata.editingInfo.dataLastEditDate).toISOString()
      : null,
  };
}

const indexes = new Map();
const stateForPwsid = new Map();
for (const name of (await readdir(OUTPUT_DIR)).filter((name) =>
  /^[A-Z0-9]{2}\.json$/.test(name),
)) {
  const state = name.slice(0, 2);
  const index = JSON.parse(await readFile(new URL(name, OUTPUT_DIR), "utf8"));
  indexes.set(state, index);
  for (const pwsid of Object.keys(index.systems)) {
    stateForPwsid.set(pwsid, state);
  }
}

if (!indexes.size) {
  throw new Error(
    "No state water-system indexes were found. Run the core data refresh first.",
  );
}

const manifestUrl = new URL("manifest.json", OUTPUT_DIR);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
let ucmrSummary = manifest.phase2?.ucmr5 || null;
let serviceLineSummary = manifest.phase2?.serviceLines || {
  status: "not compiled",
  source: WATER_ICAT_URL,
};

if (!SKIP_UCMR5) {
  const response = UCMR5_SOURCE
    ? null
    : await fetch(UCMR5_ARCHIVE_URL, { signal: AbortSignal.timeout(120000) });
  if (response && !response.ok) {
    throw new Error(`UCMR 5 archive failed (${response.status}).`);
  }
  const archive = UCMR5_SOURCE
    ? await readFile(UCMR5_SOURCE)
    : Buffer.from(await response.arrayBuffer());
  const entries = zipEntries(archive);
  const byPwsid = new Map();
  let includedRows = 0;

  for (const name of UCMR5_TABLES) {
    const table = extractZipEntry(archive, entries, name);
    eachDelimitedRow(table, "\t", (row) => {
      if (!row.PWSID || row.Contaminant?.toLowerCase() === "lithium") return;
      const state = stateForPwsid.get(row.PWSID);
      if (!state) return;
      includedRows += 1;
      let record = byPwsid.get(row.PWSID);
      if (!record) {
        record = {
          startDate: null,
          endDate: null,
          samples: new Set(),
          analytes: new Set(),
          resultCount: 0,
          belowMrlCount: 0,
          detections: new Map(),
        };
        byPwsid.set(row.PWSID, record);
      }
      const date = isoDate(row.CollectionDate);
      if (date && (!record.startDate || date < record.startDate)) {
        record.startDate = date;
      }
      if (date && (!record.endDate || date > record.endDate)) {
        record.endDate = date;
      }
      if (row.SampleID) record.samples.add(row.SampleID);
      if (row.Contaminant) record.analytes.add(row.Contaminant);
      record.resultCount += 1;
      const value = finiteNumber(row.AnalyticalResultValue);
      if (row.AnalyticalResultsSign === "<" || value == null) {
        record.belowMrlCount += 1;
        return;
      }
      const current = record.detections.get(row.Contaminant);
      if (!current || value > current.value) {
        record.detections.set(row.Contaminant, {
          value,
          date,
          samplePoint: row.SamplePointName || row.SamplePointID || "",
          method: row.MethodID || "",
          count: (current?.count || 0) + 1,
        });
      } else {
        current.count += 1;
      }
    });
  }

  for (const index of indexes.values()) {
    for (const profile of Object.values(index.systems)) {
      if (profile.length > PFAS_SLOT) profile.length = PFAS_SLOT;
      while (profile.length > 7 && profile.at(-1) == null) profile.pop();
    }
  }
  for (const [pwsid, record] of byPwsid) {
    const state = stateForPwsid.get(pwsid);
    const profile = indexes.get(state)?.systems[pwsid];
    if (!profile) continue;
    const detections = [...record.detections.entries()]
      .map(([contaminant, item]) => [
        contaminant,
        item.value,
        item.date,
        item.samplePoint,
        item.method,
        item.count,
      ])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    profile[PFAS_SLOT] = [
      record.startDate,
      record.endDate,
      record.samples.size,
      record.analytes.size,
      record.resultCount,
      record.belowMrlCount,
      detections,
    ];
  }

  ucmrSummary = {
    status: "compiled",
    source: UCMR5_ARCHIVE_URL,
    sourceModified: response?.headers.get("last-modified") || null,
    compiledAt: new Date().toISOString(),
    systems: byPwsid.size,
    rows: includedRows,
  };
  console.log(
    `Compiled UCMR 5 PFAS records for ${byPwsid.size.toLocaleString()} indexed systems.`,
  );
}

if (!SKIP_SERVICE_LINES && SERVICE_LINE_SOURCE) {
  const source = await readFile(SERVICE_LINE_SOURCE);
  const firstLine = source
    .toString("utf8", 0, Math.min(source.length, 4096))
    .split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  eachDelimitedRow(source, delimiter, (rawRow) => {
    rows.push(rawRow);
  });
  const { matched, quarter } = attachServiceLineRows(rows, null);
  serviceLineSummary = {
    status: "compiled",
    source: SERVICE_LINE_DASHBOARD_URL,
    sourceFile: basename(SERVICE_LINE_SOURCE),
    quarter,
    systems: matched,
  };
  console.log(
    `Compiled service-line inventory records for ${matched.toLocaleString()} indexed systems.`,
  );
} else if (!SKIP_SERVICE_LINES) {
  const api = await fetchServiceLineRows();
  const { matched } = attachServiceLineRows(api.rows, api.reportingPeriod);
  serviceLineSummary = {
    status: "compiled",
    source: WATER_ICAT_URL,
    api: SERVICE_LINE_LAYER_URL,
    reportingPeriod: api.reportingPeriod,
    sourceModified: api.sourceModified,
    systems: matched,
  };
  console.log(
    `Compiled Water ICAT service-line records for ${matched.toLocaleString()} indexed systems.`,
  );
}

for (const [state, index] of indexes) {
  await writeFile(new URL(`${state}.json`, OUTPUT_DIR), JSON.stringify(index));
}

manifest.generatedAt = new Date().toISOString();
manifest.phase2 = {
  serviceAreas: {
    status: "runtime query with quarterly-index fallback",
    version: 3,
    source: SERVICE_AREA_URL,
  },
  serviceLines: serviceLineSummary,
  ucmr5: ucmrSummary,
};
await writeFile(manifestUrl, JSON.stringify(manifest));
