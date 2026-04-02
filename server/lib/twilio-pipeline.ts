import type { TwilioSubaccountRow } from "./twilio.js";

/** Non-terminal A2P rows still moving through Trust Hub / brand / campaign (excludes failures — see rejectionItems). */
export type TwilioPipelinePhase =
  | "draft"
  | "pending"
  | "in_review"
  | "verification_pending"
  | "in_progress";

export type TwilioPipelineItem = {
  scope: "profile" | "brand" | "campaign";
  phase: TwilioPipelinePhase;
  /** Short line for the dashboard (stage in the funnel) */
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

const PHASE_ORDER: Record<TwilioPipelinePhase, number> = {
  draft: 0,
  pending: 1,
  in_review: 2,
  verification_pending: 3,
  in_progress: 4,
};

function sortKey(it: TwilioPipelineItem): number {
  return PHASE_ORDER[it.phase] * 100 + (it.scope === "profile" ? 0 : it.scope === "brand" ? 1 : 2);
}

export function buildPipelineItems(row: TwilioSubaccountRow): TwilioPipelineItem[] {
  const items: TwilioPipelineItem[] = [];

  for (const pr of row.profiles) {
    if (pr.status === "twilio-rejected") continue;

    if (pr.status === "draft") {
      items.push({
        scope: "profile",
        phase: "draft",
        phaseLabel: "Customer profile — draft (not submitted)",
        profileSid: pr.sid,
        profileName: pr.friendlyName,
        statusLabel: pr.statusLabel,
        statusCode: pr.status,
      });
    } else if (pr.status === "pending-review") {
      items.push({
        scope: "profile",
        phase: "pending",
        phaseLabel: "Customer profile — submitted, awaiting Twilio review",
        profileSid: pr.sid,
        profileName: pr.friendlyName,
        statusLabel: pr.statusLabel,
        statusCode: pr.status,
      });
    } else if (pr.status === "in-review") {
      items.push({
        scope: "profile",
        phase: "in_review",
        phaseLabel: "Customer profile — under review at Twilio",
        profileSid: pr.sid,
        profileName: pr.friendlyName,
        statusLabel: pr.statusLabel,
        statusCode: pr.status,
      });
    }

    for (const b of pr.brands) {
      const bst = (b.status ?? "").toUpperCase();
      if (bst === "FAILED") continue;

      if (bst === "PENDING") {
        items.push({
          scope: "brand",
          phase: "pending",
          phaseLabel: "A2P brand — awaiting registration approval",
          profileSid: pr.sid,
          profileName: pr.friendlyName,
          brandSid: b.sid,
          brandName: b.friendlyName,
          statusLabel: b.statusLabel,
          statusCode: b.status,
        });
      } else if (bst === "IN_REVIEW") {
        items.push({
          scope: "brand",
          phase: "in_review",
          phaseLabel: "A2P brand — under review",
          profileSid: pr.sid,
          profileName: pr.friendlyName,
          brandSid: b.sid,
          brandName: b.friendlyName,
          statusLabel: b.statusLabel,
          statusCode: b.status,
        });
      }

      for (const c of b.campaigns) {
        const cst = (c.campaignStatus ?? "").toUpperCase();
        if (cst === "FAILED" || cst === "SUSPENDED" || cst === "VERIFIED") continue;

        if (cst === "PENDING") {
          items.push({
            scope: "campaign",
            phase: "verification_pending",
            phaseLabel: "10DLC campaign — pending verification (TCR / carriers)",
            profileSid: pr.sid,
            profileName: pr.friendlyName,
            brandSid: b.sid,
            brandName: b.friendlyName,
            messagingServiceSid: c.messagingServiceSid,
            messagingServiceName: c.messagingServiceName,
            statusLabel: c.statusLabel,
            statusCode: c.campaignStatus ?? "PENDING",
          });
        } else if (cst === "IN_PROGRESS") {
          items.push({
            scope: "campaign",
            phase: "in_progress",
            phaseLabel: "10DLC campaign — registration in progress",
            profileSid: pr.sid,
            profileName: pr.friendlyName,
            brandSid: b.sid,
            brandName: b.friendlyName,
            messagingServiceSid: c.messagingServiceSid,
            messagingServiceName: c.messagingServiceName,
            statusLabel: c.statusLabel,
            statusCode: c.campaignStatus ?? "IN_PROGRESS",
          });
        }
      }
    }
  }

  for (const c of row.orphanCampaigns) {
    const cst = (c.campaignStatus ?? "").toUpperCase();
    if (cst === "FAILED" || cst === "SUSPENDED" || cst === "VERIFIED") continue;

    if (cst === "PENDING") {
      items.push({
        scope: "campaign",
        phase: "verification_pending",
        phaseLabel: "10DLC campaign — pending verification (unmatched to brand row)",
        messagingServiceSid: c.messagingServiceSid,
        messagingServiceName: c.messagingServiceName,
        statusLabel: c.statusLabel,
        statusCode: c.campaignStatus ?? "PENDING",
      });
    } else if (cst === "IN_PROGRESS") {
      items.push({
        scope: "campaign",
        phase: "in_progress",
        phaseLabel: "10DLC campaign — in progress (unmatched to brand row)",
        messagingServiceSid: c.messagingServiceSid,
        messagingServiceName: c.messagingServiceName,
        statusLabel: c.statusLabel,
        statusCode: c.campaignStatus ?? "IN_PROGRESS",
      });
    }
  }

  items.sort((a, b) => sortKey(a) - sortKey(b));
  return items;
}
