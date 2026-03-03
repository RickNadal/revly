// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { SponsoredPostCard } from "../../components/ads/SponsoredPostCard";
import { useMenu } from "../../components/navigation/MenuProvider";
import { useTabBarVisibility } from "../../components/navigation/TabBarVisibility";
import { supabase } from "../../lib/supabase";

import { loadActiveCampaigns } from "../../lib/ads/campaignService";
import { injectSponsoredRows, type FeedRow } from "../../lib/ads/injectSponsoredRows";
import type { SponsoredAd } from "../../lib/ads/sponsoredTypes";
import { nowIso } from "../../lib/ads/utils";

type ProfileRole = "user" | "moderator" | "admin";

type PostRow = {
  id: string;
  caption: string | null;
  visibility: "public" | "private";
  created_at: string;
  user_id: string;
  post_media: { url: string; sort_order: number }[];
  post_type?: string | null;
};

type FeedItem = PostRow & {
  author_name: string;
  author_role?: ProfileRole;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  white: "#FFFFFF",
  black: "#0B0B0F",
  danger: "#FF5A5F",

  sponsorBg: "#12121A",
  sponsorPill: "rgba(255,255,255,0.12)",
  sponsorAccent: "rgba(245,196,81,0.16)",

  adminGold: "#F5C451",
};

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_SIDE_MARGIN = 16;
const CARD_PADDING = 12;

// IMPORTANT: round down to avoid 1px overflow/bleed on some Android builds
const IMAGE_W = Math.floor(SCREEN_W - CARD_SIDE_MARGIN * 2 - CARD_PADDING * 2);
const IMAGE_H = 280;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isDuplicateKeyError(err: any) {
  const code = err?.code ?? err?.error_code ?? err?.statusCode ?? err?.status_code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (String(code) === "23505") return true;
  if (msg.includes("duplicate key") || msg.includes("unique") || msg.includes("already exists")) return true;
  return false;
}

export default function Index() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { openMenu } = useMenu();
  const { hide, show } = useTabBarVisibility();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"discover" | "following">("discover");

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [isPremium, setIsPremium] = useState(false);
  const ADS_ENABLED = true;

  const SPONSORED_EVERY_DISCOVER = 10;
  const SPONSORED_EVERY_FOLLOWING = 18;

  const [hiddenAdIds, setHiddenAdIds] = useState<Set<string>>(() => new Set());
  const [campaigns, setCampaigns] = useState<SponsoredAd[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);

  const [myRole, setMyRole] = useState<ProfileRole>("user");

  // Blocking state
  const [blockedByMe, setBlockedByMe] = useState<Set<string>>(() => new Set());
  const [blockedMe, setBlockedMe] = useState<Set<string>>(() => new Set());

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPost, setMenuPost] = useState<FeedItem | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportPost, setReportPost] = useState<FeedItem | null>(null);
  const [reportReason, setReportReason] = useState<"spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other">("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Prevent mode-switch race conditions (older async load overwriting newer mode)
  const feedReqIdRef = useRef(0);

  // Tab bar hide/show based on scroll direction
  const lastY = useRef(0);
  const lastToggleAt = useRef(0);

  const onFeedScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;

      const now = Date.now();
      if (now - lastToggleAt.current < 90) {
        lastY.current = y;
        return;
      }

      if (y > 40 && dy > 12) {
        hide();
        lastToggleAt.current = now;
      } else if (dy < -12) {
        show();
        lastToggleAt.current = now;
      }

      lastY.current = y;
    },
    [hide, show]
  );

  const loadPremiumFlag = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("is_premium").eq("id", userId).single();
      if (error) {
        if (aliveRef.current) setIsPremium(false);
        return;
      }
      if (aliveRef.current) setIsPremium(!!(data as any)?.is_premium);
    } catch {
      if (aliveRef.current) setIsPremium(false);
    }
  };

  const loadMyRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
      if (error) {
        if (aliveRef.current) setMyRole("user");
        return;
      }
      if (aliveRef.current) setMyRole(((data as any)?.role ?? "user") as ProfileRole);
    } catch {
      if (aliveRef.current) setMyRole("user");
    }
  };

  // Return blocks so we can filter with fresh data even before state updates land
  const fetchBlocks = async (userId: string) => {
    try {
      const [byMe, me] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", userId),
        supabase.from("blocks").select("blocker_id").eq("blocked_id", userId),
      ]);

      const nextBlockedByMe = new Set<string>();
      for (const r of (byMe.data ?? []) as any[]) {
        if (r?.blocked_id) nextBlockedByMe.add(String(r.blocked_id));
      }

      const nextBlockedMe = new Set<string>();
      for (const r of (me.data ?? []) as any[]) {
        if (r?.blocker_id) nextBlockedMe.add(String(r.blocker_id));
      }

      return { nextBlockedByMe, nextBlockedMe };
    } catch {
      return { nextBlockedByMe: new Set<string>(), nextBlockedMe: new Set<string>() };
    }
  };

  const loadBlocks = async (userId: string) => {
    const { nextBlockedByMe, nextBlockedMe } = await fetchBlocks(userId);
    if (aliveRef.current) {
      setBlockedByMe(nextBlockedByMe);
      setBlockedMe(nextBlockedMe);
    }
  };

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/sign-in");
      return;
    }
    const uid = data.session.user.id;
    setMyUserId(uid);
    await Promise.all([loadPremiumFlag(uid), loadMyRole(uid), loadBlocks(uid)]);
  };

  useFocusEffect(
    useCallback(() => {
      ensureAuth();
    }, [])
  );

  const fetchPostsForMainFeed = async (activeMode: "discover" | "following", me: string, followingIds: string[]) => {
    try {
      let q1 = supabase
        .from("posts")
        .select("id, caption, visibility, created_at, user_id, post_type, post_media(url, sort_order)")
        .order("created_at", { ascending: false })
        .limit(50)
        .eq("post_type", "ride");

      if (activeMode === "following") {
        const ids = Array.from(new Set([...followingIds, me]));
        q1 = q1.in("user_id", ids);
      }

      const res1 = await q1;
      if (!res1.error) return res1;
      const msg = String(res1.error.message ?? "").toLowerCase();
      if (!msg.includes("post_type")) return res1;
    } catch {}

    let q2 = supabase
      .from("posts")
      .select("id, caption, visibility, created_at, user_id, post_media(url, sort_order)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (activeMode === "following") {
      const ids = Array.from(new Set([...followingIds, me]));
      q2 = q2.in("user_id", ids);
    }

    return await q2;
  };

  const loadFeed = useCallback(
    async (activeMode: "discover" | "following") => {
      const reqId = ++feedReqIdRef.current;

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/sign-in");
        return;
      }
      const me = session.user.id;
      setMyUserId(me);

      // Pull blocks fresh so filtering is consistent even before state updates
      const [{ nextBlockedByMe, nextBlockedMe }] = await Promise.all([fetchBlocks(me), loadPremiumFlag(me), loadMyRole(me)] as any);

      if (aliveRef.current) {
        setBlockedByMe(nextBlockedByMe);
        setBlockedMe(nextBlockedMe);
      }

      let followingIds: string[] = [];
      if (activeMode === "following") {
        const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", me);
        followingIds = (f ?? []).map((x: any) => x.following_id);
      }

      const { data: posts, error: postErr } = await fetchPostsForMainFeed(activeMode, me, followingIds);

      // If mode changed while loading, ignore this result
      if (reqId !== feedReqIdRef.current) return;

      if (postErr) {
        if (aliveRef.current) setItems([]);
        return;
      }

      const normalizedPosts: PostRow[] = (posts ?? []).map((p: any) => ({
        ...p,
        post_media: (p.post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }));

      // Filter out blocked relationships (both directions) using fresh sets
      const filteredPosts = normalizedPosts.filter((p) => !nextBlockedByMe.has(p.user_id) && !nextBlockedMe.has(p.user_id));

      const postIds = filteredPosts.map((p) => p.id);
      const userIds = Array.from(new Set(filteredPosts.map((p) => p.user_id)));

      const profilesPromise =
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name, role").in("id", userIds)
          : Promise.resolve({ data: [], error: null } as any);

      const likesPromise =
        postIds.length > 0
          ? supabase.from("likes").select("post_id, user_id").in("post_id", postIds)
          : Promise.resolve({ data: [], error: null } as any);

      const commentsPromise =
        postIds.length > 0
          ? supabase.from("comments").select("post_id").in("post_id", postIds)
          : Promise.resolve({ data: [], error: null } as any);

      const [{ data: profs }, { data: likes }, { data: comments }] = await Promise.all([profilesPromise, likesPromise, commentsPromise]);

      // If mode changed while loading, ignore this result
      if (reqId !== feedReqIdRef.current) return;

      const nameById = new Map<string, string>();
      const roleById = new Map<string, ProfileRole>();
      for (const pr of profs ?? []) {
        nameById.set(pr.id, pr.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
        const r = (pr.role ?? "user") as ProfileRole;
        roleById.set(pr.id, r);
      }

      const likeCountByPost = new Map<string, number>();
      const likedByMeSet = new Set<string>();
      for (const l of likes ?? []) {
        likeCountByPost.set(l.post_id, (likeCountByPost.get(l.post_id) ?? 0) + 1);
        if (l.user_id === me) likedByMeSet.add(l.post_id);
      }

      const commentCountByPost = new Map<string, number>();
      for (const c of comments ?? []) {
        commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1);
      }

      const feed: FeedItem[] = filteredPosts.map((p) => ({
        ...p,
        author_name: nameById.get(p.user_id) ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
        author_role: roleById.get(p.user_id) ?? "user",
        like_count: likeCountByPost.get(p.id) ?? 0,
        liked_by_me: likedByMeSet.has(p.id),
        comment_count: commentCountByPost.get(p.id) ?? 0,
      }));

      if (aliveRef.current && reqId === feedReqIdRef.current) setItems(feed);
    },
    [t]
  );

  // Single effect for initial load + mode changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadFeed(mode);
      } finally {
        if (!cancelled && aliveRef.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, loadFeed]);

  const toggleLike = useCallback(
    async (postId: string, currentlyLiked: boolean) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return router.replace("/sign-in");
      const me = session.user.id;

      setItems((prev) =>
        prev.map((it) =>
          it.id === postId ? { ...it, liked_by_me: !currentlyLiked, like_count: Math.max(0, it.like_count + (currentlyLiked ? -1 : 1)) } : it
        )
      );

      if (currentlyLiked) {
        const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", me);
        if (error) Alert.alert(t("feed.unlike_failed_title", { defaultValue: "Unlike failed" }), error.message);
      } else {
        const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: me });
        if (error) Alert.alert(t("feed.like_failed_title", { defaultValue: "Like failed" }), error.message);
      }
    },
    [t]
  );

  const openViewer = useCallback((urls: string[], index: number) => {
    if (!urls || urls.length === 0) return;
    router.push({ pathname: "/viewer", params: { urls: JSON.stringify(urls), index: String(index) } });
  }, []);

  const goToNewPost = useCallback(() => router.push("/new-post"), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFeed(mode), loadAdCampaigns(mode)]);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [mode, loadFeed]);

  // ✅ PERF: keep carousel index in a ref so horizontal scroll does NOT rerender the whole feed
  const carouselIndexRef = useRef<Record<string, number>>({});
  const setCarouselIndex = useCallback((postId: string, idx: number) => {
    carouselIndexRef.current[postId] = idx;
  }, []);
  const getCarouselIndex = useCallback((postId: string) => {
    return carouselIndexRef.current[postId] ?? 0;
  }, []);

  const PostCarousel = useMemo(() => {
    const Comp = React.memo(function PostCarouselInner({ postId, urls }: { postId: string; urls: string[] }) {
      const listRef = useRef<FlatList<string>>(null);

      const safeIndex = clamp(getCarouselIndex(postId), 0, Math.max(0, urls.length - 1));

      useEffect(() => {
        const tt = setTimeout(() => {
          if (urls.length <= 1) return;
          try {
            listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
          } catch {}
        }, 0);
        return () => clearTimeout(tt);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [postId, urls.length]);

      const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = e.nativeEvent.contentOffset.x;
        const idx = clamp(Math.round(x / IMAGE_W), 0, urls.length - 1);
        if (idx !== safeIndex) setCarouselIndex(postId, idx);
      };

      return (
        <View style={{ marginTop: 10 }}>
          <View
            style={{
              width: IMAGE_W,
              height: IMAGE_H,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#0F0F16",
            }}
          >
            <FlatList
              ref={listRef}
              data={urls}
              keyExtractor={(u, i) => `${postId}:${i}:${u}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              snapToInterval={IMAGE_W}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              bounces={false}
              overScrollMode="never"
              nestedScrollEnabled={Platform.OS === "android"}
              onMomentumScrollEnd={onMomentumEnd}
              getItemLayout={(_, index) => ({ length: IMAGE_W, offset: IMAGE_W * index, index })}
              initialScrollIndex={safeIndex}
              onScrollToIndexFailed={() => {
                setTimeout(() => {
                  try {
                    listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
                  } catch {}
                }, 40);
              }}
              // ✅ Press reliability on Android: allow taps even when nested
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => openViewer(urls, index)}
                  onStartShouldSetResponder={() => true}
                  style={{ width: IMAGE_W, height: IMAGE_H }}
                >
                  <Image
                    source={{ uri: item }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                    fadeDuration={Platform.OS === "android" ? 0 : undefined}
                  />
                </Pressable>
              )}
            />

            {urls.length > 1 ? (
              <View
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                }}
                pointerEvents="none"
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  {safeIndex + 1} / {urls.length}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    });

    return Comp;
  }, [getCarouselIndex, openViewer, setCarouselIndex]);

  const handleHideAd = useCallback((adId: string) => {
    setHiddenAdIds((prev) => {
      const next = new Set(prev);
      next.add(adId);
      return next;
    });
  }, []);

  const loggedImpressionsRef = useRef<Set<string>>(new Set());

  const logImpression = useCallback(async (campaignId: string, placement: "discover" | "following") => {
    const key = `${campaignId}:${placement}`;
    if (loggedImpressionsRef.current.has(key)) return;
    loggedImpressionsRef.current.add(key);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      await supabase.from("ad_impressions").insert({
        campaign_id: campaignId,
        user_id: userId,
        placement,
        feed_context: placement,
        viewed_at: nowIso(),
      } as any);
    } catch {}
  }, []);

  const logClick = useCallback(async (campaignId: string, placement: "discover" | "following") => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      await supabase.from("ad_clicks").insert({
        campaign_id: campaignId,
        user_id: userId,
        placement,
        feed_context: placement,
        clicked_at: nowIso(),
      } as any);
    } catch {}
  }, []);

  const openPostMenu = useCallback((post: FeedItem) => {
    setMenuPost(post);
    setMenuOpen(true);
  }, []);

  const closePostMenu = useCallback(() => {
    setMenuOpen(false);
    setTimeout(() => setMenuPost(null), 120);
  }, []);

  const isMine = useMemo(() => {
    if (!menuPost || !myUserId) return false;
    return menuPost.user_id === myUserId;
  }, [menuPost, myUserId]);

  const isModOrAdmin = myRole === "moderator" || myRole === "admin";

  const isBlocked = useMemo(() => {
    if (!menuPost) return false;
    return blockedByMe.has(menuPost.user_id);
  }, [menuPost, blockedByMe]);

  const blockUser = async (targetUserId: string) => {
    closePostMenu();
    if (!myUserId) return;

    try {
      const { error } = await supabase.from("blocks").insert({ blocker_id: myUserId, blocked_id: targetUserId } as any);
      if (error) {
        if (!isDuplicateKeyError(error)) {
          Alert.alert(t("common.error", { defaultValue: "Error" }), error.message);
          return;
        }
      }

      await loadBlocks(myUserId);
      await loadFeed(mode);

      Alert.alert(t("common.done", { defaultValue: "Done" }), t("common.user_blocked", { defaultValue: "User blocked." }));
    } catch (e: any) {
      Alert.alert(t("common.error", { defaultValue: "Error" }), e?.message ?? "Unknown error");
    }
  };

  const unblockUser = async (targetUserId: string) => {
    closePostMenu();
    if (!myUserId) return;

    try {
      const { error } = await supabase.from("blocks").delete().eq("blocker_id", myUserId).eq("blocked_id", targetUserId);
      if (error) {
        Alert.alert(t("common.error", { defaultValue: "Error" }), error.message);
        return;
      }

      await loadBlocks(myUserId);
      await loadFeed(mode);

      Alert.alert(t("common.done", { defaultValue: "Done" }), t("common.user_unblocked", { defaultValue: "User unblocked." }));
    } catch (e: any) {
      Alert.alert(t("common.error", { defaultValue: "Error" }), e?.message ?? "Unknown error");
    }
  };

  const banUser = async (targetUserId: string) => {
    closePostMenu();
    Alert.alert(
      t("mod.ban_user_title", { defaultValue: "Ban user?" }),
      t("mod.ban_user_body", { defaultValue: "This will ban the user (moderator action)." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("mod.ban", { defaultValue: "Ban" }),
          style: "destructive",
          onPress: async () => {
            try {
              const rpc = await supabase.rpc("mod_ban_user", { target_user: targetUserId } as any);
              if (rpc.error) {
                const upd = await supabase.from("profiles").update({ is_banned: true, banned_at: new Date().toISOString() } as any).eq("id", targetUserId);
                if (upd.error) throw upd.error;
              }

              Alert.alert(t("mod.banned_title", { defaultValue: "Banned" }), t("mod.banned_body", { defaultValue: "User has been banned." }));
              await loadFeed(mode);
            } catch (e: any) {
              Alert.alert(t("mod.ban_failed_title", { defaultValue: "Ban failed" }), e?.message ?? "Unknown error");
            }
          },
        },
      ]
    );
  };

  const deleteOwnPost = async (postId: string) => {
    closePostMenu();
    Alert.alert(t("feed.delete_post_title", { defaultValue: "Delete post?" }), t("feed.delete_post_body", { defaultValue: "This cannot be undone." }), [
      { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
      {
        text: t("common.delete", { defaultValue: "Delete" }),
        style: "destructive",
        onPress: async () => {
          setItems((prev) => prev.filter((p) => p.id !== postId));
          const { error } = await supabase.from("posts").delete().eq("id", postId);
          if (error) {
            Alert.alert(t("feed.delete_failed_title", { defaultValue: "Delete failed" }), error.message);
            await loadFeed(mode);
          }
        },
      },
    ]);
  };

  const removePostAsMod = async (postId: string) => {
    closePostMenu();
    Alert.alert(t("mod.remove_post_title", { defaultValue: "Remove post?" }), t("mod.remove_post_body", { defaultValue: "This will delete the post (moderator action)." }), [
      { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
      {
        text: t("mod.remove", { defaultValue: "Remove" }),
        style: "destructive",
        onPress: async () => {
          setItems((prev) => prev.filter((p) => p.id !== postId));
          const { error } = await supabase.rpc("mod_delete_post", { target_post: postId });
          if (error) {
            Alert.alert(t("mod.remove_failed_title", { defaultValue: "Remove failed" }), error.message);
            await loadFeed(mode);
            return;
          }
        },
      },
    ]);
  };

  const openReport = (post: FeedItem) => {
    closePostMenu();
    setReportPost(post);
    setReportReason("spam");
    setReportDetails("");
    setReportOpen(true);
  };

  const closeReport = () => {
    setReportOpen(false);
    setTimeout(() => setReportPost(null), 120);
  };

  const submitReport = async () => {
    if (!reportPost) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      closeReport();
      router.replace("/sign-in");
      return;
    }

    const reporterId = session.user.id;

    setReporting(true);
    try {
      const payload = {
        post_id: reportPost.id,
        reporter_id: reporterId,
        reason: reportReason,
        details: reportDetails.trim() || null,
        status: "open",
      };

      const { error } = await supabase.from("post_reports").insert(payload);

      if (error) {
        if (isDuplicateKeyError(error)) {
          closeReport();
          Alert.alert(
            t("report.already_reported_title", { defaultValue: "Already reported" }),
            t("report.already_reported_body", { defaultValue: "You’ve already reported this post. Thanks — our team will review it." })
          );
          return;
        }
        Alert.alert(t("report.failed_title", { defaultValue: "Report failed" }), error.message);
        return;
      }

      closeReport();
      Alert.alert(t("report.reported_title", { defaultValue: "Reported" }), t("report.reported_body", { defaultValue: "Thanks — we’ll review this post." }));
    } finally {
      setReporting(false);
    }
  };

  const fallbackAdTemplates = useMemo<SponsoredAd[]>(
    () => [
      {
        id: "house-decazi",
        sponsor_name: "Decazi.com",
        sponsor_tag: t("ads.badge_house", { defaultValue: "House Sponsor" }),
        title: t("ads.house_title", { defaultValue: "Funding the build 💍" }),
        body: t("ads.house_body", { defaultValue: "Oranga is funded by Decazi.com. Support the project — discover custom-made pieces and limited drops." }),
        cta: t("ads.house_cta", { defaultValue: "Explore Decazi" }),
        route: "/advertise",
        image_url: null,
        weight: 10,
      },
      {
        id: "sponsor-advertise",
        sponsor_name: t("ads.partner_name", { defaultValue: "Oranga Partners" }),
        sponsor_tag: t("ads.badge_sponsored", { defaultValue: "Sponsored" }),
        title: t("ads.partner_title", { defaultValue: "Advertise on Oranga" }),
        body: t("ads.partner_body", { defaultValue: "Own a shop or event? Reach riders in your city with sponsored placements that still feel native." }),
        cta: t("ads.partner_cta", { defaultValue: "Advertise" }),
        route: "/advertise",
        image_url: null,
        weight: 3,
      },
    ],
    [t]
  );

  const loadAdCampaigns = useCallback(
    async (placement: "discover" | "following") => {
      const { campaigns: loaded } = await loadActiveCampaigns(placement, t);
      if (aliveRef.current) {
        setCampaigns(loaded);
        setCampaignsLoaded(true);
        loggedImpressionsRef.current = new Set();
      }
    },
    [t]
  );

  useEffect(() => {
    loadAdCampaigns(mode);
  }, [mode, loadAdCampaigns]);

  const sponsoredEveryN = mode === "discover" ? SPONSORED_EVERY_DISCOVER : SPONSORED_EVERY_FOLLOWING;
  const effectiveCampaigns = campaignsLoaded && campaigns.length > 0 ? campaigns : fallbackAdTemplates;

  const feedRows = useMemo<FeedRow<FeedItem>[]>(() => {
    if (!ADS_ENABLED || isPremium) {
      return items.map((p) => ({ type: "post", key: `post:${p.id}`, post: p }));
    }

    return injectSponsoredRows({
      posts: items,
      getPostId: (p) => p.id,
      placement: mode,
      everyN: sponsoredEveryN,
      campaigns: effectiveCampaigns,
      hiddenAdIds,
      maxAdsPerPage: mode === "discover" ? 3 : 2,
      rotationSeed: `${mode}:${new Date().toDateString()}`,
    });
  }, [ADS_ENABLED, isPremium, items, mode, sponsoredEveryN, effectiveCampaigns, hiddenAdIds]);

  const ReasonChip = ({ label, value }: { label: string; value: "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other" }) => {
    const active = reportReason === value;
    return (
      <Pressable
        onPress={() => setReportReason(value)}
        hitSlop={6}
        android_ripple={Platform.OS === "android" ? { color: "rgba(255,255,255,0.08)" } : undefined}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 999,
          backgroundColor: active ? COLORS.white : COLORS.chip,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.black : COLORS.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  };

  const Header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={openMenu}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="menu" size={22} color={COLORS.text} />
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Image source={require("../../assets/icon.png")} style={{ width: 168, height: 168 }} resizeMode="contain" />
          <Text style={{ marginTop: -2, color: COLORS.muted, fontWeight: "800" }}>{t("brand.tagline", { defaultValue: "Where bikers connect" })}</Text>
          {isPremium ? (
            <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12 }}>
              {t("common.premium", { defaultValue: "Premium" })}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={goToNewPost}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="add" size={24} color={COLORS.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <Pressable
          onPress={() => setMode("discover")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: mode === "discover" ? COLORS.white : COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
          }}
        >
          <Text style={{ color: mode === "discover" ? COLORS.black : COLORS.text, fontWeight: "900" }}>{t("feed.discover", { defaultValue: "Discover" })}</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("following")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: mode === "following" ? COLORS.white : COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
          }}
        >
          <Text style={{ color: mode === "following" ? COLORS.black : COLORS.text, fontWeight: "900" }}>{t("feed.following", { defaultValue: "Following" })}</Text>
        </Pressable>
      </View>

      <View style={{ height: 10 }} />
    </View>
  );

  const renderAuthorName = useCallback((item: FeedItem) => {
    const isAdmin = item.author_role === "admin";
    const showAdminBadge = isAdmin;
    const nameColor = isAdmin ? COLORS.adminGold : COLORS.text;

    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontWeight: "900", color: nameColor, fontSize: 16 }} numberOfLines={1}>
          {item.author_name}
        </Text>

        {showAdminBadge ? <Ionicons name="star" size={16} color={COLORS.adminGold} /> : null}
      </View>
    );
  }, []);

  // Report sheet keyboard behavior
  const kbBehavior = Platform.OS === "ios" ? "padding" : "height";
  const kbOffset = Platform.OS === "ios" ? insets.top + 8 : 0;

  // --- Post options sheet swipe-down to close + safe area padding ---
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dx) < 20,
      onPanResponderMove: (_evt, gesture) => {
        const dy = Math.max(0, gesture.dy);
        sheetTranslateY.setValue(dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const dy = gesture.dy;
        const vy = gesture.vy;

        if (dy > 90 || vy > 1.2) {
          Animated.timing(sheetTranslateY, { toValue: 260, duration: 120, useNativeDriver: true }).start(() => {
            sheetTranslateY.setValue(0);
            closePostMenu();
          });
          return;
        }

        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const renderRow = useCallback(
    ({ item: row }: { item: FeedRow<FeedItem> }) => {
      if (row.type === "ad") {
        return (
          <SponsoredPostCard
            ad={row.ad}
            placement={row.placement}
            onHide={handleHideAd}
            onImpression={logImpression}
            onPressCta={async (ad) => {
              await logClick(ad.id, row.placement);
              router.push(ad.route);
            }}
          />
        );
      }

      const item = row.post;
      const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);

      return (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            padding: 12,
            borderRadius: 18,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Pressable onPress={() => router.push({ pathname: "/rider", params: { id: item.user_id } })} style={{ flex: 1 }}>
              {renderAuthorName(item)}
            </Pressable>

            <Pressable
              onPress={() => openPostMenu(item)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
                justifyContent: "center",
              }}
              hitSlop={10}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.text} />
            </Pressable>
          </View>

          <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
            {item.visibility === "private" ? t("feed.private", { defaultValue: "Private" }) : t("feed.public", { defaultValue: "Public" })} ·{" "}
            {new Date(item.created_at).toLocaleString()}
          </Text>

          {urls.length > 0 ? <PostCarousel postId={item.id} urls={urls} /> : null}

          {item.caption ? <Text style={{ marginTop: 10, fontSize: 16, color: COLORS.text }}>{item.caption}</Text> : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => toggleLike(item.id, item.liked_by_me)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: item.liked_by_me ? COLORS.white : COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons name={item.liked_by_me ? "heart" : "heart-outline"} size={18} color={item.liked_by_me ? COLORS.black : COLORS.text} />
              <Text style={{ color: item.liked_by_me ? COLORS.black : COLORS.text, fontWeight: "900" }}>{item.like_count}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push({ pathname: "/post", params: { id: item.id } })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={COLORS.text} />
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.comment_count}</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            {urls.length > 0 ? (
              <Pressable
                onPress={() => openViewer(urls, getCarouselIndex(item.id))}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: COLORS.chip,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.view", { defaultValue: "View" })}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [PostCarousel, getCarouselIndex, handleHideAd, logClick, logImpression, openPostMenu, openViewer, renderAuthorName, t, toggleLike]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <FlatList
        key={mode}
        data={feedRows}
        extraData={mode}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={Header}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        // ✅ perf: helps Android long lists
        removeClippedSubviews={Platform.OS === "android"}
        windowSize={9}
        initialNumToRender={7}
        maxToRenderPerBatch={7}
        updateCellsBatchingPeriod={50}
        nestedScrollEnabled={Platform.OS === "android"}
        onScroll={onFeedScroll}
        scrollEventThrottle={16}
        renderItem={renderRow}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              <Text style={{ color: COLORS.muted }}>{t("common.loading_feed", { defaultValue: "Loading feed…" })}</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              <Text style={{ color: COLORS.muted }}>{t("feed.no_posts_yet", { defaultValue: "No posts yet." })}</Text>
            </View>
          )
        }
      />

      {/* 3-dots Action Menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closePostMenu}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={closePostMenu} style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" }} />
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Animated.View
              {...sheetPanResponder.panHandlers}
              style={{
                transform: [{ translateY: sheetTranslateY }],
                backgroundColor: COLORS.card,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: 14,
                paddingBottom: Math.max(insets.bottom, 14) + 14,
                borderTopWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 10 }}>
                <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" }} />
              </View>

              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{t("feed.post_options", { defaultValue: "Post options" })}</Text>

              <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>
                {menuPost ? menuPost.author_name : ""}
              </Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <Pressable
                  onPress={() => {
                    const p = menuPost;
                    closePostMenu();
                    if (p) router.push({ pathname: "/post", params: { id: p.id } });
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.bg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("feed.open_post", { defaultValue: "Open post" })}</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const p = menuPost;
                    closePostMenu();
                    if (p) router.push({ pathname: "/rider", params: { id: p.user_id } });
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.bg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="person-outline" size={18} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("feed.view_profile", { defaultValue: "View profile" })}</Text>
                </Pressable>

                {!isMine && menuPost ? (
                  isBlocked ? (
                    <Pressable
                      onPress={() => unblockUser(menuPost.user_id)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: COLORS.bg,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons name="lock-open-outline" size={18} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.unblock", { defaultValue: "Unblock user" })}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => blockUser(menuPost.user_id)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: COLORS.bg,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons name="ban-outline" size={18} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.block", { defaultValue: "Block user" })}</Text>
                    </Pressable>
                  )
                ) : null}

                {!isMine && isModOrAdmin && menuPost ? (
                  <Pressable
                    onPress={() => banUser(menuPost.user_id)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: "#2A1114",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="hammer-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("mod.ban_user_action", { defaultValue: "Ban user" })}</Text>
                  </Pressable>
                ) : null}

                {menuPost ? (
                  <Pressable
                    onPress={() => openReport(menuPost)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: COLORS.bg,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="flag-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("report.report", { defaultValue: "Report" })}</Text>
                  </Pressable>
                ) : null}

                {isMine && menuPost ? (
                  <Pressable
                    onPress={() => deleteOwnPost(menuPost.id)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: "#2A1114",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.delete", { defaultValue: "Delete" })}</Text>
                  </Pressable>
                ) : null}

                {!isMine && isModOrAdmin && menuPost ? (
                  <Pressable
                    onPress={() => removePostAsMod(menuPost.id)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: "#2A1114",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("mod.remove_post", { defaultValue: "Remove post" })}</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={closePostMenu}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="close" size={18} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.close", { defaultValue: "Close" })}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal transparent visible={reportOpen} animationType="fade" onRequestClose={closeReport}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={closeReport} style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" }} />

          <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={kbBehavior} keyboardVerticalOffset={kbOffset}>
            <View
              style={{
                backgroundColor: COLORS.card,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                borderTopWidth: 1,
                borderColor: COLORS.border,
                paddingBottom: insets.bottom + 14,
              }}
            >
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>
                <View style={{ alignItems: "center", paddingVertical: 6 }}>
                  <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" }} />
                </View>

                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{t("report.report_post_title", { defaultValue: "Report post" })}</Text>
                <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>
                  {reportPost ? reportPost.author_name : ""}
                </Text>

                <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>{t("report.reason_title", { defaultValue: "Reason" })}</Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <ReasonChip label={t("report.reason_spam", { defaultValue: "Spam" })} value="spam" />
                  <ReasonChip label={t("report.reason_harassment", { defaultValue: "Harassment" })} value="harassment" />
                  <ReasonChip label={t("report.reason_nudity", { defaultValue: "Nudity" })} value="nudity" />
                  <ReasonChip label={t("report.reason_violence", { defaultValue: "Violence" })} value="violence" />
                  <ReasonChip label={t("report.reason_hate", { defaultValue: "Hate" })} value="hate" />
                  <ReasonChip label={t("report.reason_scam", { defaultValue: "Scam" })} value="scam" />
                  <ReasonChip label={t("report.reason_other", { defaultValue: "Other" })} value="other" />
                </View>

                <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>{t("report.details_optional", { defaultValue: "Details (optional)" })}</Text>

                <TextInput
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  placeholder={t("report.details_placeholder", { defaultValue: "Tell us what happened…" })}
                  placeholderTextColor={COLORS.muted}
                  multiline
                  style={{
                    marginTop: 10,
                    minHeight: 84,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.bg,
                    color: COLORS.text,
                    borderRadius: 14,
                    padding: 12,
                    textAlignVertical: "top",
                  }}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={closeReport}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: COLORS.chip,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
                  </Pressable>

                  <Pressable
                    disabled={reporting}
                    onPress={submitReport}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: reporting ? "#777" : COLORS.white,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.black, fontWeight: "900" }}>
                      {reporting ? t("report.sending", { defaultValue: "Sending…" }) : t("report.submit", { defaultValue: "Submit report" })}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}