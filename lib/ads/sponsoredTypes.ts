// lib/ads/sponsoredTypes.ts
export type SponsoredTag = "House Sponsor" | "Sponsored";

export type SponsoredAd = {
  id: string; // campaign id
  sponsor_name: string;
  sponsor_tag: SponsoredTag;
  title: string;
  body: string;
  cta: string;
  image_url?: string | null;
  route: string;
  weight?: number;
};

export type Placement = "discover" | "following";

export type AdCampaignRow = {
  id: string;
  title: string | null;
  sponsor_name: string | null;
  sponsor_type: string | null;
  badge_text: string | null;
  body: string | null;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string | null;
  weight: number | null;
  placement: Placement | string;
  is_active: boolean | null;
  start_at: string | null;
  end_at: string | null;
  min_posts_between: number | null;
};