import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAsync } from "../lib/useAsync.js";
import { getByQuery, getComplianceByPwsid } from "../data/waterQuality.js";
import { RANDOM_CITIES } from "../data/randomCities.js";
import { COPPER } from "../lib/contaminants.js";
import { glassComposition } from "../lib/glassComposition.js";
import LookupInput from "../components/LookupInput.jsx";
import { ErrorState, Loading } from "../components/Status.jsx";
import WaterStream from "../viz/WaterStream.jsx";

const EMPTY_HIDDEN = [];
const CONTAMINANT_TABS = [
  { key: "lead", label: "Lead" },
  {
    key: "copper",
    label: "Copper",
    glassLabel: "Copper result not reported",
  },
  {
    key: "pipes",
    label: "Pipes",
    status: "Not compiled",
    period: "No inventory date in this release",
    glassLabel: "Pipe material is not a water concentration",
    verdict: "Pipe material is an inventory—not a contaminant concentration.",
    explanation:
      "Service-line inventories are filed through state programs in inconsistent formats. This Phase 1 release does not claim a value it has not compiled.",
    laneReadout: "Inventory not compiled",
    laneNote:
      "The dashed bar is an explicit data gap, not a claim that this system has no lead or unknown service lines.",
  },
  {
    key: "pfas",
    label: "PFAS",
    status: "Bulk data pending",
    period: "UCMR 5 results require a separate per-system bulk-data compile",
    glassLabel: "PFAS results are listed below the glass",
    verdict:
      "PFAS results exist, but they are not part of this app’s current system index.",
    explanation:
      "UCMR 5 covers a fixed analyte list and a defined sampling program—not every PFAS compound and not every tap.",
    laneReadout: "No PFAS result in this release",
    laneNote:
      "The dotted lane keeps the future field visible while clearly separating it from measured data.",
  },
];

export default function WaterPage() {
  const { query: rawQuery } = useParams();
  const query = rawQuery ? decodeURIComponent(rawQuery) : "";
  const [searchParams] = useSearchParams();
  const selectedSystem = searchParams.get("system");
  const requestedContaminant = searchParams.get("contaminant");
  const lookupKey = query
    ? `${query}${selectedSystem ? `?system=${encodeURIComponent(selectedSystem)}` : ""}`
    : "";
  const state = useAsync(getByQuery, lookupKey);
  const baseResult = state.status === "done" ? state.data : null;
  const complianceKey =
    baseResult && !baseResult.scenario ? baseResult.system.pwsid : "";
  const complianceState = useAsync(getComplianceByPwsid, complianceKey);
  const complianceStatus =
    complianceState.status === "done" &&
    complianceState.data?.pwsid !== complianceKey
      ? "loading"
      : complianceState.status;
  const result = useMemo(() => {
    if (
      !baseResult ||
      complianceState.status !== "done" ||
      complianceState.data?.pwsid !== baseResult.system.pwsid
    ) {
      return baseResult;
    }
    return { ...baseResult, ...complianceState.data };
  }, [baseResult, complianceState]);
  const navigate = useNavigate();
  const availableTabs = useMemo(
    () =>
      result
        ? CONTAMINANT_TABS.filter((tab) => tabHasData(tab, result))
        : CONTAMINANT_TABS,
    [result],
  );
  const activeContaminant = availableTabs.some(
    (tab) => tab.key === requestedContaminant,
  )
    ? requestedContaminant
    : "lead";

  useEffect(() => {
    if (
      !result ||
      !requestedContaminant ||
      requestedContaminant === activeContaminant
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("contaminant");
    const suffix = next.toString();
    navigate(`/${encodeURIComponent(query)}${suffix ? `?${suffix}` : ""}`, {
      replace: true,
    });
  }, [
    activeContaminant,
    complianceStatus,
    navigate,
    query,
    requestedContaminant,
    result,
    searchParams,
  ]);

  function submit(nextQuery) {
    navigate(`/${encodeURIComponent(nextQuery)}`);
  }

  function showRandomCity() {
    const choices = RANDOM_CITIES.filter(
      (city) => city.query.toLowerCase() !== query.toLowerCase(),
    );
    const city = choices[Math.floor(Math.random() * choices.length)];
    navigate(`/${encodeURIComponent(city.query)}`);
  }

  function updateParams(updates) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (
        value == null ||
        value === "" ||
        (key === "contaminant" && value === "lead")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const suffix = next.toString();
    navigate(`/${encodeURIComponent(query)}${suffix ? `?${suffix}` : ""}`);
  }

  return (
    <section className="record-shell" aria-busy={state.status === "loading"}>
      <RecordToolbar
        query={query}
        onSubmit={submit}
        onRandom={showRandomCity}
      />

      {state.status === "loading" && (
        <div className="record-status">
          <Loading
            label={`Matching ${query} to EPA’s quarterly water-system index…`}
          />
        </div>
      )}
      {state.status === "error" && (
        <div className="record-status">
          <ErrorState message={state.error} />
        </div>
      )}
      {result && (
        <Record
          result={result}
          query={query}
          availableTabs={availableTabs}
          activeContaminant={activeContaminant}
          complianceStatus={complianceStatus}
          onContaminant={(key) => updateParams({ contaminant: key })}
          onSystem={(pwsid) => updateParams({ system: pwsid })}
        />
      )}
    </section>
  );
}

function tabHasData(tab, result) {
  if (tab.key === "lead") return true;
  if (tab.key === "copper") return result.copper?.value != null;
  if (tab.key === "pipes") return Boolean(result.pipeInventory);
  if (tab.key === "pfas") return Boolean(result.pfas);
  return false;
}

function RecordToolbar({ query, onSubmit, onRandom }) {
  return (
    <div className="record-toolbar">
      <div className="record-search">
        <LookupInput
          defaultValue={query}
          onSubmit={onSubmit}
          placeholder="ZIP or city"
          buttonLabel="Search"
        />
      </div>
      <button
        type="button"
        className="random-button"
        onClick={onRandom}
        aria-label="Explore a random city"
      >
        <span>Random</span>
        <span aria-hidden="true">↝</span>
      </button>
    </div>
  );
}

function WaterTitle({ children }) {
  const reactId = useId();
  const filterId = useMemo(
    () => `water-title-${reactId.replaceAll(":", "")}`,
    [reactId],
  );
  const titleRef = useRef(null);
  const turbulenceRef = useRef(null);
  const displacementRef = useRef(null);
  const frameRef = useRef(0);
  const lastPulseRef = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  function setRippleOrigin(event) {
    const title = titleRef.current;
    if (!title) return;
    const bounds = title.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    title.style.setProperty("--water-x", `${x}px`);
    title.style.setProperty("--water-y", `${y}px`);
  }

  function ripple(strength = 14) {
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !displacementRef.current ||
      !turbulenceRef.current
    ) {
      return;
    }
    cancelAnimationFrame(frameRef.current);
    const started = performance.now();
    const duration = 1060;
    titleRef.current?.classList.add("is-rippling");

    function animate(now) {
      const progress = Math.min(1, (now - started) / duration);
      const envelope = Math.sin(progress * Math.PI) * (1 - progress * 0.2);
      const frequency = 0.012 + progress * 0.008;
      displacementRef.current?.setAttribute(
        "scale",
        (strength * envelope).toFixed(2),
      );
      turbulenceRef.current?.setAttribute(
        "baseFrequency",
        `${frequency.toFixed(4)} ${(frequency * 2.35).toFixed(4)}`,
      );
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        displacementRef.current?.setAttribute("scale", "0");
        titleRef.current?.classList.remove("is-rippling");
      }
    }

    frameRef.current = requestAnimationFrame(animate);
  }

  function handlePointerMove(event) {
    setRippleOrigin(event);
    const now = performance.now();
    if (event.pointerType === "mouse" && now - lastPulseRef.current > 520) {
      lastPulseRef.current = now;
      ripple(11);
    }
  }

  return (
    <>
      <h1
        ref={titleRef}
        className="water-title"
        onPointerEnter={(event) => {
          setRippleOrigin(event);
          lastPulseRef.current = performance.now();
          ripple(24);
        }}
        onPointerMove={handlePointerMove}
        onPointerDown={(event) => {
          setRippleOrigin(event);
          ripple(28);
        }}
      >
        <span className="water-title-ink">{children}</span>
        <span
          className="water-title-ink water-title-ripple"
          style={{ filter: `url(#${filterId})` }}
          aria-hidden="true"
        >
          {children}
        </span>
      </h1>
      <svg
        className="water-title-filter"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <filter
          id={filterId}
          x="-22%"
          y="-34%"
          width="144%"
          height="168%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            ref={turbulenceRef}
            type="fractalNoise"
            baseFrequency="0.012 0.0282"
            numOctaves="2"
            seed="17"
            result="waterNoise"
          />
          <feDisplacementMap
            ref={displacementRef}
            in="SourceGraphic"
            in2="waterNoise"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </svg>
    </>
  );
}

function Record({
  result,
  query,
  availableTabs,
  activeContaminant,
  complianceStatus,
  onContaminant,
  onSystem,
}) {
  const { copper, lead, pfas, pipeInventory, system } = result;
  const activeTab =
    availableTabs.find((tab) => tab.key === activeContaminant) ??
    availableTabs[0];
  const measurement =
    activeTab.key === "lead"
      ? lead
      : activeTab.key === "copper"
        ? copper
        : null;
  const isMeasurement = Boolean(measurement);
  const glassMeasurement = measurement || {
    key: activeTab.key,
    value: null,
    unit: "",
    periodLabel: null,
    tier: "unmeasured",
    definition: {
      key: activeTab.key,
      shortName: activeTab.label,
    },
  };
  const glassResult = { ...result, visualMeasurement: glassMeasurement };
  const visibleMark = glassComposition(glassResult, EMPTY_HIDDEN)
    .contaminants[0];
  const markCount = visibleMark?.count || 0;
  const markDose =
    markCount > 0 ? Number(glassMeasurement.value) / markCount : 0;
  const alternatives = result.systems.filter(
    (item) => item.pwsid !== system.pwsid,
  );

  return (
    <div className="record-layout">
      <section className="place-block">
        {result.scenario && <p className="eyebrow">Published scenario</p>}
        <div className="place-heading">
          <div>
            <WaterTitle>{result.location.name}</WaterTitle>
            <p>
              {system.name}
              {system.pwsid ? ` · ${system.pwsid}` : ""}
            </p>
          </div>
          {result.resolution.approximate && (
            <span className="match-badge">Approximate match</span>
          )}
        </div>
      </section>

      <nav className="contaminant-tabs" aria-label="Contaminants">
        {availableTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${activeTab.key === tab.key ? "active" : ""} ${
              tab.deferred ? "deferred" : ""
            }`}
            aria-current={activeTab.key === tab.key ? "page" : undefined}
            onClick={() => onContaminant(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <aside className="glass-column">
        <div className="glass-sticky">
          <div
            className={`glass-lighting ${
              activeTab.key === "pipes" && pipeInventory ? "pipe-lighting" : ""
            }`.trim()}
          >
            <span className="glass-orb" aria-hidden="true" />
            {activeTab.key === "pipes" && pipeInventory ? (
              <PipeNetworkIllustration inventory={pipeInventory} />
            ) : (
              <WaterStream
                result={glassResult}
                hidden={EMPTY_HIDDEN}
                unreportedLabel={
                  isMeasurement
                    ? `${measurement.definition.shortName} result not reported`
                    : activeTab.glassLabel
                }
              />
            )}
          </div>
          <div className="reading-lockup">
            {isMeasurement ? (
              <>
                <p className="reading">
                  <strong>{numericValue(measurement.value)}</strong>
                  <span>
                    {measurement.value == null ? "" : measurement.unit}
                  </span>
                </p>
                <p className="sampling-period">
                  {measurement.periodLabel
                    ? `Sampling period · ${measurement.periodLabel}`
                    : "Sampling period · not reported"}
                </p>
                {markCount > 0 && (
                  <p className="mark-note">
                    {markCount} marks · 1 mark ≈ {trimNumber(markDose)}{" "}
                    {measurement.unit}
                    <br />
                    Scaled for visibility, not a molecule count.
                  </p>
                )}
                {Number(measurement.value) === 0 &&
                  measurement.value != null && (
                    <p className="mark-note">
                      Zero receives no contaminant marks. This value is
                      illustrative, not a sample.
                    </p>
                  )}
                {measurement.value == null && (
                  <p className="mark-note">
                    The dotted device means “not reported,” not “clean.”
                  </p>
                )}
              </>
            ) : activeTab.key === "pipes" && pipeInventory ? (
              <PipeReading inventory={pipeInventory} />
            ) : activeTab.key === "pfas" && pfas ? (
              <PfasReading record={pfas} />
            ) : (
              <>
                <p className="reading unavailable-reading">
                  <strong>{activeTab.status}</strong>
                </p>
                <p className="sampling-period">{activeTab.period}</p>
                <p className="mark-note">{activeTab.explanation}</p>
              </>
            )}
          </div>
        </div>
      </aside>

      <section className="verdict-block">
        <h2>
          {isMeasurement
            ? verdictForMeasurement(measurement)
            : activeTab.key === "pipes" && pipeInventory
              ? pipeVerdict(pipeInventory)
              : activeTab.key === "pfas" && pfas
                ? pfasVerdict(pfas)
                : activeTab.verdict}
        </h2>
        {activeTab.key === "pipes" && pipeInventory ? (
          <p>
            These are system-wide material counts reported by the primacy
            agency. They do not identify the pipe serving a particular home.
            Non-lead counts may be incomplete because EPA does not require
            states to report them until November 1, 2027.
          </p>
        ) : activeTab.key === "pfas" && pfas ? (
          <p>
            UCMR 5 is a defined federal monitoring program. A result below the
            minimum reporting level is not a measured zero, and this record is
            not a reading from every tap.
          </p>
        ) : (
          (!isMeasurement || measurement.key !== "lead") && (
            <p>
              {isMeasurement
                ? `Copper’s ${COPPER.legal.toLocaleString()} ${COPPER.unit} federal comparison is an action level. This system-wide result cannot establish the copper level at every tap.`
                : activeTab.explanation}
            </p>
          )
        )}
      </section>

      <RecordLane
        tab={activeTab}
        measurement={measurement}
        pipeInventory={pipeInventory}
        pfas={pfas}
        source={result.source}
      />

      <div className="record-meta">
        <h2 className="sr-only">System facts and federal compliance record</h2>
        <ViolationSummary result={result} complianceStatus={complianceStatus} />
        <div className="record-facts">
          <Fact
            label="Serves"
            value={
              system.population
                ? system.population.toLocaleString()
                : "Not reported"
            }
          />
          <Fact label="Primary source" value={system.sourceType} />
        </div>
      </div>

      <section className="action-rows">
        <details>
          <summary>
            <span>Methodology</span>
            <span aria-hidden="true">+</span>
          </summary>
          <div className="detail-body">
            <p>
              This is a utility-wide federal record, not a complete chemical
              profile and not a reading from your building. This release
              compiles reported lead and copper 90th percentiles, UCMR 5 PFAS
              occurrence records, and EPA service-line inventory counts when
              those records can be joined to the selected PWSID. The compliance
              timeline counts reported federal health-based violation events; it
              does not reconstruct every sample or monitoring lapse.
            </p>
            <p>
              The glass is a visibility encoding. It does not depict literal
              contaminant particles, and a compliance result cannot establish
              the concentration at every tap.
            </p>
            <p>
              {result.resolution.label}.{" "}
              {result.resolution.boundary
                ? result.resolution.boundary.modeled
                  ? "The lookup point falls inside an EPA-modeled boundary, so the match remains approximate and should be confirmed against a water bill."
                  : `The lookup point falls inside a boundary supplied by ${
                      result.resolution.boundary.provider ||
                      "a state or water system"
                    }. Service areas can change, so confirm the system on a water bill.`
                : result.resolution.approximate
                  ? "This match is approximate because service areas and municipal boundaries do not align exactly."
                  : "The selected system appears in EPA’s published service-area index for this lookup."}
            </p>
          </div>
        </details>

        {alternatives.length > 0 && !result.scenario && (
          <details>
            <summary>
              <span>Other systems that may match {query}</span>
              <span aria-hidden="true">+</span>
            </summary>
            <div className="detail-body">
              <p>
                Showing the largest active community system. Service areas can
                cross ZIP and city boundaries; confirm the system name on your
                bill.
              </p>
              <div className="system-options">
                {alternatives.slice(0, 6).map((item) => (
                  <button
                    key={item.pwsid}
                    type="button"
                    onClick={() => onSystem(item.pwsid)}
                  >
                    <b>{item.name}</b>
                    <span>{item.pwsid}</span>
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

function PipeReading({ inventory }) {
  return (
    <>
      <p className="reading unavailable-reading">
        <strong>
          {inventory.total == null
            ? "Inventory reported"
            : `${inventory.total.toLocaleString()} lines`}
        </strong>
      </p>
      <p className="sampling-period">
        EPA snapshot · {formatReportingPeriod(inventory.reportingPeriod)}
      </p>
      <p className="mark-note">
        {inventory.reportStatus || "Material counts reported by the system."}
        <br />
        Colors identify reported material categories; exact counts appear in the
        Service lines section. This inventory cannot identify a specific
        address.
      </p>
    </>
  );
}

function pipeCategories(inventory) {
  return [
    { key: "lead", shortLabel: "Lead", label: "Lead", value: inventory.lead },
    {
      key: "galvanized",
      shortLabel: "Galvanized",
      label: "Galvanized · replace",
      value: inventory.galvanized,
    },
    {
      key: "unknown",
      shortLabel: "Unknown",
      label: "Unknown",
      value: inventory.unknown,
    },
    {
      key: "non-lead",
      shortLabel: "Non-lead",
      label: "Non-lead",
      value: inventory.nonLead,
    },
  ];
}

function pipePercentage(value, total) {
  if (value == null || !Number.isFinite(total) || total <= 0) {
    return "Not reported";
  }
  const percentage = (Number(value) / total) * 100;
  if (percentage > 0 && percentage < 0.1) return "<0.1%";
  return `${percentage.toFixed(1)}%`;
}

function materialSequence(inventory, length) {
  const categories = pipeCategories(inventory)
    .map((category) => ({
      ...category,
      numericValue: Number(category.value) || 0,
      allocation: Number(category.value) > 0 ? 1 : 0,
    }))
    .filter((category) => category.numericValue > 0);
  const remainingSlots = Math.max(0, length - categories.length);
  const total = categories.reduce(
    (sum, category) => sum + category.numericValue,
    0,
  );
  if (!categories.length || total === 0) {
    return Array.from({ length }, () => "unknown");
  }

  for (let slot = 0; slot < remainingSlots; slot += 1) {
    const next = categories.reduce((best, category) => {
      const categoryNeed =
        category.numericValue / total - category.allocation / length;
      const bestNeed = best.numericValue / total - best.allocation / length;
      return categoryNeed > bestNeed ? category : best;
    });
    next.allocation += 1;
  }

  return categories
    .sort(
      (a, b) => b.allocation - a.allocation || b.numericValue - a.numericValue,
    )
    .flatMap((category) =>
      Array.from({ length: category.allocation }, () => category.key),
    )
    .slice(0, length);
}

function pipeSeed(inventory) {
  const input = [
    inventory.reportingPeriod,
    inventory.lead,
    inventory.galvanized,
    inventory.unknown,
    inventory.nonLead,
    inventory.total,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pipeRandom(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pipeClamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pipeCoordinate(value) {
  return Number(value.toFixed(1));
}

function roundedPipeCell(x, y, width, height, radius) {
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${pipeCoordinate(x + radius)} ${pipeCoordinate(y)}`,
    `H ${pipeCoordinate(right - radius)}`,
    `Q ${pipeCoordinate(right)} ${pipeCoordinate(y)} ${pipeCoordinate(right)} ${pipeCoordinate(y + radius)}`,
    `V ${pipeCoordinate(bottom - radius)}`,
    `Q ${pipeCoordinate(right)} ${pipeCoordinate(bottom)} ${pipeCoordinate(right - radius)} ${pipeCoordinate(bottom)}`,
    `H ${pipeCoordinate(x + radius)}`,
    `Q ${pipeCoordinate(x)} ${pipeCoordinate(bottom)} ${pipeCoordinate(x)} ${pipeCoordinate(bottom - radius)}`,
    `V ${pipeCoordinate(y + radius)}`,
    `Q ${pipeCoordinate(x)} ${pipeCoordinate(y)} ${pipeCoordinate(x + radius)} ${pipeCoordinate(y)}`,
    "Z",
  ].join(" ");
}

function shufflePipeMaterials(materials, random) {
  const shuffled = [...materials];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function generatePipeAtlas(inventory) {
  const random = pipeRandom(pipeSeed(inventory));
  const routes = [];
  const couplings = [];
  const terminals = [];
  const cells = [];

  for (let row = 0; row < 9; row += 1) {
    let currentY = 44 + row * 64 + (random() - 0.5) * 16;
    let path = `M 24 ${pipeCoordinate(currentY)}`;
    for (let segment = 0; segment < 7; segment += 1) {
      const nextX = pipeClamp(
        94 + segment * 80 + (random() - 0.5) * 15,
        62,
        576,
      );
      const elbowX = nextX - 18 - random() * 14;
      const nextY = pipeClamp(currentY + (random() - 0.5) * 58, 28, 572);
      path += ` H ${pipeCoordinate(elbowX)} V ${pipeCoordinate(nextY)} H ${pipeCoordinate(nextX)}`;
      if ((row + segment) % 3 === 0) {
        couplings.push({
          x: pipeCoordinate((elbowX + nextX) / 2),
          y: pipeCoordinate(nextY),
          rotation: 90,
          scale: row % 2 ? 0.76 : 0.92,
        });
      }
      currentY = nextY;
    }
    path += ` H 576`;
    routes.push({
      d: path,
      width: row === 4 ? 13 : 7 + Math.round(random() * 4),
      opacity: 0.92,
      kind: "arterial",
    });
  }

  for (let column = 0; column < 8; column += 1) {
    let currentX = 45 + column * 73 + (random() - 0.5) * 16;
    let path = `M ${pipeCoordinate(currentX)} 24`;
    for (let segment = 0; segment < 7; segment += 1) {
      const nextY = pipeClamp(
        94 + segment * 80 + (random() - 0.5) * 15,
        62,
        576,
      );
      const elbowY = nextY - 18 - random() * 14;
      const nextX = pipeClamp(currentX + (random() - 0.5) * 58, 28, 572);
      path += ` V ${pipeCoordinate(elbowY)} H ${pipeCoordinate(nextX)} V ${pipeCoordinate(nextY)}`;
      if ((column + segment) % 4 === 0) {
        couplings.push({
          x: pipeCoordinate(nextX),
          y: pipeCoordinate((elbowY + nextY) / 2),
          rotation: 0,
          scale: column % 2 ? 0.72 : 0.88,
        });
      }
      currentX = nextX;
    }
    path += " V 576";
    routes.push({
      d: path,
      width: column === 3 ? 12 : 6 + Math.round(random() * 4),
      opacity: 0.88,
      kind: "arterial",
    });
  }

  const clusterCenters = [
    [88, 94],
    [222, 104],
    [362, 92],
    [510, 116],
    [142, 238],
    [298, 226],
    [462, 246],
    [82, 386],
    [220, 376],
    [376, 394],
    [522, 382],
    [154, 518],
    [330, 516],
    [492, 520],
  ];

  clusterCenters.forEach(([centerX, centerY], clusterIndex) => {
    const outerWidth = 92 + random() * 42;
    const outerHeight = 70 + random() * 38;
    const layerCount = clusterIndex % 3 === 0 ? 4 : 3;
    for (let layer = 0; layer < layerCount; layer += 1) {
      const inset = layer * (8 + random() * 3);
      const width = Math.max(36, outerWidth - inset * 2);
      const height = Math.max(30, outerHeight - inset * 2);
      const x = pipeClamp(centerX - width / 2, 26, 574 - width);
      const y = pipeClamp(centerY - height / 2, 26, 574 - height);
      const path = roundedPipeCell(
        x,
        y,
        width,
        height,
        Math.min(24, 10 + layer * 4 + random() * 5),
      );
      if (layer === 0) {
        cells.push(path);
      }
      routes.push({
        d: path,
        width: Math.max(3.5, 7.5 - layer),
        opacity: 0.72 + layer * 0.07,
        kind: "cell",
      });
    }
    couplings.push({
      x: centerX,
      y: pipeCoordinate(centerY - outerHeight / 2),
      rotation: 90,
      scale: 0.65,
    });
  });

  const neighborhoodConnections = [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 4],
    [1, 4],
    [1, 5],
    [2, 5],
    [2, 6],
    [3, 6],
    [4, 7],
    [4, 8],
    [5, 8],
    [5, 9],
    [6, 9],
    [6, 10],
    [7, 11],
    [8, 11],
    [8, 12],
    [9, 12],
    [9, 13],
    [10, 13],
    [11, 12],
    [12, 13],
  ];

  neighborhoodConnections.forEach(([startIndex, endIndex], index) => {
    const [startX, startY] = clusterCenters[startIndex];
    const [endX, endY] = clusterCenters[endIndex];
    const horizontalFirst = (index + Math.round(random())) % 2 === 0;
    const bendX = pipeCoordinate(
      startX + (endX - startX) * (0.45 + random() * 0.1),
    );
    const bendY = pipeCoordinate(
      startY + (endY - startY) * (0.45 + random() * 0.1),
    );
    routes.push({
      d: horizontalFirst
        ? `M ${startX} ${startY} H ${bendX} V ${endY} H ${endX}`
        : `M ${startX} ${startY} V ${bendY} H ${endX} V ${endY}`,
      width: 3.2 + (index % 3) * 0.7,
      opacity: 0.78,
      kind: "distribution",
    });
  });

  clusterCenters.forEach(([centerX, centerY], clusterIndex) => {
    for (let detailIndex = 0; detailIndex < 2; detailIndex += 1) {
      const horizontalFirst = (clusterIndex + detailIndex) % 2 === 0;
      const xDirection = (clusterIndex + detailIndex * 2) % 4 < 2 ? 1 : -1;
      const yDirection = (clusterIndex * 2 + detailIndex) % 4 < 2 ? 1 : -1;
      const startX = pipeClamp(centerX + (random() - 0.5) * 26, 30, 570);
      const startY = pipeClamp(centerY + (random() - 0.5) * 26, 30, 570);
      const endX = pipeClamp(
        startX + xDirection * (34 + random() * 42),
        24,
        576,
      );
      const endY = pipeClamp(
        startY + yDirection * (28 + random() * 38),
        24,
        576,
      );
      const bendX = pipeCoordinate(
        startX + (endX - startX) * (0.42 + random() * 0.16),
      );
      const bendY = pipeCoordinate(
        startY + (endY - startY) * (0.42 + random() * 0.16),
      );

      routes.push({
        d: horizontalFirst
          ? `M ${pipeCoordinate(startX)} ${pipeCoordinate(startY)} H ${bendX} V ${pipeCoordinate(endY)} H ${pipeCoordinate(endX)}`
          : `M ${pipeCoordinate(startX)} ${pipeCoordinate(startY)} V ${bendY} H ${pipeCoordinate(endX)} V ${pipeCoordinate(endY)}`,
        width: 2.4 + random() * 1.2,
        opacity: 0.66,
        kind: "detail",
      });
    }
  });

  const branchOrigins = [
    [88, 94, 24, 60],
    [222, 104, 258, 24],
    [362, 92, 414, 28],
    [510, 116, 576, 72],
    [142, 238, 26, 276],
    [298, 226, 338, 164],
    [462, 246, 574, 214],
    [82, 386, 22, 440],
    [220, 376, 274, 330],
    [376, 394, 430, 452],
    [522, 382, 576, 438],
    [154, 518, 74, 576],
    [330, 516, 292, 576],
    [492, 520, 568, 570],
  ];

  branchOrigins.forEach(([startX, startY, endX, endY], index) => {
    const horizontalFirst = index % 2 === 0;
    const middleX = pipeCoordinate(
      startX + (endX - startX) * (0.42 + random() * 0.16),
    );
    const middleY = pipeCoordinate(
      startY + (endY - startY) * (0.42 + random() * 0.16),
    );
    const path = horizontalFirst
      ? `M ${startX} ${startY} H ${middleX} V ${middleY} H ${endX} V ${endY}`
      : `M ${startX} ${startY} V ${middleY} H ${middleX} V ${endY} H ${endX}`;
    routes.push({
      d: path,
      width: 4.5 + (index % 3),
      opacity: 0.9,
      kind: "service",
    });
    terminals.push({ x: endX, y: endY, rotation: horizontalFirst ? 0 : 90 });
  });

  const materials = shufflePipeMaterials(
    materialSequence(inventory, routes.length),
    random,
  );
  routes.forEach((route, index) => {
    route.material = materials[index] || "unknown";
  });

  return {
    cells,
    routes,
    flowRoutes: routes
      .filter((route, index) => route.kind === "arterial" && index % 3 === 0)
      .slice(0, 6),
    couplings: couplings.slice(0, 32),
    terminals,
    valves: [
      { x: 102, y: 172, scale: 0.45 },
      { x: 304, y: 218, scale: 0.54 },
      { x: 160, y: 402, scale: 0.44 },
      { x: 454, y: 374, scale: 0.48 },
      { x: 512, y: 492, scale: 0.4 },
    ],
    meters: [
      { x: 92, y: 232, rotation: -12 },
      { x: 314, y: 352, rotation: 6 },
      { x: 500, y: 510, rotation: 10 },
    ],
  };
}

function PipeNetworkIllustration({ inventory }) {
  const visualRef = useRef(null);
  const [motionActive, setMotionActive] = useState(false);
  const atlas = useMemo(() => generatePipeAtlas(inventory), [inventory]);
  const categories = pipeCategories(inventory);
  const reportedTotal = categories.reduce(
    (total, category) =>
      total +
      (Number.isFinite(Number(category.value)) ? Number(category.value) : 0),
    0,
  );
  const spokenCategories = categories
    .map(
      (category) =>
        `${category.label}: ${
          category.value == null
            ? "not reported"
            : category.value.toLocaleString()
        }`,
    )
    .join(". ");

  useEffect(() => {
    const visual = visualRef.current;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );

    if (!visual || reducedMotion?.matches) {
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      setMotionActive(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setMotionActive(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    observer.observe(visual);

    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={visualRef}
      className={`pipe-system-visual${motionActive ? " is-motion-active" : ""}`}
      aria-label={`A material-colored schematic of the system-wide service-line inventory. ${spokenCategories}. Exact counts are listed in the Service lines section.`}
    >
      <svg
        className="pipe-network-svg"
        viewBox="0 0 600 600"
        role="img"
        aria-hidden="true"
      >
        <g className="pipe-atlas-cells">
          {atlas.cells.map((cell) => (
            <path key={cell} d={cell} />
          ))}
        </g>

        <g className="pipe-atlas-routes">
          {atlas.routes.map((route, index) => (
            <g
              key={`${route.d}-${index}`}
              className={`pipe-network-run pipe-network-run-${route.material} pipe-network-${route.kind}`}
              opacity={route.opacity}
            >
              <path
                className="pipe-run-shadow"
                d={route.d}
                strokeWidth={route.width + (route.kind === "detail" ? 3.2 : 6)}
              />
              <path
                className="pipe-run-body"
                d={route.d}
                strokeWidth={route.width}
              />
              <path
                className="pipe-run-highlight"
                d={route.d}
                strokeWidth={Math.max(
                  route.kind === "detail" ? 0.8 : 1.4,
                  route.width * 0.2,
                )}
              />
            </g>
          ))}
        </g>

        <g className="pipe-flow-layer">
          {atlas.flowRoutes.map((route, index) => (
            <path
              key={`flow-${route.d}-${index}`}
              className="pipe-flow-line"
              d={route.d}
              pathLength="100"
              strokeDasharray={`${[2.8, 6.4, 4.2, 8.2, 3.6, 5.4][index]} ${
                [16, 24, 19, 28, 21, 25][index]
              }`}
              style={{
                "--pipe-motion-delay": `${-index * 2.4}s`,
                "--pipe-motion-duration": `${11 + index}s`,
                "--pipe-flow-opacity": [0.56, 0.64, 0.72][index % 3],
              }}
            />
          ))}
        </g>

        <g className="pipe-fixtures">
          {atlas.couplings.map((coupling, index) => (
            <g
              key={`${coupling.x}-${coupling.y}-${index}`}
              className="pipe-coupling"
              transform={`translate(${coupling.x} ${coupling.y}) rotate(${coupling.rotation}) scale(${coupling.scale})`}
            >
              <rect
                className="pipe-coupling-shadow"
                x="-7"
                y="-17"
                width="18"
                height="38"
                rx="4"
              />
              <rect
                className="pipe-coupling-body"
                x="-9"
                y="-19"
                width="18"
                height="38"
                rx="4"
              />
              <path d="M-8 -12 H8 M-8 12 H8" />
            </g>
          ))}

          {atlas.valves.map((valve, index) => (
            <g
              key={`${valve.x}-${valve.y}`}
              className="pipe-valve"
              transform={`translate(${valve.x} ${valve.y}) scale(${valve.scale}) rotate(${index * 13 - 9})`}
            >
              <g
                className="pipe-valve-moving"
                style={{
                  "--pipe-motion-delay": `${-index * 3}s`,
                  "--pipe-motion-duration": `${12.5 + index * 1.1}s`,
                }}
              >
                <circle className="pipe-valve-wheel" r="29" />
                <path d="M0 -34 V34 M-34 0 H34 M-24 -24 L24 24 M24 -24 L-24 24" />
              </g>
              <circle className="pipe-valve-hub" r="8" />
            </g>
          ))}

          {atlas.meters.map((meter, index) => (
            <g
              key={`${meter.x}-${meter.y}`}
              className="pipe-meter"
              transform={`translate(${meter.x} ${meter.y}) rotate(${meter.rotation}) scale(.72)`}
            >
              <circle className="pipe-meter-case" r="24" />
              <circle className="pipe-meter-face" r="17" />
              <path
                className="pipe-meter-needle"
                d="M0 0 L8 -11"
                style={{
                  "--pipe-motion-delay": `${-index * 2.2}s`,
                  "--pipe-motion-duration": `${8.5 + index * 1.4}s`,
                }}
              />
              <circle r="3" />
              <path
                className="pipe-meter-ticks"
                d="M-9 -10 L-12 -14 M0 -14 V-18 M9 -10 L12 -14"
              />
            </g>
          ))}

          {atlas.terminals.map((terminal, index) => (
            <g
              key={`${terminal.x}-${terminal.y}`}
              className="pipe-terminal"
              transform={`translate(${terminal.x} ${terminal.y}) rotate(${terminal.rotation})`}
            >
              <circle className="pipe-terminal-shadow" cy="2" r="8" />
              <circle className="pipe-terminal-cap" r="7" />
              {index % 3 === 0 && (
                <circle className="pipe-terminal-bolt" r="2" />
              )}
            </g>
          ))}
        </g>
      </svg>

      <figcaption className="pipe-visual-key" aria-hidden="true">
        {categories.map((category) => (
          <span key={category.key}>
            <i className={`pipe-swatch pipe-swatch-${category.key}`} />
            {category.shortLabel} ·{" "}
            {pipePercentage(category.value, reportedTotal)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function PfasReading({ record }) {
  const detections = record.results.length;
  return (
    <>
      <p className="reading unavailable-reading">
        <strong>
          {detections
            ? `${detections} detected ${detections === 1 ? "analyte" : "analytes"}`
            : "No result ≥ MRL"}
        </strong>
      </p>
      <p className="sampling-period">
        Sampling period · {record.periodLabel || "not reported"}
      </p>
      <p className="mark-note">
        {record.sampleCount.toLocaleString()} samples ·{" "}
        {record.analyteCount.toLocaleString()} PFAS analytes
        <br />
        “Below MRL” means below EPA’s reporting threshold—not zero.
      </p>
    </>
  );
}

function RecordLane({ tab, measurement, pipeInventory, pfas, source }) {
  if (tab.key === "pipes" && pipeInventory) {
    return <PipeLane inventory={pipeInventory} />;
  }
  if (tab.key === "pfas" && pfas) {
    return <PfasLane record={pfas} />;
  }
  if (!measurement) {
    return <UnavailableLane tab={tab} />;
  }

  const definition = measurement.definition;
  const value = measurement.value == null ? null : Number(measurement.value);
  const isLead = measurement.key === "lead";
  const scaleMax = isLead ? 18 : definition.legal;
  const position =
    value == null ? 0 : Math.max(0, Math.min(100, (value / scaleMax) * 100));
  const over = value != null && value > definition.legal;
  const legalPosition = (definition.legal / scaleMax) * 100;
  const whoPosition = isLead ? (10 / scaleMax) * 100 : null;
  const markerEdge =
    position >= 88 ? "edge-right" : position <= 12 ? "edge-left" : "";
  const period = measurementYears(measurement);
  const periodPrefix =
    measurement.tier === "illustrative" ? "Published figure" : "Samples";

  return (
    <section
      className={`lead-lane ${isLead ? "" : "copper-lane"}`}
      aria-labelledby={`${measurement.key}-lane-title`}
    >
      {isLead ? (
        <h2 id={`${measurement.key}-lane-title`} className="sr-only">
          {definition.shortName}
        </h2>
      ) : (
        <div className="section-heading">
          <div>
            <h2 id={`${measurement.key}-lane-title`}>{definition.shortName}</h2>
          </div>
          <p className="lane-reading">
            {value == null
              ? "No result reported"
              : `${numericValue(value)} of ${definition.legal.toLocaleString()} ${definition.unit}`}
          </p>
        </div>
      )}
      <div className={`lane-scale ${value == null ? "missing" : ""}`}>
        <span className="lane-fill" style={{ width: `${position}%` }} />
        {value != null && isLead && (
          <span
            className={`lane-marker ${markerEdge}`.trim()}
            style={{ left: `${position}%` }}
          >
            <span className="lane-marker-copy">
              <span>
                {periodPrefix}
                {period ? ` · ${period}` : ""}
              </span>
              <strong>
                {numericValue(value)} {definition.unit}
              </strong>
            </span>
            <span className="lane-caret" aria-hidden="true" />
            <span className={`lane-dot ${over ? "over" : ""}`} />
            <span className="sr-only">
              Reported reading: {numericValue(value)} {definition.unit}
              {period ? `, ${periodPrefix.toLowerCase()} from ${period}` : ""}
            </span>
          </span>
        )}
        {value != null && !isLead && (
          <span
            className={`lane-dot ${over ? "over" : ""}`}
            style={{ left: `${position}%` }}
          >
            <span className="sr-only">
              Reported reading: {numericValue(value)}
            </span>
          </span>
        )}
        {isLead && (
          <span className="lane-tick who" style={{ left: `${whoPosition}%` }} />
        )}
        <span
          className="lane-tick legal"
          style={{ left: `${legalPosition}%` }}
        />
      </div>
      <div className="lane-labels">
        {isLead ? (
          <>
            <span className="scale-start-label" aria-hidden="true">
              <b>0</b>
            </span>
            <BenchmarkLabel
              className="who-label"
              style={{ left: `${whoPosition}%` }}
              value="10"
              label="WHO guideline"
              explanation="WHO’s 10 µg/L value is provisional: it reflects treatment performance and analytical achievability, not a threshold below which lead has no health effects."
            />
            <BenchmarkLabel
              className="legal-label"
              style={{ left: `${legalPosition}%` }}
              value={definition.legal.toLocaleString()}
              label="US action level"
              explanation="This is a system-level treatment trigger. If more than 10% of sampled taps exceed it, the rule requires additional steps. It is not a safe-at-the-tap limit."
            />
          </>
        ) : (
          <span className="scale-start-label">
            <b>0</b>
            start of scale
          </span>
        )}
        {!isLead && (
          <span className="legal-label">
            <b>{definition.legal.toLocaleString()}</b>
            health goal + action level
          </span>
        )}
      </div>
      <SectionSource href={source.url} label={source.label} />
    </section>
  );
}

function PipeLane({ inventory }) {
  const categories = pipeCategories(inventory);

  return (
    <section className="lead-lane inventory-lane" aria-labelledby="pipes-title">
      <div className="section-heading">
        <div>
          <h2 id="pipes-title">Service lines</h2>
        </div>
        <p className="lane-reading">
          {formatReportingPeriod(inventory.reportingPeriod)}
        </p>
      </div>
      <div className="inventory-grid">
        {categories.map((category) => (
          <dl key={category.key}>
            <dt>{category.label}</dt>
            <dd>
              {category.value == null
                ? "Not reported"
                : category.value.toLocaleString()}
            </dd>
          </dl>
        ))}
      </div>
      <SectionSource>
        <a href={inventory.sourceUrl} target="_blank" rel="noreferrer">
          EPA Water ICAT service-line inventory ·{" "}
          {formatReportingPeriod(inventory.reportingPeriod)}
        </a>
        <span aria-hidden="true"> · </span>
        <a
          href="https://sdwis.epa.gov/ords/sfdw_pub/r/sfdw/sdwis_fed_reports_public/service-line-inventory"
          target="_blank"
          rel="noreferrer"
        >
          reporting definitions
        </a>
      </SectionSource>
    </section>
  );
}

function PfasLane({ record }) {
  return (
    <section className="lead-lane pfas-lane" aria-labelledby="pfas-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Highest reported detection by analyte</p>
          <h2 id="pfas-title">UCMR 5 PFAS</h2>
        </div>
        <p className="lane-reading">
          {record.results.length
            ? `${record.results.length} at or above MRL`
            : "No results at or above MRL"}
        </p>
      </div>
      {record.results.length ? (
        <div className="pfas-results">
          {record.results.map((result) => (
            <dl key={result.contaminant}>
              <dt>
                {result.contaminant}
                <span>{formatSampleDate(result.collectionDate)}</span>
              </dt>
              <dd>
                {numericValue(result.value)} {result.unit}
              </dd>
            </dl>
          ))}
        </div>
      ) : (
        <div className="pfas-empty-state">
          <strong>No reported detection at or above MRL</strong>
          <span>{record.periodLabel || "Sampling dates unavailable"}</span>
        </div>
      )}
      <p className="lane-footnote">
        {record.belowMrlCount.toLocaleString()} of{" "}
        {record.resultCount.toLocaleString()} PFAS result records were reported
        below an EPA minimum reporting level. Highest detections are shown; this
        is not a composite score or a current tap reading.
      </p>
      <SectionSource
        href={record.sourceUrl}
        label={`EPA UCMR 5 occurrence data · ${
          record.periodLabel || "2023–2025"
        }`}
      />
    </section>
  );
}

function BenchmarkLabel({ className, style, value, label, explanation }) {
  const [open, setOpen] = useState(false);
  const hoverRef = useRef(false);
  const reactId = useId();
  const popoverId = `benchmark-${reactId.replaceAll(":", "")}`;

  return (
    <div className={className} style={style}>
      <b>{value}</b>
      <span className="benchmark-caption">
        {label}
        <span
          className="benchmark-help"
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            hoverRef.current = true;
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            hoverRef.current = false;
            setOpen(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setOpen(false);
            }
          }}
        >
          <button
            type="button"
            aria-label={`Explain the ${label}`}
            aria-expanded={open}
            aria-controls={popoverId}
            onClick={() => {
              if (hoverRef.current) {
                setOpen(true);
                return;
              }
              setOpen((current) => !current);
            }}
          >
            ?
          </button>
          <span
            id={popoverId}
            className="benchmark-popover"
            role="tooltip"
            aria-hidden={!open}
          >
            {explanation}
          </span>
        </span>
      </span>
    </div>
  );
}

function measurementYears(measurement) {
  const text = `${measurement.periodLabel || ""} ${measurement.date || ""}`;
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(
    (match) => match[0],
  );
  const unique = [...new Set(years)];
  if (unique.length > 1) return `${unique[0]}–${unique.at(-1)}`;
  return unique[0] || null;
}

function UnavailableLane({ tab }) {
  return (
    <section
      className="lead-lane availability-lane"
      aria-labelledby={`${tab.key}-lane-title`}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {tab.key === "pipes" ? "Inventory status" : "Federal record status"}
          </p>
          <h2 id={`${tab.key}-lane-title`}>{tab.label}</h2>
        </div>
        <p className="lane-reading">{tab.laneReadout}</p>
      </div>
      <div className="lane-scale missing">
        <span>{tab.status}</span>
        {tab.legalLabel && <i>{tab.legalLabel}</i>}
      </div>
      <p className="lane-footnote">{tab.laneNote}</p>
    </section>
  );
}

function ViolationSummary({ result, complianceStatus }) {
  const count = result.healthViolationCount;
  const showTimeline =
    !result.scenario &&
    complianceStatus === "done" &&
    Array.isArray(result.violations);
  let copy = "Checking EPA’s live violation table…";

  if (result.scenario) {
    copy = "Violation counts are not assigned to illustrative scenarios.";
  } else if (complianceStatus === "error") {
    copy = "The live violation table is temporarily unavailable.";
  } else if (complianceStatus === "done") {
    copy =
      count === 0
        ? "No health-based violation events appear in the federal record for the last 10 years. Monitoring lapses are not counted here."
        : `${count} health-based violation${count === 1 ? "" : "s"} in the last 10 years. Monitoring lapses are not counted here.`;
  }

  return (
    <section className="violation-summary">
      <p className="compliance-copy">{copy}</p>
      {showTimeline && (
        <>
          <ComplianceTimeline violations={result.violations} />
          <SectionSource
            href={sdwisSystemUrl(result.system.pwsid)}
            label={`EPA SDWIS federal record — ${result.system.pwsid}`}
          />
        </>
      )}
    </section>
  );
}

function ComplianceTimeline({ violations }) {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 10);
  const eventGroups = new Map();

  for (const row of violations) {
    if (row.is_health_based_ind !== "Y") continue;
    const timestamp = Date.parse(row.compl_per_begin_date);
    if (!Number.isFinite(timestamp)) continue;
    const year = new Date(timestamp).getFullYear();
    const group = eventGroups.get(year) || { count: 0, timestamps: [] };
    group.count += 1;
    group.timestamps.push(timestamp);
    eventGroups.set(year, group);
  }

  const range = end.getTime() - start.getTime();
  const events = [...eventGroups.entries()]
    .map(([year, group]) => {
      const timestamp =
        group.timestamps.reduce((total, item) => total + item, 0) /
        group.timestamps.length;
      return {
        year,
        count: group.count,
        position: Math.max(
          0,
          Math.min(100, ((timestamp - start.getTime()) / range) * 100),
        ),
      };
    })
    .sort((a, b) => a.position - b.position);
  const latestYear = events.at(-1)?.year ?? null;
  const [activeYear, setActiveYear] = useState(latestYear);

  useEffect(() => {
    setActiveYear(latestYear);
  }, [latestYear]);

  const activeEvent =
    events.find((event) => event.year === activeYear) || events.at(-1);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  const startLabel = `${month.format(start)} ${start.getFullYear()}`;
  const endLabel = `${month.format(end)} ${end.getFullYear()}`;
  const spokenYears = events.map(
    (event) =>
      `${event.year}: ${event.count} health-based violation${
        event.count === 1 ? "" : "s"
      }`,
  );

  return (
    <figure className="compliance-timeline">
      <figcaption className="sr-only">
        Health-based federal violation events over the last 10 years
      </figcaption>
      <div className="compliance-scale">
        {events.map((event) => {
          const active = event.year === activeEvent?.year;
          const markerEdge =
            event.position >= 88
              ? "edge-right"
              : event.position <= 12
                ? "edge-left"
                : "";
          return (
            <button
              key={event.year}
              type="button"
              className={`compliance-event ${active ? "active" : ""} ${markerEdge}`.trim()}
              style={{ left: `${event.position}%` }}
              aria-label={`${event.year}: ${event.count} health-based violation event${event.count === 1 ? "" : "s"}`}
              aria-pressed={active}
              onPointerEnter={(pointerEvent) => {
                if (
                  !pointerEvent.pointerType ||
                  pointerEvent.pointerType === "mouse"
                ) {
                  setActiveYear(event.year);
                }
              }}
              onFocus={() => setActiveYear(event.year)}
              onClick={() => setActiveYear(event.year)}
            >
              {active && (
                <>
                  <span className="compliance-marker-copy">
                    <span>Recorded · {event.year}</span>
                    <strong>
                      {event.count} health-based event
                      {event.count === 1 ? "" : "s"}
                    </strong>
                  </span>
                  <span className="compliance-caret" aria-hidden="true" />
                </>
              )}
              <span className="compliance-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="compliance-range" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <p className="sr-only">
        {spokenYears.length
          ? spokenYears.join(". ")
          : `No health-based violation events are published from ${startLabel} through ${endLabel}.`}
      </p>
    </figure>
  );
}

function Fact({ label, value }) {
  return (
    <dl className="record-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}

function SectionSource({ href, label, children }) {
  return (
    <p className="section-source">
      Source ·{" "}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        children
      )}
    </p>
  );
}

function sdwisSystemUrl(pwsid) {
  const id = encodeURIComponent(
    String(pwsid || "")
      .trim()
      .toUpperCase(),
  );
  return `https://sdwis.epa.gov/ords/sfdw_pub/f?p=SDWIS_FED_REPORTS_PUBLIC:PWS_SEARCH::::::PWSID:${id}`;
}

function verdictForMeasurement(measurement) {
  const definition = measurement.definition;
  const name = definition.shortName.toLowerCase();
  if (measurement.value == null) {
    return `No federal ${name} result is published. Missing is not clean.`;
  }
  const value = Number(measurement.value);
  if (value === 0) {
    return measurement.tier === "illustrative"
      ? "A conceptual zero—not a sample from a tap."
      : measurement.key === "lead"
        ? "At EPA’s health goal of zero."
        : "A reported zero in the system-wide federal record.";
  }
  if (value > definition.legal) {
    return measurement.key === "lead"
      ? "Above the federal action level."
      : "Above the federal copper action level.";
  }
  return measurement.key === "lead"
    ? "Under the federal action level."
    : "Under the federal copper action level.";
}

function pipeVerdict(inventory) {
  const confirmed =
    Number(inventory.lead || 0) + Number(inventory.galvanized || 0);
  if (confirmed > 0) {
    return `${confirmed.toLocaleString()} lead or galvanized service lines are reported system-wide.`;
  }
  if (Number(inventory.unknown || 0) > 0) {
    return `${inventory.unknown.toLocaleString()} service lines still have unknown lead status.`;
  }
  return "No lead, galvanized, or unknown service lines are reported in this system-wide inventory.";
}

function pfasVerdict(record) {
  const count = record.results.length;
  if (count) {
    return `${count} PFAS ${count === 1 ? "analyte has" : "analytes have"} a UCMR 5 result at or above EPA’s reporting level.`;
  }
  return "No PFAS result at or above an EPA minimum reporting level appears in this UCMR 5 record.";
}

function formatSampleDate(value) {
  if (!value) return "Date not reported";
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatReportingPeriod(value) {
  if (!value) return "date not reported";
  const quarter = String(value).match(/^(\d{4})Q([1-4])$/);
  if (quarter) return `${quarter[1]} Q${quarter[2]}`;
  return formatSampleDate(value);
}

function numericValue(value) {
  if (value == null) return "Not reported";
  const number = Number(value);
  return number.toLocaleString(undefined, {
    maximumFractionDigits:
      Math.abs(number) < 1 ? 4 : Math.abs(number) < 10 ? 2 : 1,
  });
}

function trimNumber(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: value < 0.1 ? 3 : 2,
  });
}
