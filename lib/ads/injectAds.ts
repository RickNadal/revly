import type { Ad, AdRules, FeedAdItem, InjectedFeedItem } from "./types";

type InjectOptions<TPost> = {
  posts: TPost[];
  getPostId: (p: TPost) => string;
  ads: Ad[];
  rules: AdRules;
  // optional: stable rotation seed per user/session
  seed?: string;
  // optional: skip ads already shown this session
  seenAdIds?: Set<string>;
};

function stableHash(input: string): number {
  // tiny deterministic hash
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickAd(ads: Ad[], index: number, seed?: string, seenAdIds?: Set<string>): Ad | null {
  if (!ads.length) return null;

  const usable = seenAdIds ? ads.filter(a => !seenAdIds.has(a.id)) : ads;
  if (!usable.length) return null;

  const base = `${seed ?? "seed"}:${index}`;
  const h = stableHash(base);
  return usable[h % usable.length] ?? null;
}

export function injectAds<TPost>(opts: InjectOptions<TPost>): InjectedFeedItem<TPost>[] {
  const { posts, getPostId, ads, rules, seed, seenAdIds } = opts;
  const out: InjectedFeedItem<TPost>[] = [];

  const maxAds = rules.maxAdsPerPage ?? Infinity;
  let injectedCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    out.push({
      type: "post",
      key: `post:${getPostId(post)}`,
      post,
    });

    const postIndex1 = i + 1;

    const canStart = postIndex1 >= rules.startAfter;
    const atInterval = rules.everyN > 0 && postIndex1 % rules.everyN === 0;

    if (!canStart || !atInterval) continue;
    if (injectedCount >= maxAds) continue;

    const ad = pickAd(ads, injectedCount, seed, seenAdIds);
    if (!ad) continue;

    const adItem: FeedAdItem = {
      type: "ad",
      key: `ad:${ad.id}`,
      ad,
      placement: rules.placement,
    };

    out.push(adItem);
    injectedCount += 1;

    if (seenAdIds) seenAdIds.add(ad.id);
  }

  return out;
}