import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { inflateRawSync } from "node:zlib";

const ARCHIVE_URL =
  "https://echo.epa.gov/files/echodownloads/SDWA_latest_downloads.zip";
const SOURCE_DIR = process.argv.includes("--source-dir")
  ? process.argv[process.argv.indexOf("--source-dir") + 1]
  : null;
const OUTPUT_DIR = new URL("../public/data/water-systems/", import.meta.url);
const TABLES = [
  "SDWA_GEOGRAPHIC_AREAS.csv",
  "SDWA_LCR_SAMPLES.csv",
  "SDWA_PUB_WATER_SYSTEMS.csv",
];

function parseCsvLine(line) {
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
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

async function eachCsvRow(file, visit) {
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  let headers;
  for await (const line of lines) {
    const values = parseCsvLine(line);
    if (!headers) {
      headers = values;
      continue;
    }
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] || ""]),
    );
    visit(row);
  }
}

async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(
      `EPA archive range ${start}-${end} failed (${response.status})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function extractTables() {
  if (SOURCE_DIR) {
    return Object.fromEntries(
      TABLES.map((name) => [name, join(SOURCE_DIR, name)]),
    );
  }

  const head = await fetch(ARCHIVE_URL, { method: "HEAD" });
  if (!head.ok) throw new Error(`EPA archive metadata failed (${head.status})`);
  const length = Number(head.headers.get("content-length"));
  const tailStart = Math.max(0, length - 131072);
  const tail = await fetchRange(ARCHIVE_URL, tailStart, length - 1);
  const endOffset = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0)
    throw new Error("Could not read the EPA archive directory");

  const centralSize = tail.readUInt32LE(endOffset + 12);
  const centralOffset = tail.readUInt32LE(endOffset + 16);
  const central = await fetchRange(
    ARCHIVE_URL,
    centralOffset,
    centralOffset + centralSize - 1,
  );
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

  const extracted = {};
  for (const table of TABLES) {
    const entry = entries.get(table);
    if (!entry) throw new Error(`${table} is missing from the EPA archive`);
    const header = await fetchRange(
      ARCHIVE_URL,
      entry.localOffset,
      entry.localOffset + 1023,
    );
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = await fetchRange(
      ARCHIVE_URL,
      dataOffset,
      dataOffset + entry.compressedSize - 1,
    );
    const data = entry.method === 8 ? inflateRawSync(compressed) : compressed;
    const file = join("/tmp", table);
    await writeFile(file, data);
    extracted[table] = file;
  }
  return extracted;
}

function addId(index, key, pwsid) {
  if (!key) return;
  const normalized = key.trim().toUpperCase();
  const ids = index[normalized] || (index[normalized] = []);
  if (!ids.includes(pwsid)) ids.push(pwsid);
}

function sortIndex(index, systems) {
  for (const ids of Object.values(index)) {
    ids.sort((a, b) => systems[b][1] - systems[a][1]);
  }
}

const files = await extractTables();
const systemsByState = new Map();
const stateForPwsid = new Map();
let quarter = "";

await eachCsvRow(files["SDWA_PUB_WATER_SYSTEMS.csv"], (row) => {
  quarter ||= row.SUBMISSIONYEARQUARTER;
  if (row.PWS_ACTIVITY_CODE !== "A" || row.PWS_TYPE_CODE !== "CWS") return;
  const state = row.STATE_CODE || row.PRIMACY_AGENCY_CODE;
  if (!/^[A-Z]{2}$/.test(state) || !row.PWSID) return;
  let payload = systemsByState.get(state);
  if (!payload) {
    payload = {
      systems: {},
      zips: {},
      cities: {},
      adminZips: {},
      adminCities: {},
    };
    systemsByState.set(state, payload);
  }
  const profile = [
    row.PWS_NAME || row.PWSID,
    Number(row.POPULATION_SERVED_COUNT || 0),
    row.PRIMARY_SOURCE_CODE || row.GW_SW_CODE || "",
    row.CITY_NAME || "",
    String(row.ZIP_CODE || "").slice(0, 5),
  ];
  const current = payload.systems[row.PWSID];
  if (!current || profile[1] > current[1]) payload.systems[row.PWSID] = profile;
  stateForPwsid.set(row.PWSID, state);
});

for (const payload of systemsByState.values()) {
  for (const [pwsid, profile] of Object.entries(payload.systems)) {
    addId(payload.adminCities, profile[3], pwsid);
    addId(payload.adminZips, profile[4], pwsid);
  }
}

await eachCsvRow(files["SDWA_GEOGRAPHIC_AREAS.csv"], (row) => {
  const state = row.STATE_SERVED || stateForPwsid.get(row.PWSID);
  const payload = systemsByState.get(state);
  if (!payload?.systems[row.PWSID]) return;
  addId(payload.zips, row.ZIP_CODE_SERVED, row.PWSID);
  addId(payload.cities, row.CITY_SERVED, row.PWSID);
});

await eachCsvRow(files["SDWA_LCR_SAMPLES.csv"], (row) => {
  const slot =
    row.CONTAMINANT_CODE === "PB90"
      ? 5
      : row.CONTAMINANT_CODE === "CU90"
        ? 6
        : null;
  if (slot == null) return;
  const state = stateForPwsid.get(row.PWSID);
  const profile = systemsByState.get(state)?.systems[row.PWSID];
  if (!profile) return;
  const endTime = Date.parse(row.SAMPLING_END_DATE);
  const currentTime = Date.parse(profile[slot]?.[3] || "");
  if (profile[slot] && (!Number.isFinite(endTime) || endTime <= currentTime))
    return;
  profile[slot] = [
    Number(row.SAMPLE_MEASURE),
    row.UNIT_OF_MEASURE,
    row.SAMPLING_START_DATE,
    row.SAMPLING_END_DATE,
    row.RESULT_SIGN_CODE,
  ];
});

await mkdir(OUTPUT_DIR, { recursive: true });
for (const file of await readdir(OUTPUT_DIR)) {
  if (file.endsWith(".json")) await rm(new URL(file, OUTPUT_DIR));
}

const manifest = {
  quarter,
  generatedAt: new Date().toISOString(),
  source: ARCHIVE_URL,
  states: [...systemsByState.keys()].sort(),
};
await writeFile(new URL("manifest.json", OUTPUT_DIR), JSON.stringify(manifest));

let systemCount = 0;
for (const [state, payload] of [...systemsByState.entries()].sort()) {
  sortIndex(payload.zips, payload.systems);
  sortIndex(payload.cities, payload.systems);
  sortIndex(payload.adminZips, payload.systems);
  sortIndex(payload.adminCities, payload.systems);
  systemCount += Object.keys(payload.systems).length;
  await writeFile(
    new URL(`${state}.json`, OUTPUT_DIR),
    JSON.stringify({ quarter, ...payload }),
  );
}

console.log(
  `Built ${systemsByState.size} state indexes for ${systemCount.toLocaleString()} active community systems (${quarter}).`,
);
