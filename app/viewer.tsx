// app/viewer.tsx
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    PanResponder,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";
import { PinchGestureHandler, State, TapGestureHandler } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isVideoUrl } from "../components/media/MediaThumbnail";
import AnimatedSelectableButton from "../components/ui/AnimatedSelectableButton";
import { supabase } from "../lib/supabase";

type ViewerParams = {
  urls?: string;
  url?: string;
  index?: string;
  clips?: string;
  postId?: string;
  ownerId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  media?: string;
  canDelete?: string;
  likeCount?: string;
  commentCount?: string;
  likedByMe?: string;
};

type MediaRow = {
  url: string;
  sort_order?: number;
};

type ClipFeedItem = {
  url: string;
  postId: string;
  ownerId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  canDelete?: boolean;
  likeCount?: number;
  commentCount?: number;
  likedByMe?: boolean;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const COLORS = {
  text: "#fff",
  muted: "rgba(255,255,255,0.75)",
  card: "rgba(20,20,28,0.98)",
  border: "rgba(255,255,255,0.14)",
  chip: "rgba(255,255,255,0.10)",
  dangerBg: "rgba(255,60,60,0.18)",
  dangerBorder: "rgba(255,60,60,0.28)",
  btnBg: "rgba(255,255,255,0.12)",
  btnBorder: "rgba(255,255,255,0.18)",
};

function parseUrls(raw?: string | null): string[] {
  const v = raw?.trim();
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolLike(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function parseClipFeed(raw?: string | null): ClipFeedItem[] {
  const source = raw?.trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => {
        const url = String(item?.url ?? "").trim();
        const postId = String(item?.postId ?? "").trim();
        if (!url || !postId) return null;
        return {
          url,
          postId,
          ownerId: String(item?.ownerId ?? "").trim() || undefined,
          authorName: String(item?.authorName ?? "").trim() || undefined,
          authorAvatarUrl: String(item?.authorAvatarUrl ?? "").trim() || undefined,
          canDelete: parseBoolLike(item?.canDelete),
          likeCount: Number.isFinite(Number(item?.likeCount)) ? Math.max(0, Number(item?.likeCount)) : 0,
          commentCount: Number.isFinite(Number(item?.commentCount)) ? Math.max(0, Number(item?.commentCount)) : 0,
          likedByMe: parseBoolLike(item?.likedByMe),
        } as ClipFeedItem;
      })
      .filter((item): item is ClipFeedItem => !!item);
  } catch {
    return [];
  }
}

function guessStoragePathFromPublicUrl(_publicUrl: string): string | null {
  return null;
}

function looksLikeHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function isDuplicateKeyError(err: any) {
  const code = err?.code ?? err?.error_code ?? err?.statusCode ?? err?.status_code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (String(code) === "23505") return true;
  if (msg.includes("duplicate key") || msg.includes("unique") || msg.includes("already exists")) return true;
  return false;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ZoomableImage({
  uri,
  isActive,
  onZoomStateChange,
}: {
  uri: string;
  isActive: boolean;
  onZoomStateChange: (zoomed: boolean) => void;
}) {
  const pinchRef = useRef<any>(null);
  const doubleTapRef = useRef<any>(null);
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const lastScaleRef = useRef(1);

  const animateToScale = useCallback(
    (nextScale: number, animate: boolean = true) => {
      const clampedScale = clamp(nextScale, 1, 4);
      lastScaleRef.current = clampedScale;
      baseScale.stopAnimation();
      pinchScale.setValue(1);

      if (animate) {
        Animated.timing(baseScale, {
          toValue: clampedScale,
          duration: 140,
          useNativeDriver: true,
        }).start();
      } else {
        baseScale.setValue(clampedScale);
      }

      onZoomStateChange(clampedScale > 1.01);
    },
    [baseScale, onZoomStateChange, pinchScale]
  );

  const resetZoom = useCallback(() => {
    lastScaleRef.current = 1;
    pinchScale.setValue(1);
    baseScale.setValue(1);
    onZoomStateChange(false);
  }, [baseScale, onZoomStateChange, pinchScale]);

  useEffect(() => {
    if (!isActive) {
      resetZoom();
    }
  }, [isActive, resetZoom]);

  const onPinchGestureEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], {
    useNativeDriver: true,
  });

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    const nextScale = lastScaleRef.current * Number(event.nativeEvent.scale ?? 1);
    // Commit immediately on pinch release to avoid a visible snap/fl ash frame.
    animateToScale(nextScale, false);
  };

  const onDoubleTapStateChange = (event: any) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    animateToScale(lastScaleRef.current > 1.01 ? 1 : 2.5);
  };

  return (
    <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTapStateChange}>
      <Animated.View style={styles.zoomViewport}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={doubleTapRef}
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchStateChange}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

function ViewerVideo({ uri, isActive, isMuted, isPaused }: { uri: string; isActive: boolean; isMuted: boolean; isPaused: boolean }) {
  const videoRef = useRef<Video | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isActive || isPaused) {
      void video.pauseAsync().catch(() => {});
      return;
    }
    void video.playAsync().catch(() => {});
  }, [isActive, isPaused]);

  return (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={styles.image}
      resizeMode={ResizeMode.CONTAIN}
      useNativeControls={false}
      shouldPlay={isActive && !isPaused}
      isMuted={isMuted}
      isLooping
      onLoad={() => {
        if (isActive && !isPaused) {
          void videoRef.current?.playAsync().catch(() => {});
        }
      }}
    />
  );
}

export default function ViewerScreen() {
  const params = useLocalSearchParams<ViewerParams>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);

  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

  const fallbackPostId = (params.postId ?? "").trim();
  const fallbackOwnerId = (params.ownerId ?? "").trim();
  const fallbackAuthorName = (params.authorName ?? "").trim();
  const fallbackAuthorAvatarUrl = (params.authorAvatarUrl ?? "").trim();
  const fallbackLikeCount = Number.parseInt((params.likeCount ?? "0").trim(), 10);
  const fallbackCommentCount = Number.parseInt((params.commentCount ?? "0").trim(), 10);
  const fallbackLikedByMe = parseBoolLike(params.likedByMe ?? "");

  const fallbackCanDelete = useMemo(() => parseBoolLike(params.canDelete ?? ""), [params.canDelete]);

  const clipFeed = useMemo<ClipFeedItem[]>(() => parseClipFeed(params.clips), [params.clips]);
  const hasClipFeed = clipFeed.length > 0;
  const isVerticalClipFeed = hasClipFeed;

  const media = useMemo<MediaRow[]>(() => {
    const raw = params.media?.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x: any) => ({
            url: String(x?.url ?? ""),
            sort_order: typeof x?.sort_order === "number" ? x.sort_order : undefined,
          }))
          .filter((x) => !!x.url);
      }
    } catch {}
    return [];
  }, [params.media]);

  const images = useMemo<string[]>(() => {
    if (hasClipFeed) return clipFeed.map((item) => item.url).filter(Boolean);
    if (media.length) return media.map((m) => m.url).filter(Boolean);

    const rawUrls = params.urls?.trim();
    if (rawUrls) return parseUrls(rawUrls);

    if (params.url?.trim()) return [params.url.trim()];
    return [];
  }, [clipFeed, hasClipFeed, media, params.urls, params.url]);

  const initialIndex = useMemo(() => {
    const n = Number(params.index ?? "0");
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, Math.max(0, images.length - 1)));
  }, [params.index, images.length]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [clipMuted, setClipMuted] = useState(true);
  const [clipPaused, setClipPaused] = useState(false);
  const [likeCount, setLikeCount] = useState(Number.isFinite(fallbackLikeCount) ? Math.max(0, fallbackLikeCount) : 0);
  const [commentCount, setCommentCount] = useState(Number.isFinite(fallbackCommentCount) ? Math.max(0, fallbackCommentCount) : 0);
  const [likedByMe, setLikedByMe] = useState(fallbackLikedByMe);
  const [liking, setLiking] = useState(false);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const zoomedRef = useRef(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other"
  >("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  const activeClip = hasClipFeed ? clipFeed[activeIndex] : undefined;
  const postId = activeClip?.postId ?? fallbackPostId;
  const ownerId = activeClip?.ownerId ?? fallbackOwnerId;
  const authorName = activeClip?.authorName ?? fallbackAuthorName;
  const authorAvatarUrl = activeClip?.authorAvatarUrl ?? fallbackAuthorAvatarUrl;
  const canDelete = activeClip?.canDelete ?? fallbackCanDelete;

  const canReport = !!postId;
  const isClipActive = !!postId && isVideoUrl(images[activeIndex] ?? "");
  const canDeleteInViewer = canDelete && !hasClipFeed;

  useEffect(() => {
    if (!hasClipFeed || !activeClip) return;
    setLikeCount(Number.isFinite(activeClip.likeCount) ? Math.max(0, Number(activeClip.likeCount)) : 0);
    setCommentCount(Number.isFinite(activeClip.commentCount) ? Math.max(0, Number(activeClip.commentCount)) : 0);
    setLikedByMe(!!activeClip.likedByMe);
  }, [activeClip, hasClipFeed]);

  const refreshEngagement = useCallback(async () => {
    if (!postId) return;

    const [{ count: likesCount }, { count: commentsCount }, sessionRes] = await Promise.all([
      supabase.from("likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
      supabase.auth.getSession(),
    ]);

    if (typeof likesCount === "number") setLikeCount(Math.max(0, likesCount));
    if (typeof commentsCount === "number") setCommentCount(Math.max(0, commentsCount));

    const me = sessionRes.data.session?.user?.id;
    if (!me) {
      setLikedByMe(false);
      return;
    }

    const { data: existingLike } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", me)
      .maybeSingle();

    setLikedByMe(!!existingLike?.id);
  }, [postId]);

  useEffect(() => {
    void refreshEngagement();
  }, [refreshEngagement]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (images.length > 1 && initialIndex > 0) {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [images.length, initialIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = isVerticalClipFeed ? e.nativeEvent.contentOffset.y : e.nativeEvent.contentOffset.x;
    const pageSize = isVerticalClipFeed ? SCREEN_HEIGHT : SCREEN_WIDTH;
    const next = Math.round(offset / pageSize);
    setActiveIndex(Math.max(0, Math.min(next, images.length - 1)));
    setZoomedIndex(null);
    setClipPaused(false);
  };

  useEffect(() => {
    zoomedRef.current = zoomedIndex !== null && zoomedIndex === activeIndex;
  }, [activeIndex, zoomedIndex]);

  const close = () => {
    const nav = router as any;

    if (typeof nav.dismiss === "function" && (typeof nav.canDismiss !== "function" || nav.canDismiss())) {
      nav.dismiss();
      return;
    }

    if (typeof nav.canGoBack === "function" && nav.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)");
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        if (isVerticalClipFeed) return false;
        if (zoomedRef.current || gesture.numberActiveTouches > 1) return false;

        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);

        if (absDx < 6 && absDy < 6) return false;

        return absDy > absDx * 1.2;
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        backdropOpacity.stopAnimation();
      },
      onPanResponderMove: (_evt, gesture) => {
        if (isVerticalClipFeed) return;
        const dy = Math.max(0, gesture.dy);
        translateY.setValue(dy);

        const fade = 1 - Math.min(dy / 320, 0.7);
        backdropOpacity.setValue(fade);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (isVerticalClipFeed) return;
        const dy = Math.max(0, gesture.dy);
        const vy = gesture.vy;

        const shouldDismiss = dy > 95 || vy > 0.9;

        if (shouldDismiss) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 210,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 170,
              useNativeDriver: true,
            }),
          ]).start(() => close());
          return;
        }

        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 260,
            mass: 0.9,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  const renderItem = ({ item, index }: { item: string; index: number }) => (
    <View style={[styles.page, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}>
      {isVideoUrl(item) ? (
        Math.abs(index - activeIndex) <= 1 ? (
          <Pressable style={{ flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} onPress={() => setClipPaused((p) => !p)}>
            <ViewerVideo uri={item} isActive={index === activeIndex} isMuted={clipMuted} isPaused={clipPaused} />
          </Pressable>
        ) : (
          <View style={{ flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: "#000" }} />
        )
      ) : (
        <ZoomableImage
          uri={item}
          isActive={index === activeIndex}
          onZoomStateChange={(zoomed) => {
            setZoomedIndex((current) => {
              if (zoomed) return index;
              return current === index ? null : current;
            });
          }}
        />
      )}
    </View>
  );

  async function deleteFromDbOnly(urlToDelete: string) {
    if (!postId) throw new Error("Missing postId for delete.");

    const { error } = await supabase
      .from("post_media")
      .delete()
      .eq("post_id", postId)
      .eq("url", urlToDelete);

    if (error) throw new Error(error.message);
  }

  async function deleteAllFromDbOnly() {
    if (!postId) throw new Error("Missing postId for delete.");
    const { error } = await supabase.from("post_media").delete().eq("post_id", postId);
    if (error) throw new Error(error.message);
  }

  async function deletePostOnly() {
    if (!postId) throw new Error("Missing postId for delete.");
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) throw new Error(error.message);
  }

  async function tryDeleteFromStorage(maybePathOrUrl: string) {
    if (looksLikeHttpUrl(maybePathOrUrl)) return;

    const path = maybePathOrUrl.trim();
    if (!path) return;

    const BUCKET = "post-media";

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.log("STORAGE DELETE FAILED:", error.message);
    }
  }

  const handleDeleteCurrent = () => {
    if (!canDeleteInViewer || busy) return;

    const urlToDelete = images[activeIndex];
    if (!urlToDelete) return;

    Alert.alert(
      "Delete photo?",
      "This will remove this photo from the post.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);

              await deleteFromDbOnly(urlToDelete);
              if (images.length <= 1) {
                await deletePostOnly();
              }
              await tryDeleteFromStorage(urlToDelete);

              close();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Unknown error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleDeleteAll = () => {
    if (!canDeleteInViewer || busy) return;

    Alert.alert(
      "Delete all photos?",
      "This will remove ALL photos from this post. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);

              await deleteAllFromDbOnly();
              await deletePostOnly();

              for (const u of images) {
                await tryDeleteFromStorage(u);
              }

              close();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Unknown error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openReport = () => {
    if (!canReport) {
      Alert.alert("Report unavailable", "This item can’t be reported from here.");
      return;
    }
    setReportReason("spam");
    setReportDetails("");
    setReportOpen(true);
  };

  const closeReport = () => setReportOpen(false);

  const openMessage = () => {
    if (!ownerId) {
      Alert.alert("Cannot message", "Profile owner information is not available.");
      return;
    }
    router.push({ pathname: "/messages", params: { id: ownerId } });
  };

  const openComments = () => {
    if (!postId) return;
    router.push({ pathname: "/post", params: { id: postId } });
  };

  const openAuthorProfile = () => {
    if (!ownerId) return;
    router.push({ pathname: "/rider", params: { id: ownerId } });
  };

  const toggleLike = async () => {
    if (!postId || liking) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }

    const me = session.user.id;
    const nextLiked = !likedByMe;
    setLiking(true);
    setLikedByMe(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));

    try {
      if (nextLiked) {
        const { error } = await supabase.from("likes").upsert({ post_id: postId, user_id: me }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", me);
        if (error) throw error;
      }
    } catch (e: any) {
      setLikedByMe(!nextLiked);
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)));
      Alert.alert("Like failed", e?.message ?? "Could not update like right now.");
    } finally {
      setLiking(false);
    }
  };

  const submitReport = async () => {
    if (!postId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      closeReport();
      router.replace("/sign-in");
      return;
    }

    setReporting(true);
    try {
      const payload = {
        post_id: postId,
        reporter_id: session.user.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
        status: "open",
      };

      const { error } = await supabase.from("post_reports").insert(payload);

      if (error) {
        if (isDuplicateKeyError(error)) {
          closeReport();
          Alert.alert("Already reported", "You’ve already reported this post. Thanks — our team will review it.");
          return;
        }

        Alert.alert("Report failed", error.message);
        return;
      }

      closeReport();
      Alert.alert("Reported", "Thanks — we’ll review this post.");
    } finally {
      setReporting(false);
    }
  };

  const ReasonChip = ({
    label,
    value,
  }: {
    label: string;
    value: "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other";
  }) => {
    const active = reportReason === value;
    return (
      <AnimatedSelectableButton
        label={label}
        active={active}
        onPress={() => setReportReason(value)}
        containerStyle={styles.reasonChip}
        pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
        textStyle={{ fontSize: 12 }}
      />
    );
  };

  if (!images.length) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.topBar, { paddingTop: Math.max(8, insets.top + 6) }]}>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No images to display.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: "#000" }]} />

      <Animated.View style={{ flex: 1, transform: [{ translateY }] }} {...(!isVerticalClipFeed ? panResponder.panHandlers : {})}>
        <View style={[styles.topBar, { paddingTop: Math.max(8, insets.top + 6) }]}>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {canReport ? (
              <Pressable onPress={openReport} style={styles.actionBtn} disabled={reporting || busy}>
                <Text style={styles.actionText}>Report</Text>
              </Pressable>
            ) : null}

            {ownerId ? (
              <Pressable onPress={openMessage} style={styles.actionBtn} disabled={busy}>
                <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                <Text style={styles.actionText}>Message</Text>
              </Pressable>
            ) : null}

            {canDeleteInViewer ? (
              <>
                <Pressable
                  onPress={handleDeleteCurrent}
                  disabled={busy}
                  style={[styles.actionBtn, busy ? { opacity: 0.55 } : null]}
                >
                  <Text style={styles.actionText}>{busy ? "..." : "Delete"}</Text>
                </Pressable>

                {images.length > 1 ? (
                  <Pressable
                    onPress={handleDeleteAll}
                    disabled={busy}
                    style={[styles.actionBtnDanger, busy ? { opacity: 0.55 } : null]}
                  >
                    <Text style={styles.actionText}>All</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {!canDeleteInViewer && !canReport && !ownerId ? <View style={{ width: 44 }} /> : null}
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(u, i) => `${i}:${u}`}
          renderItem={renderItem}
          horizontal={!isVerticalClipFeed}
          pagingEnabled
          scrollEnabled={!zoomedRef.current}
          decelerationRate="fast"
          removeClippedSubviews={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          windowSize={isVerticalClipFeed ? 3 : 5}
          initialNumToRender={isVerticalClipFeed ? 3 : 1}
          maxToRenderPerBatch={isVerticalClipFeed ? 2 : 3}
          updateCellsBatchingPeriod={isVerticalClipFeed ? 60 : 50}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: isVerticalClipFeed ? SCREEN_HEIGHT : SCREEN_WIDTH,
            offset: (isVerticalClipFeed ? SCREEN_HEIGHT : SCREEN_WIDTH) * index,
            index,
          })}
          onScrollToIndexFailed={() => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: initialIndex,
                animated: false,
              });
            }, 30);
          }}
        />

        {images.length > 1 && (
          <View style={styles.dotsWrap} pointerEvents="none">
            {images.map((_, i) => (
              <View key={`dot-${i}`} style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
        )}

        {isClipActive ? (
          <Pressable
            onPress={openAuthorProfile}
            style={[styles.clipAuthorWrap, { top: Math.max(70, insets.top + 56) }]}
          >
            {authorAvatarUrl ? (
              <Image source={{ uri: authorAvatarUrl }} style={styles.clipAuthorAvatar} />
            ) : (
              <View style={[styles.clipAuthorAvatar, styles.clipAuthorAvatarFallback]}>
                <Ionicons name="person" size={16} color="#fff" />
              </View>
            )}
            <Text style={styles.clipAuthorName} numberOfLines={1}>
              {authorName || "Rider"}
            </Text>
          </Pressable>
        ) : null}

        {isClipActive ? (
          <View style={[styles.clipActionsWrap, { bottom: Math.max(30, insets.bottom + 14) }]}>
            <Pressable onPress={toggleLike} style={styles.clipActionBtn} disabled={liking}>
              <Ionicons name={likedByMe ? "heart" : "heart-outline"} size={24} color={likedByMe ? "#FF5A7A" : "#fff"} />
              <Text style={styles.clipActionCount}>{likeCount}</Text>
            </Pressable>

            <Pressable onPress={openComments} style={styles.clipActionBtn}>
              <Ionicons name="chatbubble-outline" size={22} color="#fff" />
              <Text style={styles.clipActionCount}>{commentCount}</Text>
            </Pressable>

            <Pressable onPress={() => setClipMuted((m) => !m)} style={styles.clipActionBtn}>
              <Ionicons name={clipMuted ? "volume-mute" : "volume-medium"} size={22} color="#fff" />
            </Pressable>

            <Pressable onPress={() => setClipPaused((p) => !p)} style={styles.clipActionBtn}>
              <Ionicons name={clipPaused ? "play" : "pause"} size={22} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      <Modal transparent visible={reportOpen} animationType="fade" onRequestClose={closeReport}>
        <Pressable onPress={closeReport} style={styles.modalBackdrop}>
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <View style={{ alignItems: "center", paddingVertical: 6 }}>
              <View style={styles.grabber} />
            </View>

            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Report post</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }} numberOfLines={1}>
              Post: {postId ? postId : "(unknown)"}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>Reason</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <ReasonChip label="Spam" value="spam" />
              <ReasonChip label="Harassment" value="harassment" />
              <ReasonChip label="Nudity" value="nudity" />
              <ReasonChip label="Violence" value="violence" />
              <ReasonChip label="Hate" value="hate" />
              <ReasonChip label="Scam" value="scam" />
              <ReasonChip label="Other" value="other" />
            </View>

            <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>Details (optional)</Text>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Tell us what happened…"
              placeholderTextColor={COLORS.muted}
              multiline
              style={styles.reportInput}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={closeReport} style={[styles.modalBtn, { backgroundColor: COLORS.chip }]}>
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={reporting}
                onPress={submitReport}
                style={[
                  styles.modalBtn,
                  { backgroundColor: "rgba(255,255,255,0.92)" },
                  reporting ? { opacity: 0.6 } : null,
                ]}
              >
                <Text style={{ color: "#000", fontWeight: "900" }}>{reporting ? "Sending…" : "Submit"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 18,
  },
  counterText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
  actionBtn: {
    height: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.btnBg,
    borderWidth: 1,
    borderColor: COLORS.btnBorder,
  },
  actionBtnDanger: {
    height: 44,
    minWidth: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  page: {
    alignItems: "center",
    justifyContent: "center",
  },
  zoomViewport: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  dotsWrap: {
    position: "absolute",
    bottom: 34,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dotActive: {
    backgroundColor: "rgba(255,255,255,0.95)",
    transform: [{ scale: 1.15 }],
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  clipActionsWrap: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 14,
  },
  clipAuthorWrap: {
    position: "absolute",
    left: 12,
    maxWidth: SCREEN_WIDTH * 0.65,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  clipAuthorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  clipAuthorAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  clipAuthorName: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  clipActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  clipActionCount: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    textAlign: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  modalCard: {
    padding: 14,
    paddingBottom: 18,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  reportInput: {
    marginTop: 10,
    minHeight: 84,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(0,0,0,0.35)",
    color: COLORS.text,
    borderRadius: 14,
    padding: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  reasonChip: {
    borderRadius: 999,
  },
});