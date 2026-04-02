import { fetchJson } from "./http.js";
import {
  telnyxBrandStatusLabel,
  telnyxCampaignStatusLabel,
  telnyxIdentityStatusLabel,
} from "./status-labels.js";

const BASE = "https://api.telnyx.com/v2";

export type TelnyxVisibilityPayload = {
  tenants: TelnyxTenantRow[];
};

export type TelnyxTenantRow = {
  label: string;
  error?: string;
  brands: TelnyxBrandRow[];
};

export type TelnyxBrandRow = {
  id: string;
  displayName: string;
  status: string;
  statusLabel: string;
  identityStatus?: string;
  identityLabel: string;
  tcrBrandId?: string;
  raw: Record<string, unknown>;
  campaigns: TelnyxCampaignRow[];
};

export type TelnyxCampaignRow = {
  id: string;
  displayName?: string;
  status: string;
  statusLabel: string;
  tcrCampaignId?: string;
  raw: Record<string, unknown>;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bearer(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Telnyx v2 10DLC uses `records` + `totalRecords`, not `data` (see OpenAPI BrandRecordSetCSP). */
async function listAllBrands(apiKey: string): Promise<Record<string, unknown>[]> {
  const brands: Record<string, unknown>[] = [];
  const per = 100;
  let page = 1;
  const maxPages = 200;
  while (page <= maxPages) {
    const url = `${BASE}/10dlc/brand?recordsPerPage=${per}&page=${page}`;
    const data = await fetchJson<{
      records?: Record<string, unknown>[];
      page?: number;
      totalRecords?: number;
    }>(url, { headers: bearer(apiKey) });
    const batch = data.records ?? [];
    if (batch.length === 0) break;
    brands.push(...batch);
    const total = data.totalRecords ?? brands.length;
    if (brands.length >= total || batch.length < per) break;
    page += 1;
  }
  return brands;
}

async function listCampaignsForBrand(
  apiKey: string,
  brandId: string
): Promise<Record<string, unknown>[]> {
  const campaigns: Record<string, unknown>[] = [];
  const per = 100;
  let page = 1;
  const maxPages = 200;
  while (page <= maxPages) {
    const url = `${BASE}/10dlc/campaign?recordsPerPage=${per}&page=${page}&brandId=${encodeURIComponent(
      brandId
    )}`;
    const data = await fetchJson<{
      records?: Record<string, unknown>[];
      totalRecords?: number;
    }>(url, { headers: bearer(apiKey) });
    const batch = data.records ?? [];
    if (batch.length === 0) break;
    campaigns.push(...batch);
    const total = data.totalRecords ?? campaigns.length;
    if (campaigns.length >= total || batch.length < per) break;
    page += 1;
  }
  return campaigns;
}

export function parseTelnyxApiKeys(): { key: string; label: string }[] {
  const multi = process.env.TELNYX_API_KEYS?.trim();
  const labels = process.env.TELNYX_TENANT_LABELS?.split(",").map((s) => s.trim()) ?? [];
  if (multi) {
    const keys = multi.split(",").map((s) => s.trim()).filter(Boolean);
    return keys.map((key, i) => ({
      key,
      label: labels[i] ?? `Tenant ${i + 1}`,
    }));
  }
  const single = process.env.TELNYX_API_KEY?.trim();
  if (single) return [{ key: single, label: "Default" }];
  return [];
}

export async function buildTelnyxVisibility(): Promise<TelnyxVisibilityPayload> {
  const tenantsIn = parseTelnyxApiKeys();
  if (tenantsIn.length === 0) {
    return {
      tenants: [
        {
          label: "—",
          error: "Set TELNYX_API_KEY or TELNYX_API_KEYS in .env",
          brands: [],
        },
      ],
    };
  }

  const tenants: TelnyxTenantRow[] = [];

  for (const { key, label } of tenantsIn) {
    const row: TelnyxTenantRow = { label, brands: [] };
    try {
      const brandRows = await listAllBrands(key);
      const built = await Promise.all(
        brandRows.map(async (br) => {
          const id = str(br.brandId) ?? str(br.id);
          if (!id) return null;
          const displayName =
            str(br.displayName) ?? str(br.companyName) ?? str(br.name) ?? id;
          const status = str(br.status) ?? "unknown";
          const identityStatus =
            str(br.identityStatus) ?? str(br.identity_status);
          let campaignsRaw: Record<string, unknown>[] = [];
          try {
            campaignsRaw = await listCampaignsForBrand(key, id);
          } catch {
            campaignsRaw = [];
          }
          const campaigns: TelnyxCampaignRow[] = campaignsRaw.map((c) => {
            const cid = str(c.campaignId) ?? str(c.id) ?? "unknown";
            const cstatus =
              str(c.campaignStatus) ??
              str(c.submissionStatus) ??
              str(c.status) ??
              "unknown";
            return {
              id: cid,
              displayName:
                str(c.brandDisplayName) ?? str(c.displayName) ?? str(c.name),
              status: cstatus,
              statusLabel: telnyxCampaignStatusLabel(cstatus),
              tcrCampaignId: str(c.tcrCampaignId) ?? str(c.tcr_campaign_id),
              raw: c,
            };
          });
          const brandRow: TelnyxBrandRow = {
            id,
            displayName,
            status,
            statusLabel: telnyxBrandStatusLabel(status),
            identityStatus,
            identityLabel: telnyxIdentityStatusLabel(identityStatus),
            tcrBrandId: str(br.tcrBrandId) ?? str(br.tcr_brand_id),
            raw: br,
            campaigns,
          };
          return brandRow;
        })
      );
      row.brands.push(...built.filter((x): x is TelnyxBrandRow => x != null));
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    tenants.push(row);
  }

  return { tenants };
}
