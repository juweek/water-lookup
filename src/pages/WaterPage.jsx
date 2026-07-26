import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAsync } from "../lib/useAsync.js";
import { getByQuery, getComplianceByPwsid } from "../data/waterQuality.js";
import { SCENARIOS } from "../data/scenarios.js";
import { LEAD } from "../lib/contaminants.js";
import LookupInput from "../components/LookupInput.jsx";
import { ErrorState, Loading } from "../components/Status.jsx";
import WaterStream from "../viz/WaterStream.jsx";

const EMPTY_HIDDEN = [];
const CONTAMINANT_TABS = [
  { key: "lead", label: "Lead" },
  {
    key: "copper",
    label: "Copper",
    eyebrow: "Federal copper result",
    status: "Not included",
    period: "No copper sampling period in this release",
    glassLabel: "Copper result not included",
    verdict:
      "Copper is lead’s regulatory twin—but this release does not publish a copper value.",
    explanation:
      "Copper uses a 1,300 µg/L action level. EPA’s health goal is the same number; neither is a tap-level result.",
    laneReadout: "No result in this release",
    laneNote:
      "No copper value is drawn. The dashed lane marks a field this Phase 1 snapshot does not compile.",
    legalLabel: "1,300 µg/L action level and health goal",
  },
  {
    key: "bacteria",
    label: "Bacteria",
    eyebrow: "Presence / absence record",
    status: "Not included",
    period: "No bacteria monitoring period in this release",
    glassLabel: "Bacteria record not included",
    verdict:
      "Bacteria is a yes-or-no monitoring record—not a concentration to pour into this glass.",
    explanation:
      "A future bacteria view will use reported presence, absence, and monitoring periods. Missing records are not rendered as clear water.",
    laneReadout: "Presence / absence data not compiled",
    laneNote:
      "A dotted state stands in for the unavailable monitoring strip; it does not imply a negative test.",
  },
  {
    key: "pipes",
    label: "Pipes",
    eyebrow: "Service-line inventory",
    status: "Not compiled",
    period: "No inventory date in this release",
    glassLabel: "Pipe inventory not compiled",
    verdict:
      "Pipe material is an inventory—not a contaminant concentration.",
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
    status: "Deferred",
    period: "UCMR 5 integration is planned for a later release",
    glassLabel: "PFAS data deferred",
    verdict:
      "PFAS data is deferred until the UCMR 5 record can be integrated without overstating coverage.",
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
  const activeContaminant = CONTAMINANT_TABS.some(
    (tab) => tab.key === requestedContaminant,
  )
    ? requestedContaminant
    : "lead";
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

  function submit(nextQuery) {
    navigate(`/${encodeURIComponent(nextQuery)}`);
  }

  function updateParams(updates) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "" || (key === "contaminant" && value === "lead")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const suffix = next.toString();
    navigate(`/${encodeURIComponent(query)}${suffix ? `?${suffix}` : ""}`);
  }

  if (!query) {
    return (
      <Landing
        theme={theme}
        onTheme={setTheme}
        onSubmit={submit}
        onScenario={(id) => navigate(`/${id}`)}
      />
    );
  }

  return (
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
          activeContaminant={activeContaminant}
          complianceStatus={complianceStatus}
          onContaminant={(key) => updateParams({ contaminant: key })}
          onSystem={(pwsid) => updateParams({ system: pwsid })}
        />
      )}
    </section>
  );
}

function Landing({ theme, onTheme, onSubmit, onScenario }) {
  return (
    <div className="landing">
      <div className="landing-topline">
        <span className="eyebrow">Gourmet Data · Water</span>
        <ThemeToggle value={theme} onChange={onTheme} />
      </div>
      <div className="landing-grid">
        <div className="landing-copy">
          <div className="brand-mark" aria-hidden="true" />
          <p className="eyebrow">The federal record, poured out</p>
          <h1>
            What’s actually
            <br />
            in the glass?
          </h1>
          <p className="landing-deck">
            Search a U.S. ZIP or city to see what EPA publishes for a community
            water system—and the shape of what it does not publish.
          </p>
          <LookupInput large onSubmit={onSubmit} />
          <ScenarioBar onPick={onScenario} />
        </div>
        <div className="landing-object" aria-hidden="true">
          <span className="landing-orb" />
          <span className="landing-pour" />
          <span className="landing-glass">
            <span className="landing-water" />
            <span className="landing-residue" />
          </span>
          <span className="landing-object-note">A record is not a tap test.</span>
        </div>
      </div>
      <div className="landing-principles" aria-label="How to read this tool">
        <Principle
          number="01"
          title="No water score"
          text="Measurements remain separate, with their own units and limits."
        />
        <Principle
          number="02"
          title="Dates stay attached"
          text="Every displayed measurement carries its sampling period."
        />
        <Principle
          number="03"
          title="Missing is visible"
          text="Unreported never becomes zero, safe, or clean."
        />
      </div>
    </div>
  );
}

function Principle({ number, title, text }) {
  return (
    <div className="principle">
      <span>{number}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ScenarioBar({ onPick }) {
  return (
    <div className="scenario-bar">
      <span className="eyebrow">Try a published example</span>
      {SCENARIOS.map((scenario) => (
        <button
          key={scenario.id}
          type="button"
          title={scenario.description}
          onClick={() => onPick(scenario.id)}
        >
          {scenario.label} <span aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  );
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
      <ThemeToggle value={theme} onChange={onTheme} />
    </div>
  );
}

function ThemeToggle({ value, onChange }) {
  return (
    <div className="theme-toggle" aria-label="Visual style">
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

function Record({
  result,
  query,
  activeContaminant,
  complianceStatus,
  onContaminant,
  onSystem,
}) {
  const { lead, system } = result;
  const activeTab =
    CONTAMINANT_TABS.find((tab) => tab.key === activeContaminant) ??
    CONTAMINANT_TABS[0];
  const isLead = activeTab.key === "lead";
  const glassResult = isLead
    ? result
    : { ...result, lead: { ...lead, value: null, periodLabel: null } };
  const markCount =
    lead.value == null || Number(lead.value) <= 0
      ? 0
      : Math.min(220, Math.max(1, Math.round(Number(lead.value) / 0.05)));
  const markDose =
    markCount > 0 ? Number(lead.value) / markCount : 0;
  const alternatives = result.systems.filter(
    (item) => item.pwsid !== system.pwsid,
  );

  return (
    <div className="record-layout">
      <section className="place-block">
        <p className="eyebrow">
          {result.scenario ? "Published scenario" : "Matched community water system"}
        </p>
        <div className="place-heading">
          <div>
            <h1>{result.location.name}</h1>
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
        {CONTAMINANT_TABS.map((tab) => (
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
              unreportedLabel={
                isLead ? "Lead result not reported" : activeTab.glassLabel
              }
            />
          </div>
          <div className="reading-lockup">
            {isLead ? (
              <>
                <p className="eyebrow">
                  {lead.tier === "measured"
                    ? "Reported lead · 90th percentile"
                    : lead.tier === "illustrative"
                      ? "Illustrative lead value"
                      : "Federal lead result"}
                </p>
                <p className="reading">
                  <strong>{numericValue(lead.value)}</strong>
                  <span>{lead.value == null ? "" : lead.unit}</span>
                </p>
                <p className="sampling-period">
                  {lead.periodLabel
                    ? `Sampling period · ${lead.periodLabel}`
                    : "Sampling period · not reported"}
                </p>
                {markCount > 0 && (
                  <p className="mark-note">
                    {markCount} marks · 1 mark ≈ {trimNumber(markDose)}{" "}
                    {lead.unit}
                    <br />
                    Scaled for visibility, not a molecule count.
                  </p>
                )}
                {Number(lead.value) === 0 && lead.value != null && (
                  <p className="mark-note">
                    Zero receives no contaminant marks. This value is
                    illustrative, not a sample.
                  </p>
                )}
                {lead.value == null && (
                  <p className="mark-note">
                    The dotted device means “not reported,” not “clean.”
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">{activeTab.eyebrow}</p>
                <p className="reading unavailable-reading">
                  <strong>{activeTab.status}</strong>
                </p>
                <p className="sampling-period">{activeTab.period}</p>
                <p className="mark-note">
                  {activeTab.explanation}
                </p>
              </>
            )}
          </div>
          <ShareRecord place={result.location.name} />
        </div>
      </aside>

      <section className="verdict-block">
        <p className="eyebrow">The read</p>
        <h2>{isLead ? verdictFor(lead) : activeTab.verdict}</h2>
        <p>
          {isLead
            ? `Lead’s 15 ${LEAD.unit} federal comparison is an action level—a treatment trigger—not a maximum contaminant level.`
            : activeTab.explanation}
        </p>
      </section>

      <RecordLane tab={activeTab} lead={lead} />

      <div className="record-meta">
        <ViolationSummary
          result={result}
          complianceStatus={complianceStatus}
        />

        <section className="system-facts" aria-labelledby="system-facts-title">
          <h2 id="system-facts-title" className="sr-only">
            System facts
          </h2>
          <Fact
            label="Serves"
            value={
              system.population
                ? system.population.toLocaleString()
                : "Not reported"
            }
          />
          <Fact label="Primary source" value={system.sourceType} />
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
        </section>
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
              profile and not a reading from your building. Phase 1 compiles a
              reported lead 90th percentile; the other tabs keep uncompiled
              fields visible without inventing values.
            </p>
            <p>
              The glass is a visibility encoding. It does not depict literal
              lead particles, and a compliance result cannot establish the
              concentration at every tap.
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

function RecordLane({ tab, lead }) {
  if (tab.key !== "lead") {
    return <UnavailableLane tab={tab} />;
  }

  const value = lead.value == null ? null : Number(lead.value);
  const position =
    value == null ? 0 : Math.max(0, Math.min(100, (value / LEAD.legal) * 100));
  const over = value != null && value > LEAD.legal;

  return (
    <section className="lead-lane" aria-labelledby="lead-lane-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Against whose line?</p>
          <h2 id="lead-lane-title">Lead</h2>
        </div>
        <p className="lane-reading">
          {value == null
            ? "No result reported"
            : `${numericValue(value)} of ${LEAD.legal} ${LEAD.unit}`}
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
        <span className="lane-tick health" />
        <span className="lane-tick who" />
        <span className="lane-tick legal" />
      </div>
      <div className="lane-labels" aria-hidden="true">
        <span className="health-label">
          <b>0</b>
          EPA health goal
        </span>
        <span className="who-label">
          <b>10</b>
          WHO guideline
        </span>
        <span className="legal-label">
          <b>15</b>
          US action level
        </span>
      </div>
      <p className="lane-footnote">
        Each lane is normalized to its own limit. Percent-of-limit is not a
        cross-contaminant risk score.
      </p>
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
    <dl>
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

function verdictFor(lead) {
  if (lead.value == null) {
    return "No federal lead result is published. Missing is not clean.";
  }
  const value = Number(lead.value);
  if (value === 0) {
    return lead.tier === "illustrative"
      ? "A conceptual zero—not a sample from a tap."
      : "At EPA’s health goal of zero.";
  }
  if (value > LEAD.legal) {
    return "Above the federal action level—and above the health goal.";
  }
  return "Under the federal action level. Above EPA’s health goal of zero.";
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
