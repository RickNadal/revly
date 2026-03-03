import type { AdPlacement, AdRules } from "./types";

export const getAdRules = (placement: AdPlacement): AdRules => {
  switch (placement) {
    case "discover_feed":
      return {
        placement,
        everyN: 10,
        startAfter: 3,
        maxAdsPerPage: 3,
        frequencyCaps: { perSessionMaxImpressions: 30 },
      };
    case "following_feed":
      return {
        placement,
        everyN: 25,
        startAfter: 8,
        maxAdsPerPage: 2,
        frequencyCaps: { perSessionMaxImpressions: 10 },
      };
    default:
      return {
        placement,
        everyN: 20,
        startAfter: 5,
        maxAdsPerPage: 2,
        frequencyCaps: { perSessionMaxImpressions: 10 },
      };
  }
};