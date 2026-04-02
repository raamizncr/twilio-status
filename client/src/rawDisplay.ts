/** Human-readable rows from API payloads; JSON remains optional in the UI. */

export type RawVariant =
  | "twilio-profile"
  | "twilio-brand"
  | "twilio-usa2p"
  | "telnyx-brand"
  | "telnyx-campaign";

type FieldDef = { aliases: string[]; label: string };

const TWILIO_PROFILE: FieldDef[] = [
  { aliases: ["sid"], label: "SID" },
  { aliases: ["friendly_name", "friendlyName"], label: "Name" },
  { aliases: ["status"], label: "Status" },
  { aliases: ["email"], label: "Email" },
  { aliases: ["date_created", "dateCreated"], label: "Created" },
  { aliases: ["date_updated", "dateUpdated"], label: "Updated" },
  { aliases: ["policy_sid", "policySid"], label: "Policy" },
  { aliases: ["valid_until", "validUntil"], label: "Valid until" },
  { aliases: ["errors"], label: "Errors" },
];

const TWILIO_BRAND: FieldDef[] = [
  { aliases: ["sid"], label: "SID" },
  { aliases: ["friendly_name", "friendlyName"], label: "Name" },
  { aliases: ["status"], label: "Brand status" },
  { aliases: ["identity_status", "identityStatus"], label: "Identity" },
  { aliases: ["brand_type", "brandType"], label: "Brand type" },
  { aliases: ["stock_exchange", "stockExchange"], label: "Stock exchange" },
  { aliases: ["stock_ticker", "stockTicker"], label: "Ticker" },
  { aliases: ["date_created", "dateCreated"], label: "Created" },
  { aliases: ["date_updated", "dateUpdated"], label: "Updated" },
  { aliases: ["failure_reason", "failureReason"], label: "Failure reason" },
  { aliases: ["errors"], label: "Errors" },
  { aliases: ["url"], label: "URL" },
];

const TWILIO_USA2P: FieldDef[] = [
  { aliases: ["campaign_status", "campaignStatus"], label: "Campaign status" },
  { aliases: ["brand_registration_sid", "brandRegistrationSid"], label: "Brand registration" },
  { aliases: ["campaign_id", "campaignId"], label: "Campaign ID" },
  { aliases: ["messaging_service_sid", "messagingServiceSid"], label: "Messaging service" },
  { aliases: ["rate_limits", "rateLimits"], label: "Rate limits" },
  { aliases: ["message_samples", "messageSamples"], label: "Message samples" },
  { aliases: ["has_embedded_links", "hasEmbeddedLinks"], label: "Embedded links" },
  { aliases: ["has_embedded_phone", "hasEmbeddedPhone"], label: "Embedded phone" },
  { aliases: ["message_flow", "messageFlow"], label: "Message flow" },
  { aliases: ["opt_in_keywords", "optInKeywords"], label: "Opt-in keywords" },
  { aliases: ["opt_in_message", "optInMessage"], label: "Opt-in message" },
  { aliases: ["opt_out_keywords", "optOutKeywords"], label: "Opt-out keywords" },
  { aliases: ["help_keywords", "helpKeywords"], label: "Help keywords" },
  { aliases: ["help_message", "helpMessage"], label: "Help message" },
  { aliases: ["us_app_to_person_sid", "usAppToPersonSid"], label: "Usa2p record" },
];

const TELNYX_BRAND: FieldDef[] = [
  { aliases: ["brandId", "id"], label: "Brand ID" },
  { aliases: ["displayName", "name", "companyName"], label: "Display name" },
  { aliases: ["status"], label: "Status" },
  { aliases: ["identityStatus", "identity_status"], label: "Identity" },
  { aliases: ["tcrBrandId", "tcr_brand_id"], label: "TCR brand ID" },
  { aliases: ["entityType", "entity_type"], label: "Entity type" },
  { aliases: ["country", "countryCode"], label: "Country" },
  { aliases: ["vertical", "industry"], label: "Vertical" },
  { aliases: ["createdAt", "created_at"], label: "Created" },
  { aliases: ["updatedAt", "updated_at"], label: "Updated" },
  { aliases: ["errors", "error"], label: "Errors" },
];

const TELNYX_CAMPAIGN: FieldDef[] = [
  { aliases: ["campaignId", "id"], label: "Campaign ID" },
  { aliases: ["displayName", "name", "brandDisplayName"], label: "Name" },
  { aliases: ["campaignStatus", "submissionStatus", "status"], label: "Status" },
  { aliases: ["tcrCampaignId", "tcr_campaign_id"], label: "TCR campaign ID" },
  { aliases: ["mnoStatus", "mno_status"], label: "MNO status" },
  { aliases: ["createdAt", "created_at"], label: "Created" },
  { aliases: ["updatedAt", "updated_at"], label: "Updated" },
  { aliases: ["errors", "error"], label: "Errors" },
];

const BY_VARIANT: Record<RawVariant, FieldDef[]> = {
  "twilio-profile": TWILIO_PROFILE,
  "twilio-brand": TWILIO_BRAND,
  "twilio-usa2p": TWILIO_USA2P,
  "telnyx-brand": TELNYX_BRAND,
  "telnyx-campaign": TELNYX_CAMPAIGN,
};

function firstDefined(
  raw: Record<string, unknown>,
  aliases: string[]
): { value: unknown; usedKey: string | null } {
  for (const k of aliases) {
    if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined) {
      return { value: raw[k], usedKey: k };
    }
  }
  return { value: undefined, usedKey: null };
}

export function formatRawValue(value: unknown, maxLen = 320): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return "—";
    if (t.length > maxLen) return `${t.slice(0, maxLen - 1)}…`;
    return t;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    const primitives = value.every(
      (x) =>
        x === null ||
        typeof x === "string" ||
        typeof x === "number" ||
        typeof x === "boolean"
    );
    if (primitives) {
      const s = value.map((x) => String(x)).join(", ");
      return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    const j = JSON.stringify(value);
    if (j.length <= maxLen) return j;
    return `${j.slice(0, maxLen - 1)}…`;
  }
  return String(value);
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Rows from curated fields + leftover primitive keys (alphabetical, capped). */
export function buildRawRows(
  raw: Record<string, unknown>,
  variant: RawVariant,
  extraPrimitiveMax = 14
): { label: string; value: string }[] {
  const defs = BY_VARIANT[variant];
  const usedKeys = new Set<string>();
  const rows: { label: string; value: string }[] = [];

  for (const def of defs) {
    const { value, usedKey } = firstDefined(raw, def.aliases);
    if (usedKey) usedKeys.add(usedKey);
    const str = formatRawValue(value);
    if (str === "—") continue;
    rows.push({ label: def.label, value: str });
  }

  const extras: { k: string; v: string }[] = [];
  for (const k of Object.keys(raw).sort()) {
    if (usedKeys.has(k)) continue;
    const v = raw[k];
    if (
      v === null ||
      v === undefined ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      const str = formatRawValue(v, 160);
      if (str !== "—") extras.push({ k, v: str });
    } else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) {
      extras.push({ k, v: formatRawValue(v, 200) });
    }
  }

  for (const { k, v } of extras.slice(0, extraPrimitiveMax)) {
    rows.push({ label: humanizeKey(k), value: v });
  }

  if (extras.length > extraPrimitiveMax) {
    rows.push({
      label: "More fields",
      value: `${extras.length - extraPrimitiveMax} additional keys — open raw JSON`,
    });
  }

  return rows;
}
