import { basicAuthHeader, fetchJson, fetchJsonOptional } from "./http.js";
import {
  brandStatusLabel,
  campaignStatusLabel,
  profileStatusLabel,
  twilioOverallStatus,
} from "./status-labels.js";
import { buildRejectionItems, collectReasonsFromRaw, type TwilioRejectionItem } from "./twilio-rejection.js";
import { buildPipelineItems, type TwilioPipelineItem } from "./twilio-pipeline.js";

export type { TwilioRejectionItem, TwilioPipelineItem };

const API = "https://api.twilio.com";
const TRUST = "https://trusthub.twilio.com/v1";
const MSG = "https://messaging.twilio.com/v1";

type TwilioAccount = {
  sid?: string;
  friendly_name?: string;
  status?: string;
  /** Often "Full" even for subaccounts; do not rely on this alone */
  type?: string;
  /** Present on child accounts; parent SID for ISV / multi-account setups */
  owner_account_sid?: string;
  /** Per-account secret from Accounts list — required for API calls as that account */
  auth_token?: string;
};

/** Child accounts under a parent: Twilio lists them with type "Full" and owner_account_sid set, not necessarily type "Subaccount". */
function isSubaccountRow(a: TwilioAccount, parentSid: string): boolean {
  if (!a.sid || a.sid === parentSid) return false;
  if (a.owner_account_sid === parentSid) return true;
  return a.type === "Subaccount";
}

type MetaPage = { meta?: { next_page_url?: string | null } };

export type TwilioVisibilityPayload = {
  subaccounts: TwilioSubaccountRow[];
};

export type TwilioSubaccountRow = {
  sid: string;
  friendlyName: string;
  status: string;
  error?: string;
  /** Aggregated failed / rejected profile, brand, and campaign rows with API reasons when present */
  rejectionItems?: TwilioRejectionItem[];
  /** Draft, pending review, in review, pending verification — still in flight */
  pipelineItems?: TwilioPipelineItem[];
  profiles: TwilioProfileRow[];
  orphanCampaigns: TwilioCampaignRow[];
};

export type TwilioProfileRow = {
  sid: string;
  friendlyName: string;
  email?: string;
  status: string;
  statusLabel: string;
  dateCreated?: string;
  dateUpdated?: string;
  raw: Record<string, unknown>;
  brands: TwilioBrandRow[];
};

export type TwilioBrandRow = {
  sid: string;
  friendlyName: string;
  status: string;
  identityStatus?: string;
  statusLabel: string;
  overallLabel: string;
  dateCreated?: string;
  dateUpdated?: string;
  raw: Record<string, unknown>;
  campaigns: TwilioCampaignRow[];
};

export type TwilioCampaignRow = {
  messagingServiceSid: string;
  messagingServiceName: string;
  /** Usa2p compliance record SID (QE…) when present — unique per A2P registration on a service */
  usa2pRecordSid?: string;
  campaignStatus?: string;
  statusLabel: string;
  overallLabel: string;
  /** Parsed from raw.errors etc. for failed campaigns */
  errorMessages?: string[];
  raw: Record<string, unknown>;
};

async function listSubaccounts(
  parentSid: string,
  parentToken: string
): Promise<TwilioAccount[]> {
  const auth = basicAuthHeader(parentSid, parentToken);
  const accounts: TwilioAccount[] = [];
  let next: string | null = `${API}/2010-04-01/Accounts.json?PageSize=100`;
  while (next) {
    const page: {
      accounts?: TwilioAccount[];
      next_page_uri?: string | null;
    } = await fetchJson(next, { headers: { Authorization: auth } });
    accounts.push(...(page.accounts ?? []));
    next = page.next_page_uri ? `${API}${page.next_page_uri}` : null;
  }
  return accounts.filter((a) => isSubaccountRow(a, parentSid));
}

async function listCustomerProfileSids(
  subSid: string,
  parentToken: string
): Promise<string[]> {
  const auth = basicAuthHeader(subSid, parentToken);
  const sids: string[] = [];
  let next: string | null = `${TRUST}/CustomerProfiles?PageSize=50`;
  while (next) {
    const page: { results?: { sid?: string }[] } & MetaPage = await fetchJson(
      next,
      { headers: { Authorization: auth } }
    );
    for (const r of page.results ?? []) {
      if (r.sid) sids.push(r.sid);
    }
    next = page.meta?.next_page_url ?? null;
  }
  return sids;
}

async function getCustomerProfile(
  subSid: string,
  parentToken: string,
  profileSid: string
): Promise<Record<string, unknown>> {
  const auth = basicAuthHeader(subSid, parentToken);
  return fetchJson<Record<string, unknown>>(
    `${TRUST}/CustomerProfiles/${encodeURIComponent(profileSid)}`,
    { headers: { Authorization: auth } }
  );
}

async function listBrandsForProfile(
  subSid: string,
  parentToken: string,
  profileSid: string
): Promise<Record<string, unknown>[]> {
  const auth = basicAuthHeader(subSid, parentToken);
  const rows: Record<string, unknown>[] = [];
  let next: string | null =
    `${MSG}/a2p/BrandRegistrations?CustomerProfileBundleSid=${encodeURIComponent(
      profileSid
    )}&PageSize=50`;
  while (next) {
    const page: { data?: Record<string, unknown>[] } & MetaPage = await fetchJson(
      next,
      { headers: { Authorization: auth } }
    );
    rows.push(...(page.data ?? []));
    next = page.meta?.next_page_url ?? null;
  }
  return rows;
}

async function getBrandDetail(
  subSid: string,
  parentToken: string,
  brandSid: string
): Promise<Record<string, unknown>> {
  const auth = basicAuthHeader(subSid, parentToken);
  return fetchJson<Record<string, unknown>>(
    `${MSG}/a2p/BrandRegistrations/${encodeURIComponent(brandSid)}`,
    { headers: { Authorization: auth } }
  );
}

type ServiceRow = {
  sid?: string;
  friendly_name?: string;
  links?: { us_app_to_person?: string };
};

async function listMessagingServices(
  subSid: string,
  parentToken: string
): Promise<ServiceRow[]> {
  const auth = basicAuthHeader(subSid, parentToken);
  const services: ServiceRow[] = [];
  let next: string | null = `${MSG}/Services?PageSize=50`;
  while (next) {
    const page: { services?: ServiceRow[] } & MetaPage = await fetchJson(next, {
      headers: { Authorization: auth },
    });
    services.push(...(page.services ?? []));
    next = page.meta?.next_page_url ?? null;
  }
  return services;
}

/**
 * Twilio returns `{ compliance: [ {...} ], meta }` (and may paginate). Status lives on each
 * compliance object, not on the envelope — expanding this fixes UNKNOWN / missing pipeline counts.
 */
async function listUsa2pComplianceRecords(
  subSid: string,
  parentToken: string,
  serviceSid: string
): Promise<Record<string, unknown>[]> {
  const auth = basicAuthHeader(subSid, parentToken);
  const merged: Record<string, unknown>[] = [];
  let next: string | null =
    `${MSG}/Services/${encodeURIComponent(serviceSid)}/Compliance/Usa2p?PageSize=50`;
  while (next) {
    const page = await fetchJsonOptional<Record<string, unknown>>(next, {
      headers: { Authorization: auth },
    });
    if (!page) break;
    const comp = page.compliance;
    if (Array.isArray(comp)) {
      for (const item of comp) {
        if (item && typeof item === "object") {
          merged.push(item as Record<string, unknown>);
        }
      }
    } else if (str(page.campaign_status) || str(page.sid)) {
      merged.push(page);
    }
    const meta = page.meta as { next_page_url?: string | null } | undefined;
    next = meta?.next_page_url ?? null;
  }
  return merged;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Bundle SID linking an A2P brand to a Trust Hub customer profile (BU…). */
function brandCustomerProfileBundleSid(
  detail: Record<string, unknown>,
  listRow: Record<string, unknown>
): string | undefined {
  return (
    str(detail.customer_profile_bundle_sid) ??
    str(detail.customerProfileBundleSid) ??
    str(detail.a2p_profile_bundle_sid) ??
    str(detail.a2pProfileBundleSid) ??
    str(listRow.customer_profile_bundle_sid) ??
    str(listRow.customerProfileBundleSid)
  );
}

/**
 * The Brand Registrations list is queried per profile, but responses can still include
 * brands tied to other bundles. Only attach a brand under the profile it belongs to
 * so counts match Twilio Console (one row per brand).
 */
function brandBelongsToCustomerProfile(
  profileSid: string,
  detail: Record<string, unknown>,
  listRow: Record<string, unknown>
): boolean {
  const bundle = brandCustomerProfileBundleSid(detail, listRow);
  if (!bundle) return true;
  return bundle === profileSid;
}

function dedupeBrandListBySid(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const id = str(r.sid);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/** Run up to `limit` async tasks in parallel across `items`. */
async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function processSubaccount(
  sub: TwilioAccount,
  parentToken: string,
  skipBrandDetail: boolean
): Promise<TwilioSubaccountRow> {
  const sid = sub.sid as string;
  const row: TwilioSubaccountRow = {
    sid,
    friendlyName: sub.friendly_name ?? sid,
    status: sub.status ?? "unknown",
    profiles: [],
    orphanCampaigns: [],
  };

  try {
    const subToken =
      typeof sub.auth_token === "string" && sub.auth_token.length > 0
        ? sub.auth_token
        : parentToken;

    const profileSids = await listCustomerProfileSids(sid, subToken);

    const campaignsByBrand = new Map<string, TwilioCampaignRow[]>();
    const services = await listMessagingServices(sid, subToken);
    const withUsa2p = services.filter((s) => s.sid && s.links?.us_app_to_person);
    const usa2pPairs = await Promise.all(
      withUsa2p.map(async (svc) => ({
        svc,
        records: await listUsa2pComplianceRecords(sid, subToken, svc.sid as string),
      }))
    );
    for (const { svc, records } of usa2pPairs) {
      if (!svc.sid) continue;
      for (const usa2p of records) {
        const brandReg =
          str(usa2p.brand_registration_sid) ?? str(usa2p.brandRegistrationSid);
        const campaignStatus =
          str(usa2p.campaign_status) ?? str(usa2p.campaignStatus);
        const recordSid = str(usa2p.sid);
        const errs = collectReasonsFromRaw(usa2p);
        const campaignRow: TwilioCampaignRow = {
          messagingServiceSid: svc.sid,
          messagingServiceName: svc.friendly_name ?? svc.sid,
          usa2pRecordSid: recordSid,
          campaignStatus,
          statusLabel: campaignStatusLabel(campaignStatus),
          overallLabel: twilioOverallStatus(
            undefined,
            undefined,
            campaignStatus
          ),
          errorMessages: errs.length > 0 ? errs : undefined,
          raw: usa2p,
        };
        if (brandReg) {
          const list = campaignsByBrand.get(brandReg) ?? [];
          list.push(campaignRow);
          campaignsByBrand.set(brandReg, list);
        } else {
          row.orphanCampaigns.push(campaignRow);
        }
      }
    }

    const profileRows = await Promise.all(
      profileSids.map(async (profileSid) => {
        const profRaw = await getCustomerProfile(sid, subToken, profileSid);
        const pStatus = str(profRaw.status);
        const profileRow: TwilioProfileRow = {
          sid: profileSid,
          friendlyName: str(profRaw.friendly_name) ?? profileSid,
          email: str(profRaw.email),
          status: pStatus ?? "unknown",
          statusLabel: profileStatusLabel(pStatus),
          dateCreated: str(profRaw.date_created),
          dateUpdated: str(profRaw.date_updated),
          raw: profRaw,
          brands: [],
        };

        const brandList = dedupeBrandListBySid(
          await listBrandsForProfile(sid, subToken, profileSid)
        );
        const brandEntries = await Promise.all(
          brandList.map(async (b) => {
            const brandSid = str(b.sid);
            if (!brandSid) return null;
            let detail = b;
            if (!skipBrandDetail) {
              try {
                detail = await getBrandDetail(sid, subToken, brandSid);
              } catch {
                /* list row is enough */
              }
            }
            if (!brandBelongsToCustomerProfile(profileSid, detail, b)) {
              return null;
            }
            const bStatus = str(detail.status);
            const idStatus = str(detail.identity_status);
            const campaigns = campaignsByBrand.get(brandSid) ?? [];
            campaignsByBrand.delete(brandSid);
            const br: TwilioBrandRow = {
              sid: brandSid,
              friendlyName: str(detail.friendly_name) ?? brandSid,
              status: bStatus ?? "unknown",
              identityStatus: idStatus,
              statusLabel: brandStatusLabel(bStatus),
              overallLabel: twilioOverallStatus(
                pStatus,
                bStatus,
                campaigns[0]?.campaignStatus
              ),
              dateCreated: str(detail.date_created),
              dateUpdated: str(detail.date_updated),
              raw: detail,
              campaigns,
            };
            return br;
          })
        );
        profileRow.brands.push(
          ...brandEntries.filter((x): x is TwilioBrandRow => x != null)
        );
        return profileRow;
      })
    );

    row.profiles.push(...profileRows);

    for (const [, camps] of campaignsByBrand) {
      row.orphanCampaigns.push(...camps);
    }

    row.rejectionItems = buildRejectionItems(row);
    row.pipelineItems = buildPipelineItems(row);
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
    row.rejectionItems = [];
    row.pipelineItems = [];
  }

  return row;
}

export async function buildTwilioVisibility(
  parentSid: string,
  parentToken: string
): Promise<TwilioVisibilityPayload> {
  const subs = await listSubaccounts(parentSid, parentToken);
  const concurrency = Math.max(
    1,
    Number(process.env.TWILIO_SUBACCOUNT_CONCURRENCY ?? 8)
  );
  const skipBrandDetail =
    process.env.TWILIO_SKIP_BRAND_DETAIL_FETCH === "1" ||
    process.env.TWILIO_SKIP_BRAND_DETAIL_FETCH === "true";

  const subaccounts = await runPool(subs, concurrency, (sub) =>
    processSubaccount(sub, parentToken, skipBrandDetail)
  );

  return { subaccounts };
}
