import { useCallback, useEffect, useState } from "react";

type Provider = "twilio" | "telnyx";

function badgeClass(status: string | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (["VERIFIED", "APPROVED", "ACTIVE", "OPERATIONAL", "TWILIO-APPROVED"].includes(s))
    return "ok";
  if (["FAILED", "SUSPENDED", "TWILIO-REJECTED"].includes(s)) return "bad";
  if (s.includes("PENDING") || s.includes("REVIEW") || s === "IN_PROGRESS")
    return "pending";
  return "neutral";
}

export default function App() {
  const [provider, setProvider] = useState<Provider>("twilio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);

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

  return (
    <>
      <h1>A2P visibility</h1>
      <p className="sub">
        Subaccounts (Twilio) or tenants (Telnyx), Trust profiles, brands, and campaigns — read-only.
      </p>

      <div className="toolbar">
        <div className="seg" role="tablist">
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
        <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {payload &&
          typeof payload === "object" &&
          payload !== null &&
          "fetchedAt" in payload && (
            <span className="meta">Fetched {(payload as { fetchedAt: string }).fetchedAt}</span>
          )}
      </div>

      {error && <div className="err">{error}</div>}

      {!error && payload && (
        <VisibilityBody provider={provider} payload={payload} />
      )}
    </>
  );
}

function VisibilityBody({
  provider,
  payload,
}: {
  provider: Provider;
  payload: unknown;
}) {
  if (provider === "twilio") {
    const p = payload as {
      data?: { subaccounts?: TwilioSub[] };
      error?: string;
    };
    if (p.error) return <div className="err">{p.error}</div>;
    const subs = p.data?.subaccounts ?? [];
    if (subs.length === 0) {
      return (
        <p className="empty">
          No subaccounts returned. Confirm subaccounts exist on the parent account and credentials are
          correct.
        </p>
      );
    }
    return (
      <>
        {subs.map((s) => (
          <details key={s.sid} className="card" open>
            <summary>
              <span>
                {s.friendlyName}{" "}
                <span className="meta" style={{ fontWeight: 400 }}>
                  {s.sid}
                </span>
              </span>
              <span className={`badge ${badgeClass(s.status)}`}>{s.status}</span>
            </summary>
            <div className="inner">
              {s.error && <div className="err">{s.error}</div>}
              {!s.error && s.profiles.length === 0 && (
                <p className="empty">No customer profiles on this subaccount.</p>
              )}
              {s.profiles.map((pr) => (
                <details key={pr.sid} className="card" style={{ marginTop: "0.5rem" }}>
                  <summary>
                    <span>
                      Profile: {pr.friendlyName}{" "}
                      <span className="meta" style={{ fontWeight: 400 }}>
                        {pr.sid}
                      </span>
                    </span>
                    <span className={`badge ${badgeClass(pr.status)}`}>{pr.statusLabel}</span>
                  </summary>
                  <div className="inner">
                    <p style={{ margin: "0.25rem 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                      {pr.email && <>Email: {pr.email} · </>}
                      Updated {pr.dateUpdated ?? "—"}
                    </p>
                    <JsonToggle label="Profile (raw)" data={pr.raw} />
                    {pr.brands.length === 0 && (
                      <p className="empty">No brand registrations for this profile.</p>
                    )}
                    {pr.brands.map((b) => (
                      <details key={b.sid} style={{ marginTop: "0.75rem" }}>
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                          Brand {b.friendlyName}{" "}
                          <span className={`badge ${badgeClass(b.status)}`}>{b.statusLabel}</span>
                          {b.identityStatus && (
                            <span className={`badge neutral`} style={{ marginLeft: 6 }}>
                              {b.identityStatus}
                            </span>
                          )}
                        </summary>
                        <div style={{ paddingLeft: "0.5rem", marginTop: "0.5rem" }}>
                          <p className="meta">{b.overallLabel}</p>
                          <JsonToggle label="Brand (raw)" data={b.raw} />
                          <h3>Campaigns (Messaging · Usa2p)</h3>
                          {b.campaigns.length === 0 && (
                            <p className="empty">No linked messaging service / Usa2p for this brand.</p>
                          )}
                          {b.campaigns.map((c) => (
                            <div key={c.messagingServiceSid} style={{ marginBottom: "0.75rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <strong>{c.messagingServiceName}</strong>
                                <span className="meta">{c.messagingServiceSid}</span>
                                <span className={`badge ${badgeClass(c.campaignStatus)}`}>
                                  {c.statusLabel}
                                </span>
                              </div>
                              <JsonToggle label="Usa2p (submitted / status)" data={c.raw} />
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
              {s.orphanCampaigns.length > 0 && (
                <>
                  <h3>Orphan campaigns</h3>
                  <p className="empty" style={{ marginBottom: "0.75rem" }}>
                    Usa2p records whose brand could not be matched to a profile brand row.
                  </p>
                  {s.orphanCampaigns.map((c) => (
                    <div key={c.messagingServiceSid} style={{ marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>{c.messagingServiceName}</strong>
                        <span className={`badge ${badgeClass(c.campaignStatus)}`}>
                          {c.statusLabel}
                        </span>
                      </div>
                      <JsonToggle label="Usa2p" data={c.raw} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </details>
        ))}
      </>
    );
  }

  const p = payload as {
    data?: { tenants?: TelnyxTenant[] };
  };
  const tenants = p.data?.tenants ?? [];
  return (
    <>
      {tenants.map((t) => (
        <details key={t.label} className="card" open>
          <summary>
            <span>Telnyx · {t.label}</span>
            {t.error && <span className="badge bad">Error</span>}
          </summary>
          <div className="inner">
            {t.error && <div className="err">{t.error}</div>}
            {!t.error && t.brands.length === 0 && (
              <p className="empty">No 10DLC brands returned for this key.</p>
            )}
            {t.brands.map((b) => (
              <details key={b.id} className="card" style={{ marginTop: "0.5rem" }}>
                <summary>
                  <span>{b.displayName}</span>
                  <span>
                    <span className={`badge ${badgeClass(b.status)}`}>{b.statusLabel}</span>
                    {b.identityStatus && (
                      <span className={`badge neutral`} style={{ marginLeft: 6 }}>
                        {b.identityLabel}
                      </span>
                    )}
                  </span>
                </summary>
                <div className="inner">
                  <p className="meta">TCR brand ID: {b.tcrBrandId ?? "—"}</p>
                  <JsonToggle label="Brand (raw)" data={b.raw} />
                  <h3>Campaigns</h3>
                  {b.campaigns.length === 0 && (
                    <p className="empty">No campaigns listed for this brand.</p>
                  )}
                  {b.campaigns.map((c) => (
                    <div key={c.id} style={{ marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>{c.displayName ?? c.id}</strong>
                        <span className={`badge ${badgeClass(c.status)}`}>{c.statusLabel}</span>
                        <span className="meta">TCR: {c.tcrCampaignId ?? "—"}</span>
                      </div>
                      <JsonToggle label="Campaign (raw)" data={c.raw} />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}

type TwilioSub = {
  sid: string;
  friendlyName: string;
  status: string;
  error?: string;
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
  campaignStatus?: string;
  statusLabel: string;
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

function JsonToggle({ label, data }: { label: string; data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="btn"
        style={{ marginTop: "0.5rem", fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && (
        <pre className="raw">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
