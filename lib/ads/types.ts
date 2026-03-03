export type AdPlacement = "discover_feed" | "following_feed" | "marketplace" | "community";

export type AdCTA = {
  label: string;
  url: string; // external link or deep link
};

export type AdCreative = {
  id: string;
  headline: string;
  body?: string;
  imageUrl?: string;
  cta?: AdCTA;
};

export type AdCampaign = {
  id: string;
  status: "draft" | "active" | "paused" | "ended";
  priority: number; // higher wins
  startAt?: string; // ISO
  endAt?: string;   // ISO
  placements: AdPlacement[];
  isHouse?: boolean;
};

export type Ad = {
  id: string;
  campaignId: string;
  creative: AdCreative;
  campaign: AdCampaign;
};

export type FeedAdItem = {
  type: "ad";
  key: `ad:${string}`;
  ad: Ad;
  placement: AdPlacement;
};

export type InjectedFeedItem<TPost> =
  | { type: "post"; key: `post:${string}`; post: TPost }
  | FeedAdItem;

export type FrequencyCaps = {
  perSessionMaxImpressions?: number; // basic local cap
  perDayMaxImpressions?: number;     // if you implement server-side checks later
};

export type AdRules = {
  placement: AdPlacement;
  everyN: number; // inject after every N posts
  startAfter: number; // don't inject until at least this many posts
  maxAdsPerPage?: number;
  frequencyCaps?: FrequencyCaps;
};