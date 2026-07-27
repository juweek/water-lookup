/**
 * Convert reported water data into a deliberately small field of marks.
 * Counts are a visual encoding, not literal particle counts. There are no
 * additive floors: a measured zero produces zero contaminant marks.
 */
export function glassComposition(result, hidden = []) {
  const measurement = result?.visualMeasurement || result?.lead;
  const value = Math.max(0, Number(measurement?.value ?? 0));
  const key = measurement?.key || "lead";
  const definition = measurement?.definition;
  const visualMarkDose =
    Number(definition?.visualMarkDose) > 0
      ? Number(definition.visualMarkDose)
      : key === "lead"
        ? 0.05
        : Math.max(1, Number(definition?.legal || 100) / 180);

  const contaminants = [];
  if (value > 0 && !hidden.includes(key)) {
    contaminants.push({
      key,
      label: definition?.shortName || measurement?.key || "Contaminant",
      tier: measurement.tier || "measured",
      color: definition?.particleColor || definition?.color || "#d34f42",
      // Every contaminant declares its own visible mark dose. The UI prints
      // the recalculated dose if the safety cap is reached, so the caption and
      // visible count stay aligned.
      count: Math.min(220, Math.max(1, Math.round(value / visualMarkDose))),
      value,
    });
  }

  return {
    contaminants,
    unmeasured: measurement?.value == null,
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
