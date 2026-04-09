import * as VideoThumbnails from "expo-video-thumbnails";
import React, { useEffect, useState } from "react";
import type { DimensionValue } from "react-native";
import { Image, Text, View } from "react-native";

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/i;

export function isVideoUrl(url: string): boolean {
  const value = String(url ?? "").toLowerCase();
  return VIDEO_EXT_RE.test(value) || value.includes("/video/") || value.includes("video/");
}

const thumbCache = new Map<string, string | null>();
const inFlightThumbs = new Map<string, Promise<string | null>>();
const thumbWaiters: Array<() => void> = [];
let activeThumbJobs = 0;
const MAX_CONCURRENT_THUMB_JOBS = 2;

async function acquireThumbSlot() {
  if (activeThumbJobs < MAX_CONCURRENT_THUMB_JOBS) {
    activeThumbJobs += 1;
    return;
  }
  await new Promise<void>((resolve) => thumbWaiters.push(resolve));
  activeThumbJobs += 1;
}

function releaseThumbSlot() {
  activeThumbJobs = Math.max(0, activeThumbJobs - 1);
  const next = thumbWaiters.shift();
  if (next) next();
}

async function getVideoThumb(url: string) {
  if (thumbCache.has(url)) return thumbCache.get(url) ?? null;

  const existing = inFlightThumbs.get(url);
  if (existing) return await existing;

  const task = (async () => {
    await acquireThumbSlot();
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(url, { time: 800 });
      thumbCache.set(url, uri);
      return uri;
    } catch {
      thumbCache.set(url, null);
      return null;
    } finally {
      inFlightThumbs.delete(url);
      releaseThumbSlot();
    }
  })();

  inFlightThumbs.set(url, task);
  return await task;
}

type Props = {
  url: string;
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
  resizeMode?: "cover" | "contain";
};

export const MediaThumbnail = React.memo(function MediaThumbnail({ url, width, height, borderRadius = 0, resizeMode = "cover" }: Props) {
  const [thumbUri, setThumbUri] = useState<string | null>(thumbCache.get(url) ?? null);

  const video = isVideoUrl(url);

  useEffect(() => {
    let alive = true;

    if (!video) {
      setThumbUri(null);
      return () => {
        alive = false;
      };
    }

    (async () => {
      const nextUri = await getVideoThumb(url);
      if (alive) setThumbUri(nextUri);
    })();

    return () => {
      alive = false;
    };
  }, [url, video]);

  if (!video) {
    return <Image source={{ uri: url }} style={{ width, height, borderRadius }} resizeMode={resizeMode} />;
  }

  return (
    <View style={{ width, height, borderRadius, overflow: "hidden", backgroundColor: "#0F0F16", alignItems: "center", justifyContent: "center" }}>
      {thumbUri ? <Image source={{ uri: thumbUri }} style={{ width: "100%", height: "100%" }} resizeMode={resizeMode} /> : null}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", marginLeft: 2 }}>▶</Text>
      </View>
    </View>
  );
});
