import type { Ad, AdPlacement } from "./types";

/**
 * You can back this with Supabase. For now, this is an interface + a safe fallback.
 * Keep it boring: fetch active campaigns for placement, sort by priority, return creatives.
 */
export type FetchAdsParams = {
  placement: AdPlacement;
  limit?: number;
  nowIso?: string; // inject for testability
};

export interface AdService {
  fetchAds(params: FetchAdsParams): Promise<Ad[]>;
}

export class LocalFallbackAdService implements AdService {
  async fetchAds(params: FetchAdsParams): Promise<Ad[]> {
    const { placement, limit = 5 } = params;

    // Minimal house ad example (replace with real creative/assets)
    const house: Ad = {
      id: "house-1",
      campaignId: "house-campaign",
      creative: {
        id: "house-creative-1",
        headline: "Decazi Custom Rings",
        body: "Handmade custom rings. Tap to learn more.",
        imageUrl: undefined,
        cta: { label: "Learn more", url: "https://decazicustomrings.com" },
      },
      campaign: {
        id: "house-campaign",
        status: "active",
        priority: 1000,
        placements: [placement],
        isHouse: true,
      },
    };

    return [house].slice(0, limit);
  }
}

/**
 * Stub for Supabase-backed implementation.
 * Wire your supabase client here and keep the rest of the app calling AdService only.
 */
export class SupabaseAdService implements AdService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: any) {}

  async fetchAds(params: FetchAdsParams): Promise<Ad[]> {
    const { placement, limit = 10, nowIso } = params;

    const now = nowIso ?? new Date().toISOString();

    // Pseudocode query shape; adapt to your table names/columns:
    // - campaigns active in time window
    // - placement contains placement
    // - join creatives
    // - order by priority desc
    //
    // Keep this function returning the normalized Ad[] shape.

    const { data, error } = await this.supabase
      .from("ads")
      .select(`
        id,
        status,
        priority,
        start_at,
        end_at,
        is_house,
        placements,
        ad_creatives (
          id,
          headline,
          body,
          image_url,
          cta_label,
          cta_url
        )
      `)
      .eq("status", "active")
      .contains("placements", [placement])
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`end_at.is.null,end_at.gte.${now}`)
      .order("priority", { ascending: false })
      .limit(limit);

    if (error) {
      // Fail closed: return empty (or fall back elsewhere in caller)
      return [];
    }

    // Normalize
    const out: Ad[] = [];
    for (const row of data ?? []) {
      const creatives = row.ad_creatives ?? [];
      for (const c of creatives) {
        out.push({
          id: `${row.id}:${c.id}`,
          campaignId: row.id,
          creative: {
            id: c.id,
            headline: c.headline,
            body: c.body ?? undefined,
            imageUrl: c.image_url ?? undefined,
            cta: c.cta_url ? { label: c.cta_label ?? "Learn more", url: c.cta_url } : undefined,
          },
          campaign: {
            id: row.id,
            status: row.status,
            priority: row.priority,
            startAt: row.start_at ?? undefined,
            endAt: row.end_at ?? undefined,
            placements: row.placements ?? [placement],
            isHouse: !!row.is_house,
          },
        });
      }
    }

    return out;
  }
}