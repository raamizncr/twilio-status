/** Human-readable labels for Twilio Trust Hub + A2P + Usa2p statuses */

export function profileStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string> = {
    draft: "Draft — not submitted",
    "pending-review": "Pending review",
    "in-review": "Under review",
    "twilio-approved": "Approved — ready for brand registration",
    "twilio-rejected": "Rejected",
  };
  return labels[status] ?? status;
}

export function brandStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string> = {
    PENDING: "Awaiting approval",
    APPROVED: "Approved",
    FAILED: "Registration failed",
    IN_REVIEW: "Under review",
  };
  return labels[status] ?? status;
}

export function campaignStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string> = {
    PENDING: "Awaiting verification",
    VERIFIED: "Verified / active",
    FAILED: "Failed",
    SUSPENDED: "Suspended",
    IN_PROGRESS: "In progress",
  };
  return labels[status] ?? status;
}

export function twilioOverallStatus(
  profileStatus: string | undefined,
  brandStatus: string | undefined,
  campaignStatus: string | undefined
): string {
  if (campaignStatus === "VERIFIED") return "Operational";
  if (brandStatus === "APPROVED" && campaignStatus === "PENDING") return "Campaign pending";
  if (profileStatus === "twilio-approved" && brandStatus === "PENDING") return "Brand pending";
  if (profileStatus === "pending-review" || profileStatus === "in-review") return "Profile pending";
  return "Incomplete";
}

export function telnyxBrandStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  return status;
}

export function telnyxIdentityStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  return status;
}

export function telnyxCampaignStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  return status;
}
