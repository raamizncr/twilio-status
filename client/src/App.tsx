import { useCallback, useEffect, useMemo, useState } from "react";
import { RawDataPanel } from "./RawDataPanel";

type Provider = "twilio" | "telnyx";
type Theme = "light" | "dark";

const THEME_KEY = "a2p-theme";

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const s = localStorage.getItem(THEME_KEY);
    if (s === "light" || s === "dark") return s;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

function badgeClass(status: string | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (
    [
      "VERIFIED",
      "APPROVED",
      "ACTIVE",
      "OPERATIONAL",
      "TWILIO-APPROVED",
      "OK",
      "TELNYX_ACCEPTED",
      "MNO_PROVISIONED",
      "MNO_ACCEPTED",
    ].includes(s)
  )
    return "ok";
  if (
    [
      "FAILED",
      "SUSPENDED",
      "TWILIO-REJECTED",
      "REGISTRATION_FAILED",
      "TCR_FAILED",
      "TELNYX_FAILED",
    ].includes(s)
  )
    return "bad";
  if (
    s.includes("PENDING") ||
    s.includes("REVIEW") ||
    s === "IN_PROGRESS" ||
    s.includes("MNO_PENDING") ||
    s === "DRAFT"
  )
    return "pending";
  return "neutral";
}

function formatFetched(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function truncateSid(sid: string, left = 10): string {
  if (sid.length <= left + 6) return sid;
  return `${sid.slice(0, left)}…${sid.slice(-4)}`;
}

function IconSun() {
  return (
    <svg
      className="theme-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg
      className="theme-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [provider, setProvider] = useState<Provider>("twilio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/visibility?provider=${provider}`);
      const j = await r.json();
      if (!r.ok) {
        setError((j as { error?: string }).error ?? r.statusText);
        setPayload(null);
        return;
      }
      setPayload(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchedAt =
    payload &&
    typeof payload === "object" &&
    payload !== null &&
    "fetchedAt" in payload
      ? formatFetched((payload as { fetchedAt: string }).fetchedAt)
      : null;

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="title-block">
          <h1>A2P visibility</h1>
          <p className="tagline">
            Track A2P end-to-end: drafts, pending reviews, brand and campaign verification, failures, and
            rejections. Read-only — refresh after changes in Twilio or Telnyx.
          </p>
        </div>
        <div className="toolbar-row">
          <div className="theme-switch" role="group" aria-label="Color theme">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
              title="Light theme"
              aria-label="Light theme"
              aria-pressed={theme === "light"}
            >
              <IconSun />
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
              title="Dark theme"
              aria-label="Dark theme"
              aria-pressed={theme === "dark"}
            >
              <IconMoon />
            </button>
          </div>
          <div className="seg" role="tablist" aria-label="Provider">
            <button
              type="button"
              className={provider === "twilio" ? "active" : ""}
              onClick={() => setProvider("twilio")}
            >
              Twilio
            </button>
            <button
              type="button"
              className={provider === "telnyx" ? "active" : ""}
              onClick={() => setProvider("telnyx")}
            >
              Telnyx
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Loading…" : "Refresh data"}
          </button>
          {fetchedAt && <span className="time-pill">Updated {fetchedAt}</span>}
          <div className="search-wrap">
            <input
              type="search"
              placeholder={provider === "twilio" ? "Filter subaccounts…" : "Filter brands / tenants…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter list"
            />
          </div>
        </div>
      </header>

      {loading && (
        <div className="loading-banner" role="status">
          Fetching from {provider === "twilio" ? "Twilio" : "Telnyx"}…
        </div>
      )}

      {error && <div className="err">{error}</div>}

      {!error && payload && provider === "twilio" && (
        <TwilioView payload={payload} search={search.trim().toLowerCase()} />
      )}
      {!error && payload && provider === "telnyx" && (
        <TelnyxView payload={payload} search={search.trim().toLowerCase()} />
      )}
    </div>
  );
}

function twilioMetrics(s: TwilioSub) {
  let brandCount = 0;
  let campaignVerified = 0;
  let campaignOther = 0;
  for (const p of s.profiles) {
    brandCount += p.brands.length;
    for (const b of p.brands) {
      for (const c of b.campaigns) {
        const st = (c.campaignStatus ?? "").toUpperCase();
        if (st === "VERIFIED") campaignVerified++;
        else if (st) campaignOther++;
      }
    }
  }
  return {
    profiles: s.profiles.length,
    brands: brandCount,
    campaignVerified,
    campaignOther,
  };
}

function twilioRejectionCount(s: TwilioSub): number {
  return s.rejectionItems?.length ?? 0;
}

function twilioPipelineCount(s: TwilioSub): number {
  return s.pipelineItems?.length ?? 0;
}

function TwilioCampaignCard({ c }: { c: TwilioCamp }) {
  const st = (c.campaignStatus ?? "").toUpperCase();
  const showErrors =
    (st === "FAILED" || st === "SUSPENDED") &&
    c.errorMessages &&
    c.errorMessages.length > 0;
  return (
    <div className="campaign-block">
      <div className="campaign-line campaign-line--hero">
        <div className="campaign-title-block">
          <strong>{c.messagingServiceName}</strong>
          <span className="meta">{truncateSid(c.messagingServiceSid, 12)}</span>
          {c.usa2pRecordSid && (
            <span className="meta" title="Usa2p compliance record SID">
              Record {truncateSid(c.usa2pRecordSid, 14)}
            </span>
          )}
        </div>
        <span className={`badge ${badgeClass(c.campaignStatus)}`}>{c.statusLabel}</span>
      </div>
      {showErrors && (
        <ul className="campaign-errors" aria-label="Campaign errors">
          {c.errorMessages!.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
      <RawDataPanel variant="twilio-usa2p" data={c.raw} />
    </div>
  );
}

function rejectionHeadline(it: TwilioRejectionItem): string {
  switch (it.scope) {
    case "profile":
      return `Customer profile · ${it.profileName ?? it.profileSid ?? "—"}`;
    case "brand":
      return `A2P brand · ${it.brandName ?? it.brandSid ?? "—"} (profile: ${it.profileName ?? "—"})`;
    case "campaign":
      return `10DLC campaign · ${it.messagingServiceName ?? it.messagingServiceSid ?? "—"} (brand: ${it.brandName ?? "—"})`;
    default:
      return "";
  }
}

function pipelineHeadline(it: TwilioPipelineItem): string {
  switch (it.scope) {
    case "profile":
      return `Customer profile · ${it.profileName ?? it.profileSid ?? "—"}`;
    case "brand":
      return `A2P brand · ${it.brandName ?? it.brandSid ?? "—"} (profile: ${it.profileName ?? "—"})`;
    case "campaign":
      return `10DLC campaign · ${it.messagingServiceName ?? it.messagingServiceSid ?? "—"} (brand: ${it.brandName ?? "—"})`;
    default:
      return "";
  }
}

function PipelineSummaryBlock({ items }: { items: TwilioPipelineItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pipeline-block" role="region" aria-label="In progress A2P registrations">
      <p className="pipeline-block-title">In progress — pending, review, or verification</p>
      <ul className="pipeline-list">
        {items.map((it, i) => (
          <li key={i} className="pipeline-item">
            <div className="pipeline-item-head">
              <span className={`pipeline-scope scope-${it.scope}`}>{it.scope}</span>
              <span className="pipeline-phase">{it.phaseLabel}</span>
              <span className={`badge ${badgeClass(it.statusCode)}`}>{it.statusLabel}</span>
            </div>
            <p className="pipeline-headline">{pipelineHeadline(it)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RejectionSummaryBlock({ items }: { items: TwilioRejectionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rejection-block" role="region" aria-label="Failed or rejected registrations">
      <p className="rejection-block-title">Failed / rejected (reasons from Twilio when available)</p>
      <ul className="rejection-list">
        {items.map((it, i) => (
          <li key={i} className="rejection-item">
            <div className="rejection-item-head">
              <span className={`rejection-scope scope-${it.scope}`}>{it.scope}</span>
              <span className={`badge ${badgeClass(it.statusCode)}`}>{it.statusLabel}</span>
            </div>
            <p className="rejection-headline">{rejectionHeadline(it)}</p>
            <ul className="rejection-reasons">
              {it.reasons.map((r, j) => (
                <li key={j}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TwilioView({ payload, search }: { payload: unknown; search: string }) {
  const p = payload as { data?: { subaccounts?: TwilioSub[] }; error?: string };
  if (p.error) return <div className="err">{p.error}</div>;
  const allSubs = p.data?.subaccounts ?? [];
  if (allSubs.length === 0) {
    return (
      <p className="empty">
        No subaccounts found. Check the parent account and API credentials.
      </p>
    );
  }

  const subs = useMemo(() => {
    const filtered = !search
      ? allSubs
      : allSubs.filter(
          (s) =>
            s.friendlyName.toLowerCase().includes(search) ||
            s.sid.toLowerCase().includes(search)
        );
    return [...filtered].sort((a, b) => {
      const ae = a.error ? 0 : 1;
      const be = b.error ? 0 : 1;
      if (ae !== be) return ae - be;
      const ar = twilioRejectionCount(a);
      const br = twilioRejectionCount(b);
      if (br !== ar) return br - ar;
      const ap = twilioPipelineCount(a);
      const bp = twilioPipelineCount(b);
      if (bp !== ap) return bp - ap;
      return a.friendlyName.localeCompare(b.friendlyName);
    });
  }, [allSubs, search]);

  const totals = useMemo(() => {
    const withErr = allSubs.filter((x) => x.error).length;
    const profs = allSubs.reduce((n, x) => n + x.profiles.length, 0);
    let rejectionRows = 0;
    let pipelineRows = 0;
    for (const x of allSubs) {
      rejectionRows += twilioRejectionCount(x);
      pipelineRows += twilioPipelineCount(x);
    }
    return { subCount: allSubs.length, withErr, profs, rejectionRows, pipelineRows };
  }, [allSubs]);

  return (
    <>
      <div className="stats-grid stats-grid-wide">
        <div className="stat-card">
          <div className="stat-value">{totals.subCount}</div>
          <div className="stat-label">Subaccounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totals.profs}</div>
          <div className="stat-label">Trust profiles (total)</div>
        </div>
        <div
          className={`stat-card ${totals.pipelineRows > 0 ? "highlight-warn" : ""}`}
        >
          <div className="stat-value">{totals.pipelineRows}</div>
          <div className="stat-label">In progress rows (Twilio)</div>
        </div>
        <div className={`stat-card ${totals.withErr > 0 ? "highlight-bad" : ""}`}>
          <div className="stat-value">{totals.withErr}</div>
          <div className="stat-label">Fetch errors</div>
        </div>
        <div
          className={`stat-card ${totals.rejectionRows > 0 ? "highlight-bad" : ""}`}
        >
          <div className="stat-value">{totals.rejectionRows}</div>
          <div className="stat-label">Failed / rejected (Twilio)</div>
        </div>
      </div>
      {search && (
        <p className="filter-hint">
          Showing {subs.length} match{subs.length === 1 ? "" : "es"}
          {subs.length === 0 ? " — try clearing search" : ""}
        </p>
      )}

      {subs.map((s) => {
        const rej = twilioRejectionCount(s);
        const pipe = twilioPipelineCount(s);
        return (
        <details
          key={s.sid}
          className={`card ${s.error ? "card-error" : ""}`}
          open={!!s.error}
        >
          <summary>
            <div className="summary-main">
              <span className="summary-title">{s.friendlyName}</span>
              <span className="summary-sub">{truncateSid(s.sid)}</span>
              <div className="kpi-row" aria-label="Summary counts">
                {(() => {
                  const m = twilioMetrics(s);
                  return (
                    <>
                      <span className="kpi">
                        Profiles <strong>{m.profiles}</strong>
                      </span>
                      <span className="kpi">
                        Brands <strong>{m.brands}</strong>
                      </span>
                      <span className="kpi">
                        Campaigns verified <strong>{m.campaignVerified}</strong>
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="summary-badges">
              <span className={`badge ${badgeClass(s.status)}`}>{s.status}</span>
              {pipe > 0 && (
                <span className="badge pending" title="Draft, pending, in review, or awaiting verification">
                  {pipe} in progress
                </span>
              )}
              {rej > 0 && (
                <span className="badge bad" title="Failed profile, brand, or campaign registrations">
                  {rej} failed
                </span>
              )}
            </div>
          </summary>
          <div className="inner">
            {s.error && <div className="err">{s.error}</div>}
            {!s.error && <PipelineSummaryBlock items={s.pipelineItems ?? []} />}
            {!s.error && <RejectionSummaryBlock items={s.rejectionItems ?? []} />}
            {!s.error && s.profiles.length === 0 && (
              <p className="empty">No Trust Hub customer profiles on this subaccount.</p>
            )}
            {s.profiles.map((pr) => (
              <details key={pr.sid} className="nested-card" open={s.profiles.length <= 2}>
                <summary>
                  <div className="summary-main">
                    <span className="summary-title">Profile · {pr.friendlyName}</span>
                    <span className="summary-sub">{truncateSid(pr.sid)}</span>
                  </div>
                  <span className={`badge ${badgeClass(pr.status)}`}>{pr.statusLabel}</span>
                </summary>
                <div className="inner">
                  <p className="muted-line">
                    {pr.email && <>{pr.email} · </>}
                    Last updated {pr.dateUpdated ?? "—"}
                  </p>
                  <RawDataPanel variant="twilio-profile" data={pr.raw} />
                  {pr.brands.length === 0 && (
                    <p className="empty">No A2P brand registrations for this profile.</p>
                  )}
                  {pr.brands.map((b) => (
                    <details key={b.sid} className="nested-card" style={{ marginTop: "0.5rem" }}>
                      <summary>
                        <div className="summary-main">
                          <span className="summary-title">Brand · {b.friendlyName}</span>
                          <span className="summary-sub">{b.overallLabel}</span>
                        </div>
                        <span>
                          <span className={`badge ${badgeClass(b.status)}`}>{b.statusLabel}</span>
                          {b.identityStatus && (
                            <span className="badge neutral" style={{ marginLeft: 6 }}>
                              {b.identityStatus}
                            </span>
                          )}
                        </span>
                      </summary>
                      <div className="inner">
                        <p className="section-label">Messaging · US A2P (10DLC campaign)</p>
                        <RawDataPanel variant="twilio-brand" data={b.raw} />
                        {b.campaigns.length === 0 && (
                          <p className="empty">No messaging service / Usa2p linked to this brand.</p>
                        )}
                        {b.campaigns.map((c, i) => (
                          <TwilioCampaignCard
                            key={`${c.messagingServiceSid}-${c.usa2pRecordSid ?? String(i)}`}
                            c={c}
                          />
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            {s.orphanCampaigns.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <p className="section-label">A2P campaigns (messaging service)</p>
                {s.orphanCampaigns.map((c, i) => (
                  <TwilioCampaignCard
                    key={`${c.messagingServiceSid}-${c.usa2pRecordSid ?? String(i)}`}
                    c={c}
                  />
                ))}
              </div>
            )}
          </div>
        </details>
        );
      })}
    </>
  );
}

function telnyxInFlightStatuses(status: string | undefined): boolean {
  return badgeClass(status) === "pending";
}

function telnyxPipelineItemsForTenant(t: TelnyxTenant): {
  kind: "brand" | "campaign";
  title: string;
  statusLabel: string;
  statusCode: string;
}[] {
  const rows: {
    kind: "brand" | "campaign";
    title: string;
    statusLabel: string;
    statusCode: string;
  }[] = [];
  for (const b of t.brands) {
    if (telnyxInFlightStatuses(b.status)) {
      rows.push({
        kind: "brand",
        title: `Brand · ${b.displayName}`,
        statusLabel: b.statusLabel,
        statusCode: b.status,
      });
    }
    for (const c of b.campaigns) {
      if (telnyxInFlightStatuses(c.status)) {
        rows.push({
          kind: "campaign",
          title: `${c.displayName ?? truncateSid(c.id, 8)} · brand ${b.displayName}`,
          statusLabel: c.statusLabel,
          statusCode: c.status,
        });
      }
    }
  }
  return rows;
}

function TelnyxPipelineBlock({ tenant }: { tenant: TelnyxTenant }) {
  const items = telnyxPipelineItemsForTenant(tenant);
  if (items.length === 0) return null;
  return (
    <div className="pipeline-block" role="region" aria-label="Telnyx registrations in progress">
      <p className="pipeline-block-title">In progress — Telnyx 10DLC</p>
      <ul className="pipeline-list">
        {items.map((it, i) => (
          <li key={i} className="pipeline-item">
            <div className="pipeline-item-head">
              <span className={`pipeline-scope scope-${it.kind}`}>{it.kind}</span>
              <span className={`badge ${badgeClass(it.statusCode)}`}>{it.statusLabel}</span>
            </div>
            <p className="pipeline-headline">{it.title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TelnyxView({ payload, search }: { payload: unknown; search: string }) {
  const p = payload as { data?: { tenants?: TelnyxTenant[] } };
  const tenantsRaw = p.data?.tenants ?? [];

  const tenants = useMemo(() => {
    const list = tenantsRaw.map((t) => {
      const brands = !search
        ? t.brands
        : t.brands.filter(
            (b) =>
              b.displayName.toLowerCase().includes(search) ||
              b.id.toLowerCase().includes(search) ||
              (b.tcrBrandId?.toLowerCase().includes(search) ?? false)
          );
      const tenantMatch =
        !search || t.label.toLowerCase().includes(search) || brands.length > 0;
      return { ...t, brands, _hidden: !tenantMatch && brands.length === 0 };
    });
    return list.filter((x) => !x._hidden);
  }, [tenantsRaw, search]);

  const txTotals = useMemo(() => {
    let brands = 0;
    let camps = 0;
    let pipelineRows = 0;
    for (const t of tenantsRaw) {
      brands += t.brands.length;
      for (const b of t.brands) camps += b.campaigns.length;
      pipelineRows += telnyxPipelineItemsForTenant(t).length;
    }
    return { tenants: tenantsRaw.length, brands, camps, pipelineRows };
  }, [tenantsRaw]);

  const filteredBrandRows = tenants.reduce((n, t) => n + t.brands.length, 0);

  return (
    <>
      <div className="stats-grid stats-grid-wide">
        <div className="stat-card">
          <div className="stat-value">{txTotals.tenants}</div>
          <div className="stat-label">API keys / tenants</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{txTotals.brands}</div>
          <div className="stat-label">10DLC brands</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{txTotals.camps}</div>
          <div className="stat-label">Campaigns (rows)</div>
        </div>
        <div
          className={`stat-card ${txTotals.pipelineRows > 0 ? "highlight-warn" : ""}`}
        >
          <div className="stat-value">{txTotals.pipelineRows}</div>
          <div className="stat-label">In progress (pending / review)</div>
        </div>
      </div>
      {search && (
        <p className="filter-hint">
          Filtered view — {filteredBrandRows} brand row{filteredBrandRows === 1 ? "" : "s"} shown
        </p>
      )}

      {tenants.map((t) => {
        const txPipe = telnyxPipelineItemsForTenant(t).length;
        return (
        <details
          key={t.label}
          className={`card ${t.error ? "card-error" : ""}`}
          open={!!t.error || tenants.length === 1}
        >
          <summary>
            <div className="summary-main">
              <span className="summary-title">Telnyx · {t.label}</span>
              <span className="summary-sub">
                {t.brands.length} brand{t.brands.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="summary-badges">
              {t.error ? (
                <span className="badge bad">Error</span>
              ) : (
                <span className="badge ok">OK</span>
              )}
              {!t.error && txPipe > 0 && (
                <span className="badge pending" title="Brand or campaign still in progress">
                  {txPipe} in progress
                </span>
              )}
            </div>
          </summary>
          <div className="inner">
            {t.error && <div className="err">{t.error}</div>}
            {!t.error && <TelnyxPipelineBlock tenant={t} />}
            {!t.error && t.brands.length === 0 && (
              <p className="empty">No 10DLC brands for this key.</p>
            )}
            {t.brands.map((b) => (
              <details key={b.id} className="nested-card" style={{ marginTop: "0.45rem" }}>
                <summary>
                  <div className="summary-main">
                    <span className="summary-title">{b.displayName}</span>
                    <span className="summary-sub">TCR {b.tcrBrandId ?? "—"}</span>
                  </div>
                  <span>
                    <span className={`badge ${badgeClass(b.status)}`}>{b.statusLabel}</span>
                    {b.identityStatus && (
                      <span className="badge neutral" style={{ marginLeft: 6 }}>
                        {b.identityLabel}
                      </span>
                    )}
                  </span>
                </summary>
                <div className="inner">
                  <RawDataPanel variant="telnyx-brand" data={b.raw} />
                  <p className="section-label">Campaigns</p>
                  {b.campaigns.length === 0 && (
                    <p className="empty">No campaigns returned for this brand.</p>
                  )}
                  {b.campaigns.map((c) => (
                    <div key={c.id} className="campaign-block">
                      <div className="campaign-line">
                        <strong>{c.displayName ?? truncateSid(c.id, 8)}</strong>
                        <span className={`badge ${badgeClass(c.status)}`}>{c.statusLabel}</span>
                        <span className="meta">TCR {c.tcrCampaignId ?? "—"}</span>
                      </div>
                      <RawDataPanel variant="telnyx-campaign" data={c.raw} />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
        );
      })}
    </>
  );
}

type TwilioRejectionItem = {
  scope: "profile" | "brand" | "campaign";
  profileSid?: string;
  profileName?: string;
  brandSid?: string;
  brandName?: string;
  messagingServiceSid?: string;
  messagingServiceName?: string;
  statusLabel: string;
  statusCode: string;
  reasons: string[];
};

type TwilioPipelinePhase =
  | "draft"
  | "pending"
  | "in_review"
  | "verification_pending"
  | "in_progress";

type TwilioPipelineItem = {
  scope: "profile" | "brand" | "campaign";
  phase: TwilioPipelinePhase;
  phaseLabel: string;
  profileSid?: string;
  profileName?: string;
  brandSid?: string;
  brandName?: string;
  messagingServiceSid?: string;
  messagingServiceName?: string;
  statusLabel: string;
  statusCode: string;
};

type TwilioSub = {
  sid: string;
  friendlyName: string;
  status: string;
  error?: string;
  rejectionItems?: TwilioRejectionItem[];
  pipelineItems?: TwilioPipelineItem[];
  profiles: TwilioPr[];
  orphanCampaigns: TwilioCamp[];
};

type TwilioPr = {
  sid: string;
  friendlyName: string;
  email?: string;
  status: string;
  statusLabel: string;
  dateUpdated?: string;
  raw: Record<string, unknown>;
  brands: TwilioBr[];
};

type TwilioBr = {
  sid: string;
  friendlyName: string;
  status: string;
  identityStatus?: string;
  statusLabel: string;
  overallLabel: string;
  raw: Record<string, unknown>;
  campaigns: TwilioCamp[];
};

type TwilioCamp = {
  messagingServiceSid: string;
  messagingServiceName: string;
  usa2pRecordSid?: string;
  campaignStatus?: string;
  statusLabel: string;
  errorMessages?: string[];
  raw: Record<string, unknown>;
};

type TelnyxTenant = {
  label: string;
  error?: string;
  brands: TelnyxBr[];
};

type TelnyxBr = {
  id: string;
  displayName: string;
  status: string;
  statusLabel: string;
  identityStatus?: string;
  identityLabel: string;
  tcrBrandId?: string;
  raw: Record<string, unknown>;
  campaigns: TelnyxCamp[];
};

type TelnyxCamp = {
  id: string;
  displayName?: string;
  status: string;
  statusLabel: string;
  tcrCampaignId?: string;
  raw: Record<string, unknown>;
};
