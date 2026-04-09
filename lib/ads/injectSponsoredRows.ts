// lib/ads/injectSponsoredRows.ts
import type { Placement, SponsoredAd } from "./sponsoredTypes";
import { hashStringToSeed, seededUnitFloat, weightedPick } from "./utils";

export type FeedRow<TPost> =
  | { type: "post"; key: `post:${string}`; post: TPost }
  | { type: "ad"; key: `ad:${string}:${number}`; ad: SponsoredAd; placement: Placement };

type InjectOpts<TPost> = {
  posts: TPost[];
  getPostId: (p: TPost) => string;

  placement: Placement;
  everyN: number;

  campaigns: SponsoredAd[];
  hiddenAdIds: Set<string>;

  maxAdsPerPage?: number;

  // stable daily rotation; caller can pass userId too
  rotationSeed: string;
};

export function injectSponsoredRows<TPost>(opts: InjectOpts<TPost>): FeedRow<TPost>[] {
  const { posts, getPostId, placement, everyN, campaigns, hiddenAdIds, maxAdsPerPage = Infinity, rotationSeed } = opts;

  const rows: FeedRow<TPost>[] = [];
  const visibleCampaigns = campaigns.filter((c) => !hiddenAdIds.has(c.id));

  // Empty feed fallback: still allow one ad to render when campaigns are available.
  if (!posts.length) {
    if (!visibleCampaigns.length || maxAdsPerPage <= 0) return rows;

    const seed = hashStringToSeed(`${rotationSeed}:${placement}:empty`);
    const u = seededUnitFloat(seed);
    const picked = weightedPick(visibleCampaigns, u);
    if (!picked) return rows;

    rows.push({
      type: "ad",
      key: `ad:${picked.id}:0`,
      ad: picked,
      placement,
    });

    return rows;
  }

  let adCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    rows.push({ type: "post", key: `post:${getPostId(post)}`, post });

    const index1 = i + 1;
    if (everyN <= 0) continue;

    const atSlot = index1 % everyN === 0;
    if (!atSlot) continue;
    if (!visibleCampaigns.length) continue;
    if (adCount >= maxAdsPerPage) continue;

    const slot = Math.floor(i / everyN);
    const seed = hashStringToSeed(`${rotationSeed}:${placement}:${slot}`);
    const u = seededUnitFloat(seed);
    const picked = weightedPick(visibleCampaigns, u);
    if (!picked) continue;

    rows.push({
      type: "ad",
      key: `ad:${picked.id}:${slot}`,
      ad: picked,
      placement,
    });

    adCount += 1;
  }

  // If feed length is below insertion interval, make sure at least one ad can still surface.
  if (adCount === 0 && visibleCampaigns.length > 0 && maxAdsPerPage > 0) {
    const slot = 0;
    const seed = hashStringToSeed(`${rotationSeed}:${placement}:fallback`);
    const u = seededUnitFloat(seed);
    const picked = weightedPick(visibleCampaigns, u);

    if (picked) {
      rows.push({
        type: "ad",
        key: `ad:${picked.id}:${slot}`,
        ad: picked,
        placement,
      });
    }
  }

  return rows;
}