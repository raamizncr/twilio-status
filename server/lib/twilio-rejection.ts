import type { TwilioSubaccountRow } from "./twilio.js";

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Pull human-readable lines Twilio often puts on profile / brand / Usa2p payloads. */
export function collectReasonsFromRaw(raw: Record<string, unknown>): string[] {
  const out: string[] = [];

  const fr =
    str(raw.failure_reason) ??
    str(raw.failureReason) ??
    str(raw.rejection_reason) ??
    str(raw.rejectionReason);
  if (fr) out.push(fr);

  const errs = raw.errors;
  if (Array.isArray(errs)) {
    for (const e of errs) {
      if (typeof e === "string") {
        out.push(e);
      } else if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const msg =
          str(o.message) ??
          str(o.description) ??
          str(o.error_message) ??
          str(o.log);
        const code = str(o.code);
        if (msg) out.push(code ? `${code}: ${msg}` : msg);
      }
    }
  }

  if (raw.error && typeof raw.error === "object") {
    const o = raw.error as Record<string, unknown>;
    const msg = str(o.message) ?? str(o.detail);
    if (msg) out.push(msg);
  }

  const unique = [...new Set(out.map((s) => s.trim()).filter(Boolean))];
  return unique;
}

export type TwilioRejectionItem = {
  scope: "profile" | "brand" | "campaign";
  profileSid?: string;
  profileName?: string;
  brandSid?: string;
  brandName?: string;
  messagingServiceSid?: string;
  messagingServiceName?: string;
  /** Human-readable */
  statusLabel: string;
  /** Raw API status for badge styling */
  statusCode: string;
  reasons: string[];
};

const NO_PROFILE_REASON =
  "No detailed reason in this API response — open Trust Hub → Customer profiles in Twilio Console.";
const NO_BRAND_REASON =
  "No failure_reason on this payload — open Messaging → Regulatory → Brands in Twilio Console.";
const NO_CAMPAIGN_REASON =
  "Limited detail on Usa2p compliance — open the Messaging Service → A2P Campaign in Console.";

export function buildRejectionItems(row: TwilioSubaccountRow): TwilioRejectionItem[] {
  const items: TwilioRejectionItem[] = [];

  for (const pr of row.profiles) {
    if (pr.status === "twilio-rejected") {
      const reasons = collectReasonsFromRaw(pr.raw);
      items.push({
        scope: "profile",
        profileSid: pr.sid,
        profileName: pr.friendlyName,
        statusLabel: pr.statusLabel,
        statusCode: pr.status,
        reasons: reasons.length > 0 ? reasons : [NO_PROFILE_REASON],
      });
    }

    for (const b of pr.brands) {
      const bst = (b.status ?? "").toUpperCase();
      if (bst === "FAILED") {
        const reasons = collectReasonsFromRaw(b.raw);
        items.push({
          scope: "brand",
          profileSid: pr.sid,
          profileName: pr.friendlyName,
          brandSid: b.sid,
          brandName: b.friendlyName,
          statusLabel: b.statusLabel,
          statusCode: b.status,
          reasons: reasons.length > 0 ? reasons : [NO_BRAND_REASON],
        });
      }

      for (const c of b.campaigns) {
        const cst = (c.campaignStatus ?? "").toUpperCase();
        if (cst === "FAILED" || cst === "SUSPENDED") {
          const reasons = collectReasonsFromRaw(c.raw);
          items.push({
            scope: "campaign",
            profileSid: pr.sid,
            profileName: pr.friendlyName,
            brandSid: b.sid,
            brandName: b.friendlyName,
            messagingServiceSid: c.messagingServiceSid,
            messagingServiceName: c.messagingServiceName,
            statusLabel: c.statusLabel,
            statusCode: c.campaignStatus ?? "FAILED",
            reasons: reasons.length > 0 ? reasons : [NO_CAMPAIGN_REASON],
          });
        }
      }
    }
  }

  for (const c of row.orphanCampaigns) {
    const cst = (c.campaignStatus ?? "").toUpperCase();
    if (cst === "FAILED" || cst === "SUSPENDED") {
      const reasons = collectReasonsFromRaw(c.raw);
      items.push({
        scope: "campaign",
        messagingServiceSid: c.messagingServiceSid,
        messagingServiceName: c.messagingServiceName,
        statusLabel: c.statusLabel,
        statusCode: c.campaignStatus ?? "FAILED",
        reasons: reasons.length > 0 ? reasons : [NO_CAMPAIGN_REASON],
      });
    }
  }

  return items;
}
