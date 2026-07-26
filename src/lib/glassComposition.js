/**
 * Convert reported water data into a deliberately small field of marks.
 * Counts are a visual encoding, not literal particle counts. There are no
 * additive floors: a measured zero produces zero contaminant marks.
 */
export function glassComposition(result, hidden = []) {
  const lead = result?.lead;
  const value = Math.max(0, Number(lead?.value ?? 0));
  const legal = lead?.definition?.legal ?? 15;

  const contaminants = [];
  if (value > 0 && !hidden.includes("lead")) {
    contaminants.push({
      key: "lead",
      label: "Lead",
      tier: lead.tier || "measured",
      color:
        lead.definition?.particleColor || lead.definition?.color || "#30343a",
      // Lead uses the approved 1 mark = 0.05 µg/L grammar until the WebGL
      // safety cap. The UI recalculates and prints the dose when the cap is hit,
      // so the visible count and caption never disagree.
      count: Math.min(220, Math.max(1, Math.round(value / 0.05))),
      value,
    });
  }

  return {
    contaminants,
    unmeasured: lead?.value == null,
  };
}

export function thresholdReading(lead, mode) {
  if (!lead || lead.value == null) {
    return {
      label: "No federal lead result reported",
      ratio: null,
      over: null,
    };
  }
  const value = Number(lead.value);
  if (mode === "health") {
    return {
      label:
        value === 0
          ? "At EPA’s health goal of zero"
          : "Above EPA’s health goal of zero",
      ratio: value === 0 ? 0 : 1,
      over: value > 0,
    };
  }
  const legal = lead.definition?.legal ?? 15;
  return {
    label:
      value > legal
        ? `${(value / legal).toFixed(1)}× the federal action level`
        : `${Math.round((value / legal) * 100)}% of the federal action level`,
    ratio: legal > 0 ? value / legal : null,
    over: value > legal,
  };
}
