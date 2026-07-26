const EPA_NPDWR =
  "https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations";
const EPA_LEAD =
  "https://www.epa.gov/ground-water-and-drinking-water/basic-information-about-lead-drinking-water";

/**
 * Static reference-line registry. Values are stored in µg/L so the comparison
 * UI never silently mixes mg/L, µg/L, and ng/L.
 *
 * `legalType` matters: lead is regulated through a treatment technique with an
 * action level, not a maximum contaminant level. Calling it an MCL would turn a
 * useful comparison into a factual error.
 */
export const CONTAMINANTS = {
  lead: {
    key: "lead",
    codes: ["PB90", "1030"],
    name: "Lead",
    shortName: "Lead",
    unit: "µg/L",
    legal: 15,
    legalType: "Federal action level",
    health: 0,
    healthType: "EPA health goal (MCLG)",
    color: "#d56f5b",
    // The interface keeps a warm comparison-line accent, while the glass uses
    // graphite-gray marks. Those marks are a visibility encoding, not a claim
    // that dissolved lead would be visible in tap water.
    particleColor: "#30343a",
    sourceUrl: EPA_LEAD,
    effectiveNote:
      "The current federal action level is 15 µg/L. EPA’s 2024 LCRI lowers the threshold to 10 µg/L for future compliance.",
  },
  arsenic: {
    key: "arsenic",
    codes: ["1005"],
    name: "Arsenic",
    shortName: "Arsenic",
    unit: "µg/L",
    legal: 10,
    legalType: "Maximum contaminant level",
    health: 0,
    healthType: "EPA health goal (MCLG)",
    color: "#ba7517",
    sourceUrl: EPA_NPDWR,
  },
  nitrate: {
    key: "nitrate",
    codes: ["1040"],
    name: "Nitrate (as nitrogen)",
    shortName: "Nitrate",
    unit: "mg/L",
    legal: 10,
    legalType: "Maximum contaminant level",
    health: 10,
    healthType: "EPA health goal (MCLG)",
    color: "#88a56a",
    sourceUrl: EPA_NPDWR,
  },
  tthm: {
    key: "tthm",
    codes: ["2456", "2950"],
    name: "Total trihalomethanes",
    shortName: "TTHM",
    unit: "µg/L",
    legal: 80,
    legalType: "Maximum contaminant level",
    health: null,
    healthType: "No group MCLG",
    color: "#71a8a5",
    sourceUrl: EPA_NPDWR,
    effectiveNote:
      "EPA regulates the group at 80 µg/L; individual trihalomethanes have separate health goals.",
  },
};

export const LEAD = CONTAMINANTS.lead;

export function contaminantForCode(code) {
  return Object.values(CONTAMINANTS).find((item) =>
    item.codes.includes(String(code)),
  );
}

export function toDisplayUnit(value, fromUnit, definition) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const unit = String(fromUnit || "").toLowerCase();
  if (definition.unit === "µg/L" && unit === "mg/l") return n * 1000;
  if (definition.unit === "µg/L" && (unit === "ng/l" || unit === "ppt"))
    return n / 1000;
  if (definition.unit === "mg/L" && (unit === "µg/l" || unit === "ug/l"))
    return n / 1000;
  return n;
}

export function formatValue(value, unit) {
  if (value == null) return "Not reported";
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : value >= 1 ? 2 : 3;
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`;
}

export { EPA_NPDWR, EPA_LEAD };
