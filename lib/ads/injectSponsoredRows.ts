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
  if (!posts.length) return rows;

  const visibleCampaigns = campaigns.filter((c) => !hiddenAdIds.has(c.id));
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

  return rows;
}