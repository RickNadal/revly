// lib/ads/campaignService.ts
import { supabase } from "../supabase";
import type { AdCampaignRow, Placement, SponsoredAd, SponsoredTag } from "./sponsoredTypes";

export function mapRowToAd(r: AdCampaignRow, t: (k: string, o?: any) => string): SponsoredAd | null {
  const sponsorType = String(r.sponsor_type ?? "").toLowerCase();
  const isHouse = sponsorType === "house";

  const sponsorTag: SponsoredTag =
    r.badge_text === "House Sponsor" || r.badge_text === "Sponsored"
      ? (r.badge_text as SponsoredTag)
      : isHouse
      ? "House Sponsor"
      : "Sponsored";

  const sponsorName = r.sponsor_name?.trim() || t("ads.sponsor_fallback", { defaultValue: "Sponsor" });
  const title = r.title?.trim() || sponsorName;
  const body = r.body?.trim() || "";
  if (!body) return null;

  const cta = r.cta_text?.trim() || t("ads.learn_more", { defaultValue: "Learn more" });
  const route = r.cta_url?.trim() || "/advertise";

  return {
    id: r.id,
    sponsor_name: sponsorName,
    sponsor_tag: sponsorTag,
    title,
    body,
    cta,
    route,
    image_url: r.image_url ?? null,
    weight: r.weight ?? 1,
  };
}

export async function loadActiveCampaigns(placement: Placement, t: (k: string, o?: any) => string) {
  try {
    const { data, error } = await supabase
      .from("ad_campaigns")
      .select(
        "id, title, sponsor_name, sponsor_type, badge_text, body, cta_text, cta_url, image_url, weight, placement, is_active, start_at, end_at, min_posts_between"
      )
      .eq("placement", placement);

    if (error) return { campaigns: [] as SponsoredAd[], error };

    const rows: AdCampaignRow[] = (data ?? []) as any;
    const now = Date.now();

    const active = rows.filter((r) => {
      const isActive = r.is_active !== false;
      const startOk = !r.start_at || new Date(r.start_at).getTime() <= now;
      const endOk = !r.end_at || new Date(r.end_at).getTime() >= now;
      return isActive && startOk && endOk;
    });

    const mapped = active.map((r) => mapRowToAd(r, t)).filter(Boolean) as SponsoredAd[];
    return { campaigns: mapped, error: null };
  } catch (e: any) {
    return { campaigns: [] as SponsoredAd[], error: e ?? null };
  }
}