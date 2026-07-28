import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAsync } from "../lib/useAsync.js";
import { getByQuery, getComplianceByPwsid } from "../data/waterQuality.js";
import { COPPER, LEAD } from "../lib/contaminants.js";
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
    key: "bacteria",
    label: "Bacteria",
    glassLabel: "Sample-level bacteria results not reported here",
  },
  {
    key: "pipes",
    label: "Pipes",
    eyebrow: "Service-line inventory",
    status: "Not compiled",
    period: "No inventory date in this release",
    glassLabel: "Pipe inventory not compiled",
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
    eyebrow: "UCMR 5 record",
    status: "Bulk data pending",
    period: "UCMR 5 results require a separate per-system bulk-data compile",
    glassLabel: "PFAS bulk data not compiled",
    verdict:
      "PFAS results exist, but they are not part of this app’s current system index.",
    explanation:
      "UCMR 5 covers a fixed analyte list and a defined sampling program—not every PFAS compound and not every tap.",
    laneReadout: "No PFAS result in this release",
    laneNote:
      "The dotted lane keeps the future field visible while clearly separating it from measured data.",
    deferred: true,
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
        ? CONTAMINANT_TABS.filter((tab) =>
            tabHasData(tab, result, complianceStatus),
          )
        : CONTAMINANT_TABS,
    [result, complianceStatus],
  );
  const activeContaminant = availableTabs.some(
    (tab) => tab.key === requestedContaminant,
  )
    ? requestedContaminant
    : "lead";
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem("water-theme") === "drawn"
        ? "drawn"
        : "real";
    } catch {
      return "real";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.waterTheme = theme;
    document.body.dataset.waterTheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "drawn" ? "#f7f0ef" : "#0a1322");
    try {
      window.localStorage.setItem("water-theme", theme);
    } catch {
      // The preference is optional; private browsing can block storage.
    }
  }, [theme]);

  useEffect(() => {
    if (
      !result ||
      !requestedContaminant ||
      requestedContaminant === activeContaminant ||
      (requestedContaminant === "bacteria" &&
        !["done", "error"].includes(complianceStatus))
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
    <>
      <MobileThemeToggle value={theme} onChange={setTheme} />
      <section className="record-shell" aria-busy={state.status === "loading"}>
        <RecordToolbar
          query={query}
          theme={theme}
          onTheme={setTheme}
          onSubmit={submit}
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
            theme={theme}
            availableTabs={availableTabs}
            activeContaminant={activeContaminant}
            complianceStatus={complianceStatus}
            onContaminant={(key) => updateParams({ contaminant: key })}
            onSystem={(pwsid) => updateParams({ system: pwsid })}
          />
        )}
      </section>
    </>
  );
}

function tabHasData(tab, result, complianceStatus) {
  if (tab.key === "lead") return true;
  if (tab.key === "copper") return result.copper?.value != null;
  if (tab.key === "bacteria") {
    return complianceStatus === "done" && Boolean(result.bacteriaRecord);
  }
  if (tab.key === "pipes") return Boolean(result.pipeInventory);
  if (tab.key === "pfas") {
    return (
      result.pfas?.value != null ||
      (Array.isArray(result.pfas?.results) && result.pfas.results.length > 0)
    );
  }
  return false;
}

function MobileThemeToggle({ value, onChange }) {
  const [host, setHost] = useState(null);

  useEffect(() => {
    setHost(document.getElementById("mobile-theme-toggle-slot"));
  }, []);

  return host
    ? createPortal(
        <ThemeToggle
          value={value}
          onChange={onChange}
          className="mobile-theme-toggle"
        />,
        host,
      )
    : null;
}

function RecordToolbar({ query, theme, onTheme, onSubmit }) {
  return (
    <div className="record-toolbar">
      <p className="eyebrow">Gourmet Data · Water</p>
      <div className="record-search">
        <LookupInput
          defaultValue={query}
          onSubmit={onSubmit}
          placeholder="ZIP or city"
          buttonLabel="Search"
        />
      </div>
      <ThemeToggle
        value={theme}
        onChange={onTheme}
        className="record-theme-toggle"
      />
    </div>
  );
}

function ThemeToggle({ value, onChange, className = "" }) {
  return (
    <div
      className={`theme-toggle ${className}`.trim()}
      aria-label="Visual style"
    >
      {[
        ["real", "Real"],
        ["drawn", "Drawn"],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
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

  function ripple(strength = 12) {
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !displacementRef.current ||
      !turbulenceRef.current
    ) {
      return;
    }
    cancelAnimationFrame(frameRef.current);
    const started = performance.now();
    const duration = 940;
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
      ripple(8);
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
          ripple(18);
        }}
        onPointerMove={handlePointerMove}
        onPointerDown={(event) => {
          setRippleOrigin(event);
          ripple(21);
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
          x="-12%"
          y="-24%"
          width="124%"
          height="148%"
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
  theme,
  availableTabs,
  activeContaminant,
  complianceStatus,
  onContaminant,
  onSystem,
}) {
  const { bacteriaRecord, copper, lead, system } = result;
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
          <div className="glass-lighting">
            <span className="glass-orb" aria-hidden="true" />
            <WaterStream
              result={glassResult}
              hidden={EMPTY_HIDDEN}
              mode={theme}
              unreportedLabel={
                isMeasurement
                  ? `${measurement.definition.shortName} result not reported`
                  : activeTab.glassLabel
              }
            />
          </div>
          <div className="reading-lockup">
            {isMeasurement ? (
              <>
                <p className="eyebrow">
                  {measurement.tier === "measured"
                    ? `Reported ${measurement.definition.shortName.toLowerCase()} · 90th percentile`
                    : measurement.tier === "illustrative"
                      ? `Illustrative ${measurement.definition.shortName.toLowerCase()} value`
                      : `Federal ${measurement.definition.shortName.toLowerCase()} result`}
                </p>
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
            ) : activeTab.key === "bacteria" ? (
              <BacteriaReading
                record={bacteriaRecord}
                status={complianceStatus}
                scenario={result.scenario}
              />
            ) : (
              <>
                <p className="eyebrow">{activeTab.eyebrow}</p>
                <p className="reading unavailable-reading">
                  <strong>{activeTab.status}</strong>
                </p>
                <p className="sampling-period">{activeTab.period}</p>
                <p className="mark-note">{activeTab.explanation}</p>
              </>
            )}
          </div>
          <ShareRecord place={result.location.name} />
        </div>
      </aside>

      <section className="verdict-block">
        <h2>
          {isMeasurement
            ? verdictForMeasurement(measurement)
            : activeTab.key === "bacteria"
              ? bacteriaVerdict(
                  bacteriaRecord,
                  complianceStatus,
                  result.scenario,
                )
              : activeTab.verdict}
        </h2>
        <p>
          {isMeasurement
            ? measurement.key === "lead"
              ? `Lead’s 15 ${LEAD.unit} federal comparison is an action level—a treatment trigger—not a maximum contaminant level.`
              : `Copper’s ${COPPER.legal.toLocaleString()} ${COPPER.unit} federal comparison is an action level. This system-wide result cannot establish the copper level at every tap.`
            : activeTab.key === "bacteria"
              ? "This tab counts federal Revised Total Coliform Rule violation events. It is not a complete history of positive and negative samples, and zero violations does not mean bacteria-free water."
              : activeTab.explanation}
        </p>
      </section>

      <RecordLane
        tab={activeTab}
        measurement={measurement}
        bacteriaRecord={bacteriaRecord}
        complianceStatus={complianceStatus}
        scenario={result.scenario}
      />

      <div className="record-meta">
        <h2 className="sr-only">System facts and federal compliance record</h2>
        <Fact
          label="Serves"
          value={
            system.population
              ? system.population.toLocaleString()
              : "Not reported"
          }
        />
        <ViolationSummary result={result} complianceStatus={complianceStatus} />
        <Fact
          label="ZIP match"
          value={
            result.scenario
              ? "Scenario"
              : result.resolution.approximate
                ? "Approximate"
                : "Direct"
          }
        />
        <Fact label="Primary source" value={system.sourceType} />
      </div>

      <section className="action-rows">
        <a
          className="tap-row"
          href={LEAD.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <b>No one has measured your tap.</b>
            <small>
              This record describes a water system. Learn how household lead
              testing works.
            </small>
          </span>
          <span aria-hidden="true">↗</span>
        </a>

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

        <details>
          <summary>
            <span>Methodology &amp; what this record can’t say</span>
            <span aria-hidden="true">+</span>
          </summary>
          <div className="detail-body">
            <p>
              This is a utility-wide federal record, not a complete chemical
              profile and not a reading from your building. This release
              compiles reported lead and copper 90th percentiles. The bacteria
              tab counts federal compliance events; it does not reconstruct
              every positive and negative sample. PFAS requires a separate UCMR
              5 bulk-data compile.
            </p>
            <p>
              The glass is a visibility encoding. It does not depict literal
              contaminant particles, and a compliance result cannot establish
              the concentration at every tap.
            </p>
          </div>
        </details>

        <details>
          <summary>
            <span>How this place was matched to a system</span>
            <span aria-hidden="true">+</span>
          </summary>
          <div className="detail-body">
            <p>
              {result.resolution.label}.{" "}
              {result.resolution.approximate
                ? "This match is approximate because service areas and municipal boundaries do not align exactly."
                : "The selected system appears in EPA’s published service-area index for this lookup."}
            </p>
          </div>
        </details>

        <div className="source-line">
          <span>
            Source ·{" "}
            <a href={result.source.url} target="_blank" rel="noreferrer">
              {result.source.label}
            </a>
          </span>
          <span>Federal record · accessed 2026</span>
        </div>
      </section>
    </div>
  );
}

function BacteriaReading({ record, status, scenario }) {
  if (scenario) {
    return (
      <>
        <p className="eyebrow">Federal bacteria compliance record</p>
        <p className="reading unavailable-reading">
          <strong>Not assigned</strong>
        </p>
        <p className="sampling-period">Historical scenario</p>
        <p className="mark-note">
          Illustrative scenarios do not receive federal violation counts.
        </p>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <p className="eyebrow">Federal bacteria compliance record</p>
        <p className="reading unavailable-reading">
          <strong>Record unavailable</strong>
        </p>
        <p className="sampling-period">EPA lookup could not be completed</p>
        <p className="mark-note">
          No bacteria status is inferred while the federal table is unavailable.
        </p>
      </>
    );
  }

  if (!record) {
    return (
      <>
        <p className="eyebrow">Federal bacteria compliance record</p>
        <p className="reading unavailable-reading">
          <strong>Checking record</strong>
        </p>
        <p className="sampling-period">EPA violation table · last 10 years</p>
        <p className="mark-note">
          Looking for reported total-coliform and E. coli compliance events.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Federal bacteria compliance record</p>
      <p className="reading">
        <strong>{record.healthViolationCount}</strong>
        <span>
          health-based violation
          {record.healthViolationCount === 1 ? "" : "s"}
        </span>
      </p>
      <p className="sampling-period">Record period · {record.periodLabel}</p>
      <p className="mark-note">
        {record.monitoringViolationCount} monitoring/reporting lapse
        {record.monitoringViolationCount === 1 ? "" : "s"} in the same record.
        <br />
        Violation history is not a complete sample history.
      </p>
    </>
  );
}

function RecordLane({
  tab,
  measurement,
  bacteriaRecord,
  complianceStatus,
  scenario,
}) {
  if (tab.key === "bacteria") {
    return (
      <BacteriaLane
        record={bacteriaRecord}
        status={complianceStatus}
        scenario={scenario}
      />
    );
  }
  if (!measurement) {
    return <UnavailableLane tab={tab} />;
  }

  const definition = measurement.definition;
  const value = measurement.value == null ? null : Number(measurement.value);
  const position =
    value == null
      ? 0
      : Math.max(0, Math.min(100, (value / definition.legal) * 100));
  const over = value != null && value > definition.legal;
  const isLead = measurement.key === "lead";

  return (
    <section
      className={`lead-lane ${isLead ? "" : "copper-lane"}`}
      aria-labelledby={`${measurement.key}-lane-title`}
    >
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
      <div className={`lane-scale ${value == null ? "missing" : ""}`}>
        <span className="lane-fill" style={{ width: `${position}%` }} />
        {value != null && (
          <span
            className={`lane-dot ${over ? "over" : ""}`}
            style={{ left: `${position}%` }}
          >
            <span className="sr-only">Your reading: {numericValue(value)}</span>
          </span>
        )}
        {isLead && <span className="lane-tick health" />}
        {isLead && <span className="lane-tick who" />}
        <span className="lane-tick legal" />
      </div>
      <div className="lane-labels" aria-hidden="true">
        {isLead ? (
          <>
            <span className="health-label">
              <b>0</b>
              EPA health goal
            </span>
            <span className="who-label">
              <b>10</b>
              WHO guideline
            </span>
          </>
        ) : (
          <span className="health-label">
            <b>0</b>
            start of scale
          </span>
        )}
        <span className="legal-label">
          <b>{definition.legal.toLocaleString()}</b>
          {isLead ? "US action level" : "health goal + action level"}
        </span>
      </div>
    </section>
  );
}

function BacteriaLane({ record, status, scenario }) {
  let readout = "Checking EPA record";
  let state = "Loading";
  let note =
    "The federal table is being checked for total-coliform and E. coli compliance events.";

  if (scenario) {
    readout = "No compliance count assigned";
    state = "Scenario";
    note = "Illustrative scenarios do not receive federal violation counts.";
  } else if (status === "error") {
    readout = "Federal table unavailable";
    state = "Unavailable";
    note = "No negative or positive bacteria status is inferred from an error.";
  } else if (record) {
    readout = `${record.healthViolationCount} health-based · ${record.monitoringViolationCount} monitoring`;
    state = record.hasReportedEvents ? "Events reported" : "No events reported";
    note =
      "This is a federal violation record, not every positive and negative sample. No reported violations does not mean bacteria-free water.";
  }

  return (
    <section
      className="lead-lane availability-lane"
      aria-labelledby="bacteria-lane-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Federal record status</p>
          <h2 id="bacteria-lane-title">Bacteria</h2>
        </div>
        <p className="lane-reading">{readout}</p>
      </div>
      <div className="lane-scale missing">
        <span>{state}</span>
        <i>Last 10 years</i>
      </div>
      <p className="lane-footnote">{note}</p>
    </section>
  );
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
  let value = "—";
  let copy = "Checking EPA’s live violation table…";

  if (result.scenario) {
    copy = "Violation counts are not assigned to illustrative scenarios.";
  } else if (complianceStatus === "error") {
    copy = "The live violation table is temporarily unavailable.";
  } else if (complianceStatus === "done") {
    value = String(count ?? 0);
    copy = `Health-based violation${count === 1 ? "" : "s"} in the last 10 years. Monitoring lapses are not counted here.`;
  }

  return (
    <section className="violation-summary">
      <strong>{value}</strong>
      <div>
        <p className="eyebrow">Federal compliance record</p>
        <p>{copy}</p>
      </div>
    </section>
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

function ShareRecord({ place }) {
  const [status, setStatus] = useState("");

  async function share() {
    const payload = {
      title: `What EPA publishes for ${place}`,
      text: `See the federal drinking-water record for ${place}.`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        setStatus("Shared");
      } else {
        await navigator.clipboard.writeText(payload.url);
        setStatus("Link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("Copy the URL to share");
    }
  }

  return (
    <div className="share-row">
      <button type="button" onClick={share}>
        Share this record <span aria-hidden="true">↗</span>
      </button>
      <span role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
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

function bacteriaVerdict(record, status, scenario) {
  if (scenario) {
    return "No federal bacteria compliance count is assigned to this scenario.";
  }
  if (status === "error") {
    return "The federal bacteria compliance record is temporarily unavailable.";
  }
  if (!record) {
    return "Checking the federal bacteria compliance record.";
  }
  if (record.healthViolationCount > 0) {
    return `${record.healthViolationCount} reported health-based bacteria violation${
      record.healthViolationCount === 1 ? "" : "s"
    } in the last 10 years.`;
  }
  return "No health-based bacteria violations appear in this federal 10-year record.";
}

function numericValue(value) {
  if (value == null) return "Not reported";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: Number(value) >= 10 ? 1 : 2,
  });
}

function trimNumber(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: value < 0.1 ? 3 : 2,
  });
}
