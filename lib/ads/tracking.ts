import type { AdPlacement } from "./types";

type TrackPayload = {
  adId: string;
  campaignId: string;
  placement: AdPlacement;
};

type Tracker = {
  trackImpression: (p: TrackPayload) => Promise<void>;
  trackClick: (p: TrackPayload) => Promise<void>;
  trackHide: (p: TrackPayload) => Promise<void>;
};

export class ConsoleTracker implements Tracker {
  async trackImpression(p: TrackPayload) {
    // Replace with Supabase insert later
    console.log("[ads] impression", p);
  }
  async trackClick(p: TrackPayload) {
    console.log("[ads] click", p);
  }
  async trackHide(p: TrackPayload) {
    console.log("[ads] hide", p);
  }
}

// Simple in-memory de-dupe so you don’t spam impressions on re-renders.
export class DedupingTracker implements Tracker {
  constructor(private inner: Tracker) {}

  private impressed = new Set<string>();

  async trackImpression(p: TrackPayload) {
    const k = `${p.placement}:${p.adId}`;
    if (this.impressed.has(k)) return;
    this.impressed.add(k);
    await this.inner.trackImpression(p);
  }

  async trackClick(p: TrackPayload) {
    await this.inner.trackClick(p);
  }

  async trackHide(p: TrackPayload) {
    await this.inner.trackHide(p);
  }
}