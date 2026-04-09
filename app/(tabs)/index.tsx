// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    LayoutChangeEvent,
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
import { MediaThumbnail, isVideoUrl } from "../../components/media/MediaThumbnail";
import MentionText from "../../components/MentionText";
import { useMenu } from "../../components/navigation/MenuProvider";
import { useTabBarVisibility } from "../../components/navigation/TabBarVisibility";
import AnimatedSelectableButton from "../../components/ui/AnimatedSelectableButton";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { showError } from "../../lib/toast";

import { loadActiveCampaigns } from "../../lib/ads/campaignService";
import { injectSponsoredRows, type FeedRow } from "../../lib/ads/injectSponsoredRows";
import type { SponsoredAd } from "../../lib/ads/sponsoredTypes";
import { sendPushEvent } from "../../lib/push";

type ProfileRole = "user" | "moderator" | "admin";
type PremiumStyle = "classic" | "aurora" | "sunset" | "electric";
type FeedMode = "discover" | "leaderboard" | "clips" | "following" | "top" | "dealers" | "shop";
type DiscoverSortMode = "recent" | "forYou";

type TopRider = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  premium_style?: PremiumStyle | null;
  is_supporter: boolean;
  role: ProfileRole;
  follower_count: number;
  total_likes: number;
  gift_score?: number;
  score: number;
};

type BigGiftBuzzItem = {
  id: string;
  recipient_id: string;
  recipient_name: string | null;
  gift_emoji: string;
  gift_name: string;
  score_value: number;
};

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
  author_avatar_url?: string | null;
  author_role?: ProfileRole;
  author_is_premium?: boolean;
  author_premium_style?: PremiumStyle;
  author_is_supporter?: boolean;
  author_is_botm_champion?: boolean;
  author_botm_rank?: number;
  author_gifts_count?: number;
  author_latest_gift_emoji?: string;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
};

type ClipViewerFeedItem = {
  url: string;
  postId: string;
  ownerId: string;
  authorName: string;
  authorAvatarUrl: string;
  canDelete: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};
type FeedReactionKind = "fire" | "hundred" | "flabbergasted" | "sadtear" | "laughtears" | "bicep" | "salute";
type FeedReactionCountMap = Record<FeedReactionKind, number>;

const EMPTY_FEED_REACTION_COUNTS: FeedReactionCountMap = {
  fire: 0,
  hundred: 0,
  flabbergasted: 0,
  sadtear: 0,
  laughtears: 0,
  bicep: 0,
  salute: 0,
};

const FEED_REACTION_OPTIONS: Array<{ key: FeedReactionKind; emoji: string }> = [
  { key: "fire", emoji: "🔥" },
  { key: "hundred", emoji: "💯" },
  { key: "flabbergasted", emoji: "😲" },
  { key: "sadtear", emoji: "😢" },
  { key: "laughtears", emoji: "😂" },
  { key: "bicep", emoji: "💪" },
  { key: "salute", emoji: "🫡" },
];

const FEED_REACTION_ORDER: Record<FeedReactionKind, number> = {
  fire: 0,
  hundred: 1,
  flabbergasted: 2,
  sadtear: 3,
  laughtears: 4,
  bicep: 5,
  salute: 6,
};

const GIFT_EMOJI_BY_TYPE: Record<string, string> = {
  fire: "🔥",
  lightning: "⚡",
  diamond: "💎",
  crown: "👑",
  trophy: "🏆",
};

const MAX_VISIBLE_FEED_REACTION_CHIPS = 3;

function parseFeedModeParam(value: string | string[] | undefined): FeedMode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "discover" || raw === "leaderboard" || raw === "clips" || raw === "following" || raw === "top" || raw === "dealers" || raw === "shop") return raw;
  return null;
}

const FEED_LOAD_TIMEOUT_MS = 70000;
const FEED_ENRICH_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  moderatorGreen: "#6AB7FF",
};

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_SIDE_MARGIN = 16;
const CARD_PADDING = 12;

// IMPORTANT: round down to avoid 1px overflow/bleed on some Android builds
const IMAGE_W = Math.floor(SCREEN_W - CARD_SIDE_MARGIN * 2 - CARD_PADDING * 2);
const IMAGE_H = 280;
const CLIPS_COLUMNS = 2;
const CLIPS_GAP = 8;
const CLIPS_SIDE_PADDING = 10;
const CLIP_TILE_W = Math.floor((SCREEN_W - CLIPS_SIDE_PADDING * 2 - CLIPS_GAP * (CLIPS_COLUMNS - 1)) / CLIPS_COLUMNS);
const DEALER_COLUMNS = 2;
const DEALER_GAP = 8;
const DEALER_SIDE_PADDING = 16;
const DEALER_TILE_W = Math.floor((SCREEN_W - DEALER_SIDE_PADDING * 2 - DEALER_GAP * (DEALER_COLUMNS - 1)) / DEALER_COLUMNS);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const DISCOVER_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "your",
  "have",
  "just",
  "ride",
  "rider",
  "bike",
  "bikes",
  "today",
  "about",
  "into",
  "over",
  "under",
  "maar",
  "voor",
  "met",
  "van",
  "een",
  "het",
  "de",
  "dit",
  "dat",
]);

function captionTokens(value: string | null | undefined) {
  const raw = String(value ?? "").toLowerCase();
  return raw
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !DISCOVER_STOP_WORDS.has(t));
}

function premiumPaletteForStyle(style?: string | null) {
  if (style === "aurora") return { text: "#60E8FF", bg: "rgba(96,232,255,0.14)", border: "rgba(96,232,255,0.46)" };
  if (style === "sunset") return { text: "#FFB86A", bg: "rgba(255,184,106,0.14)", border: "rgba(255,184,106,0.46)" };
  if (style === "electric") return { text: "#D29BFF", bg: "rgba(210,155,255,0.14)", border: "rgba(210,155,255,0.46)" };
  return { text: "#FFD36A", bg: "rgba(245,196,81,0.16)", border: "rgba(245,196,81,0.45)" };
}

function isDuplicateKeyError(err: any) {
  const code = err?.code ?? err?.error_code ?? err?.statusCode ?? err?.status_code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (String(code) === "23505") return true;
  if (msg.includes("duplicate key") || msg.includes("unique") || msg.includes("already exists")) return true;
  return false;
}

function isClipPost(post: { post_type?: string | null; post_media?: { url: string }[] }, hasPostType: boolean) {
  if ((post.post_type ?? null) === "clip") return true;
  if (hasPostType) return false;
  const media = post.post_media ?? [];
  if (media.length === 0) return false;
  const videoCount = media.filter((m) => isVideoUrl(m.url)).length;
  const imageCount = media.length - videoCount;
  return videoCount === 1 && imageCount === 0;
}

function isSingleVideoOnly(post: { post_media?: { url: string }[] }) {
  const media = post.post_media ?? [];
  if (media.length === 0) return false;
  const videoCount = media.filter((m) => isVideoUrl(m.url)).length;
  const imageCount = media.length - videoCount;
  return videoCount === 1 && imageCount === 0;
}

async function openAdRoute(rawRoute: string) {
  const route = String(rawRoute ?? "").trim();
  if (!route) return;

  const isHttp = route.startsWith("http://") || route.startsWith("https://");
  const isDomainLike = /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(route);

  if (isHttp || isDomainLike) {
    const url = isHttp ? route : `https://${route}`;
    await Linking.openURL(url);
    return;
  }

  const inAppRoute = route.startsWith("/") ? route : `/${route}`;
  router.push(inAppRoute as any);
}

export default function Index() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { openMenu } = useMenu();
  const { hide, show } = useTabBarVisibility();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const modeFromParams = useMemo(() => parseFeedModeParam(params.mode), [params.mode]);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedMode>(modeFromParams ?? "discover");
  const [discoverSortMode, setDiscoverSortMode] = useState<DiscoverSortMode>("recent");

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumStyle, setPremiumStyle] = useState<PremiumStyle>("classic");
  const ADS_ENABLED = true;

  const HOUSE_SPONSORS_TOGGLE_KEY = "revly_house_sponsors_enabled";
  const HOUSE_SPONSORED_EVERY = 10;
  const SPONSORED_EVERY_DISCOVER = 10;
  const SPONSORED_EVERY_FOLLOWING = 18;
  const [houseSponsorsEnabled, setHouseSponsorsEnabled] = useState(true);

  const [hiddenAdIds, setHiddenAdIds] = useState<Set<string>>(() => new Set());
  const [campaigns, setCampaigns] = useState<SponsoredAd[]>([]);
  const [dealerCampaigns, setDealerCampaigns] = useState<SponsoredAd[]>([]);
  const [shopCampaigns, setShopCampaigns] = useState<SponsoredAd[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [myFeedReactions, setMyFeedReactions] = useState<Record<string, FeedReactionKind>>({});
  const [reactionCountsByPost, setReactionCountsByPost] = useState<Record<string, FeedReactionCountMap>>({});

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
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [topRiders, setTopRiders] = useState<TopRider[]>([]);
  const [topRidersLoading, setTopRidersLoading] = useState(false);
  const [bigGiftBuzz, setBigGiftBuzz] = useState<BigGiftBuzzItem[]>([]);

  const feedListRef = useRef<FlatList<FeedRow<FeedItem>>>(null);
  const modeRef = useRef<FeedMode>(modeFromParams ?? "discover");
  const lastModeRef = useRef<FeedMode>(modeFromParams ?? "discover");
  const discoverSortModeRef = useRef<DiscoverSortMode>("recent");
  const adminNameGlow = useRef(new Animated.Value(0)).current;
  const chipArrowPulse = useRef(new Animated.Value(0)).current;
  const chipScrollRef = useRef<ScrollView>(null);
  const chipScrollXRef = useRef(0);
  const [chipScrollX, setChipScrollX] = useState(0);
  const [chipViewportW, setChipViewportW] = useState(0);
  const [chipContentW, setChipContentW] = useState(0);
  const itemsRef = useRef<FeedItem[]>([]);
  const reactionCountsByPostRef = useRef<Record<string, FeedReactionCountMap>>({});
  const myFeedReactionsRef = useRef<Record<string, FeedReactionKind>>({});
  const focusLoadReqIdRef = useRef(0);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(adminNameGlow, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(adminNameGlow, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [adminNameGlow]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(chipArrowPulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(chipArrowPulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [chipArrowPulse]);

  const adminGlowRadius = adminNameGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 16],
  });

  const adminGlowOpacity = adminNameGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  // Prevent mode-switch race conditions (older async load overwriting newer mode)
  const feedReqIdRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;
    if (!aliveRef.current) return;

    // Prevent stale rows from the previous chip from flashing while the new mode loads.
    setItems([]);
    setReactionCountsByPost({});
    setMyFeedReactions({});
  }, [mode]);

  useEffect(() => {
    discoverSortModeRef.current = discoverSortMode;
  }, [discoverSortMode]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    reactionCountsByPostRef.current = reactionCountsByPost;
  }, [reactionCountsByPost]);

  useEffect(() => {
    myFeedReactionsRef.current = myFeedReactions;
  }, [myFeedReactions]);

  useEffect(() => {
    if (!modeFromParams) return;
    setMode((prev) => (prev === modeFromParams ? prev : modeFromParams));
  }, [modeFromParams]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (chipScrollXRef.current <= 0) return;
      chipScrollRef.current?.scrollTo({ x: chipScrollXRef.current, y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [mode]);

  // Tab bar hide/show based on scroll direction
  const lastY = useRef(0);
  const lastToggleAt = useRef(0);

  const onFeedScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;

      const shouldShowBackToTop = y > 550;
      setShowBackToTop((prev) => (prev === shouldShowBackToTop ? prev : shouldShowBackToTop));

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOUSE_SPONSORS_TOGGLE_KEY);
        if (!alive) return;
        if (raw === null) {
          setHouseSponsorsEnabled(true);
          return;
        }
        setHouseSponsorsEnabled(raw === "1");
      } catch {
        if (alive) setHouseSponsorsEnabled(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const toggleHouseSponsors = useCallback(async () => {
    const next = !houseSponsorsEnabled;
    setHouseSponsorsEnabled(next);
    try {
      await AsyncStorage.setItem(HOUSE_SPONSORS_TOGGLE_KEY, next ? "1" : "0");
    } catch {}
  }, [houseSponsorsEnabled]);

  const disableHouseSponsors = useCallback(async () => {
    setHouseSponsorsEnabled(false);
    try {
      await AsyncStorage.setItem(HOUSE_SPONSORS_TOGGLE_KEY, "0");
    } catch {}
  }, []);

  const loadPremiumFlag = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("is_premium, premium_style").eq("id", userId).single();
      if (error) {
        if (aliveRef.current) {
          setIsPremium(false);
          setPremiumStyle("classic");
        }
        return;
      }
      if (aliveRef.current) {
        setIsPremium(!!(data as any)?.is_premium);
        const style = String((data as any)?.premium_style ?? "classic") as PremiumStyle;
        setPremiumStyle(style === "aurora" || style === "sunset" || style === "electric" ? style : "classic");
      }
    } catch {
      if (aliveRef.current) {
        setIsPremium(false);
        setPremiumStyle("classic");
      }
    }
  };

  const premiumAccentColor = useMemo(() => {
    if (premiumStyle === "aurora") return "#60E8FF";
    if (premiumStyle === "sunset") return "#FFB86A";
    if (premiumStyle === "electric") return "#D29BFF";
    return "rgba(255,255,255,0.65)";
  }, [premiumStyle]);

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
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      const uid = data.session.user.id;
      setMyUserId(uid);
      await Promise.all([loadPremiumFlag(uid), loadMyRole(uid), loadBlocks(uid)]);
    } catch {
      if (aliveRef.current) {
        setFeedLoadError("Kon je sessie niet controleren. Trek omlaag om opnieuw te proberen.");
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      ensureAuth();
    }, [])
  );

  const fetchPostsForMainFeed = async (activeMode: FeedMode, me: string, followingIds: string[]) => {
    const queryVariants = [
      {
        select: "id, caption, visibility, created_at, user_id, post_type, post_media(url, sort_order)",
        hasPostType: true as const,
        hasVisibility: true,
      },
      {
        select: "id, caption, created_at, user_id, post_type, post_media(url, sort_order)",
        hasPostType: true as const,
        hasVisibility: false,
      },
      {
        select: "id, caption, visibility, created_at, user_id, post_media(url, sort_order)",
        hasPostType: false as const,
        hasVisibility: true,
      },
      {
        select: "id, caption, created_at, user_id, post_media(url, sort_order)",
        hasPostType: false as const,
        hasVisibility: false,
      },
    ];

    let lastError: any = null;

    for (const variant of queryVariants) {
      try {
        let query = supabase
          .from("posts")
          .select(variant.select)
          .order("created_at", { ascending: false })
          .limit(activeMode === "clips" ? 120 : activeMode === "top" ? 200 : 50);

        if (variant.hasPostType && activeMode !== "clips" && activeMode !== "top") {
          query = query.eq("post_type", "ride");
        }

        if (activeMode === "following") {
          const ids = Array.from(new Set([...followingIds, me]));
          query = query.in("user_id", ids);
        }

        const result = await query;
        if (!result.error) {
          // Some production datasets have older values in post_type; if filtering by
          // "ride" returns empty, retry broader variants before concluding empty feed.
          if ((result.data?.length ?? 0) === 0 && variant.hasPostType && activeMode !== "clips" && activeMode !== "top") {
            continue;
          }
          return { ...result, hasPostType: variant.hasPostType, hasVisibility: variant.hasVisibility };
        }

        lastError = result.error;
      } catch (error) {
        lastError = error;
      }
    }

    return { data: null, error: lastError, hasPostType: false as const, hasVisibility: false };
  };

  const loadFeed = useCallback(
    async (activeMode: FeedMode) => {
      let baseFeedRendered = false;
      try {
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
        const blocksPromise = fetchBlocks(me);
        void loadPremiumFlag(me);
        void loadMyRole(me);
        const { nextBlockedByMe, nextBlockedMe } = await blocksPromise;

        if (aliveRef.current) {
          setBlockedByMe(nextBlockedByMe);
          setBlockedMe(nextBlockedMe);
        }

        let followingIds: string[] = [];
        if (activeMode === "following" || activeMode === "clips") {
          const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", me);
          followingIds = (f ?? []).map((x: any) => x.following_id);
        }

        const { data: posts, error: postErr, hasPostType } = await fetchPostsForMainFeed(activeMode, me, followingIds);

        // If mode changed while loading, ignore this result
        if (reqId !== feedReqIdRef.current) return;

        if (postErr) {
          if (activeMode === modeRef.current && aliveRef.current) {
            setFeedLoadError(String(postErr.message ?? "Could not load the feed right now."));
          }
          return;
        }

        const normalizedPosts: PostRow[] = (posts ?? [])
        .map((p: any) => ({
          ...p,
          visibility: String(p?.visibility ?? "public") === "private" ? "private" : "public",
          post_media: (p.post_media ?? [])
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .filter((m: any) => String(m?.url ?? "").trim().length > 0),
        }));

        const postsWithMediaCount = normalizedPosts.filter((p: any) => Array.isArray(p.post_media) && p.post_media.length > 0).length;
        if (normalizedPosts.length > 0 && postsWithMediaCount === 0 && activeMode !== "clips") {
          setFeedLoadError("Posts geladen, maar media kon niet worden opgehaald. Controleer Supabase RLS/policies voor post_media en storage.");
        }

        const modeFilteredPosts = normalizedPosts.filter((p) => {
        if (activeMode === "clips") {
          if ((p.post_type ?? null) === "clip") return true;
          return isSingleVideoOnly(p);
        }
        // top mode: exclude clip-only posts, keep rides and multi-media
        if (activeMode === "top") {
          if ((p.post_type ?? null) === "clip") return false;
          if (isSingleVideoOnly(p)) return false;
          return true;
        }
        if ((p.post_type ?? null) === "clip") return false;
        if (isSingleVideoOnly(p)) return false;
        return true;
      });

      // Filter out blocked relationships (both directions) using fresh sets
        let filteredPosts = modeFilteredPosts.filter((p) => !nextBlockedByMe.has(p.user_id) && !nextBlockedMe.has(p.user_id));

        if (activeMode === "clips") {
          const followingSet = new Set(followingIds);
          filteredPosts = [...filteredPosts].sort((a, b) => {
            const af = followingSet.has(a.user_id) ? 1 : 0;
            const bf = followingSet.has(b.user_id) ? 1 : 0;
            if (af !== bf) return bf - af;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        }

        // Reuse known author metadata to avoid flash-to-fallback during refresh.
        const cachedAuthorByUserId = new Map<
          string,
          {
            author_name: string;
            author_avatar_url: string | null;
            author_role: ProfileRole;
            author_is_premium: boolean;
            author_premium_style: PremiumStyle;
            author_is_supporter: boolean;
            author_is_botm_champion: boolean;
            author_botm_rank?: number;
            author_gifts_count: number;
            author_latest_gift_emoji?: string;
          }
        >();

        for (const existing of itemsRef.current) {
          if (!existing?.user_id || cachedAuthorByUserId.has(existing.user_id)) continue;
          cachedAuthorByUserId.set(existing.user_id, {
            author_name: existing.author_name,
            author_avatar_url: existing.author_avatar_url ?? null,
            author_role: existing.author_role ?? "user",
            author_is_premium: !!existing.author_is_premium,
            author_premium_style: existing.author_premium_style ?? "classic",
            author_is_supporter: !!existing.author_is_supporter,
            author_is_botm_champion: !!existing.author_is_botm_champion,
            author_botm_rank: existing.author_botm_rank,
            author_gifts_count: Number(existing.author_gifts_count ?? 0),
            author_latest_gift_emoji: existing.author_latest_gift_emoji,
          });
        }

        const cachedPostById = new Map<string, FeedItem>();
        for (const existing of itemsRef.current) {
          if (!existing?.id || cachedPostById.has(existing.id)) continue;
          cachedPostById.set(existing.id, existing);
        }

        const nextBaseReactionCounts: Record<string, FeedReactionCountMap> = {};
        const nextBaseMyReactions: Record<string, FeedReactionKind> = {};
        for (const post of filteredPosts) {
          const postId = post.id;
          const counts = reactionCountsByPostRef.current[postId];
          if (counts) {
            nextBaseReactionCounts[postId] = { ...counts };
          }
          const mine = myFeedReactionsRef.current[postId];
          if (mine) {
            nextBaseMyReactions[postId] = mine;
          }
        }

        // Render a base feed immediately so enrichment queries can never block visibility.
        let feed: FeedItem[] = filteredPosts.map((p) => ({
          ...p,
          author_name: cachedAuthorByUserId.get(p.user_id)?.author_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
          author_avatar_url: cachedAuthorByUserId.get(p.user_id)?.author_avatar_url ?? null,
          author_role: cachedAuthorByUserId.get(p.user_id)?.author_role ?? "user",
          author_is_premium: cachedAuthorByUserId.get(p.user_id)?.author_is_premium ?? false,
          author_premium_style: cachedAuthorByUserId.get(p.user_id)?.author_premium_style ?? "classic",
          author_is_supporter: cachedAuthorByUserId.get(p.user_id)?.author_is_supporter ?? false,
          author_is_botm_champion: cachedAuthorByUserId.get(p.user_id)?.author_is_botm_champion ?? false,
          author_botm_rank: cachedAuthorByUserId.get(p.user_id)?.author_botm_rank,
          author_gifts_count: cachedAuthorByUserId.get(p.user_id)?.author_gifts_count ?? 0,
          author_latest_gift_emoji: cachedAuthorByUserId.get(p.user_id)?.author_latest_gift_emoji,
          like_count: cachedPostById.get(p.id)?.like_count ?? 0,
          liked_by_me: cachedPostById.get(p.id)?.liked_by_me ?? false,
          comment_count: cachedPostById.get(p.id)?.comment_count ?? 0,
        }));

        const shouldUseDiscoverRanking = activeMode === "discover" && discoverSortModeRef.current === "forYou";
        const shouldRenderBaseFeedImmediately = !shouldUseDiscoverRanking;

        if (shouldRenderBaseFeedImmediately && activeMode === modeRef.current && aliveRef.current && reqId === feedReqIdRef.current) {
          setItems(feed);
          setReactionCountsByPost(nextBaseReactionCounts);
          setMyFeedReactions(nextBaseMyReactions);
          setFeedLoadError(null);
          baseFeedRendered = true;
        }

        const postIds = filteredPosts.map((p) => p.id);
        const userIds = Array.from(new Set(filteredPosts.map((p) => p.user_id)));

        const profilesPromise =
        userIds.length > 0
          ? (async () => {
              const full = await supabase
                .from("profiles")
                .select("id, full_name, avatar_url, role, is_premium, premium_style, is_supporter, botm_champion_until")
                .in("id", userIds);
              const fullErr = String(full.error?.message ?? "").toLowerCase();
              if (full.error && (fullErr.includes("is_supporter") || fullErr.includes("premium_style"))) {
                const fallback = await supabase.from("profiles").select("id, full_name, avatar_url, role, is_premium, is_supporter").in("id", userIds);
                return fallback.error ? [] : ((fallback.data ?? []) as any[]);
              }
              return full.error ? [] : ((full.data ?? []) as any[]);
            })()
          : Promise.resolve([] as any[]);

        const bikeTop3Promise =
        userIds.length > 0
          ? (async () => {
              try {
                const result = await supabase
                  .from("bike_of_month_current_top3" as any)
                  .select("rider_id, rank_position")
                  .in("rider_id", userIds);
                return result.error ? [] : ((result.data ?? []) as any[]);
              } catch {
                return [] as any[];
              }
            })()
          : Promise.resolve([] as any[]);

        const giftsPromise =
        userIds.length > 0
          ? (async () => {
              try {
                const result = await supabase
                  .from("user_gifts" as any)
                  .select("recipient_id, created_at, gift_type_id")
                  .in("recipient_id", userIds)
                  .order("created_at", { ascending: false })
                  .limit(1000);
                return result.error ? [] : ((result.data ?? []) as any[]);
              } catch {
                return [] as any[];
              }
            })()
          : Promise.resolve([] as any[]);

        const likesPromise =
        postIds.length > 0
          ? (async () => {
              try {
                const result = await supabase.from("likes").select("post_id, user_id").in("post_id", postIds);
                return result.error ? [] : ((result.data ?? []) as any[]);
              } catch {
                return [] as any[];
              }
            })()
          : Promise.resolve([] as any[]);

        const commentsPromise =
        postIds.length > 0
          ? (async () => {
              try {
                const result = await supabase.from("comments").select("post_id").in("post_id", postIds);
                return result.error ? [] : ((result.data ?? []) as any[]);
              } catch {
                return [] as any[];
              }
            })()
          : Promise.resolve([] as any[]);

        const reactionsPromise =
        postIds.length > 0
          ? (async () => {
              try {
                const result = await supabase.from("post_reactions").select("post_id, user_id, reaction").in("post_id", postIds);
                return result.error ? [] : ((result.data ?? []) as any[]);
              } catch {
                return [] as any[];
              }
            })()
          : Promise.resolve([] as any[]);

        const [profs, bikeTop3, gifts, likes, comments, reactions] = await withTimeout(
          Promise.all([profilesPromise, bikeTop3Promise, giftsPromise, likesPromise, commentsPromise, reactionsPromise]),
          FEED_ENRICH_TIMEOUT_MS,
          "feed enrichment"
        ).catch(() => [[], [], [], [], [], []] as any);

        // If mode changed while loading, ignore this result
        if (reqId !== feedReqIdRef.current) return;

        const nameById = new Map<string, string>();
        const avatarById = new Map<string, string | null>();
        const roleById = new Map<string, ProfileRole>();
        const premiumById = new Map<string, boolean>();
        const premiumStyleById = new Map<string, PremiumStyle>();
        const supporterById = new Map<string, boolean>();
        const botmChampionById = new Map<string, boolean>();
        const bikeRankById = new Map<string, number>();
        const giftsCountByRecipient = new Map<string, number>();
        const latestGiftEmojiByRecipient = new Map<string, string>();
        for (const pr of profs ?? []) {
        nameById.set(pr.id, pr.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
        avatarById.set(pr.id, (pr as any).avatar_url ?? null);
        const r = (pr.role ?? "user") as ProfileRole;
        roleById.set(pr.id, r);
        premiumById.set(pr.id, !!(pr as any).is_premium);
        const pStyle = String((pr as any).premium_style ?? "classic") as PremiumStyle;
        premiumStyleById.set(pr.id, pStyle === "aurora" || pStyle === "sunset" || pStyle === "electric" ? pStyle : "classic");
        supporterById.set(pr.id, !!(pr as any).is_supporter);
        const championUntil = String((pr as any).botm_champion_until ?? "").trim();
        botmChampionById.set(pr.id, !!championUntil && new Date(championUntil).getTime() > Date.now());
      }

        for (const g of (gifts ?? []) as any[]) {
        const recipientId = String(g?.recipient_id ?? "");
        if (!recipientId) continue;
        giftsCountByRecipient.set(recipientId, (giftsCountByRecipient.get(recipientId) ?? 0) + 1);
        if (!latestGiftEmojiByRecipient.has(recipientId)) {
          const giftType = String(g?.gift_type_id ?? "").toLowerCase();
          latestGiftEmojiByRecipient.set(recipientId, GIFT_EMOJI_BY_TYPE[giftType] ?? "🎁");
        }
      }

        for (const row of (bikeTop3 ?? []) as any[]) {
        const riderId = String(row?.rider_id ?? "");
        const rank = Number(row?.rank_position ?? 0);
        if (!riderId || !rank) continue;
        bikeRankById.set(riderId, rank);
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

        const nextReactionCounts: Record<string, FeedReactionCountMap> = {};
        const nextMyReactions: Record<string, FeedReactionKind> = {};
        for (const r of (reactions ?? []) as any[]) {
        const postId = String(r.post_id ?? "");
        const userId = String(r.user_id ?? "");
        const reaction = String(r.reaction ?? "") as FeedReactionKind;
        if (!postId || !reaction || !(reaction in EMPTY_FEED_REACTION_COUNTS)) continue;

        if (!nextReactionCounts[postId]) {
          nextReactionCounts[postId] = { ...EMPTY_FEED_REACTION_COUNTS };
        }
        nextReactionCounts[postId][reaction] += 1;

        if (userId === me) {
          nextMyReactions[postId] = reaction;
        }
      }

        feed = filteredPosts.map((p) => ({
        ...p,
        author_name: nameById.get(p.user_id) ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
        author_avatar_url: avatarById.get(p.user_id) ?? null,
        author_role: roleById.get(p.user_id) ?? "user",
        author_is_premium: premiumById.get(p.user_id) ?? false,
        author_premium_style: premiumStyleById.get(p.user_id) ?? "classic",
        author_is_supporter: supporterById.get(p.user_id) ?? false,
        author_is_botm_champion: botmChampionById.get(p.user_id) ?? false,
        author_botm_rank: bikeRankById.get(p.user_id),
        author_gifts_count: giftsCountByRecipient.get(p.user_id) ?? 0,
        author_latest_gift_emoji: latestGiftEmojiByRecipient.get(p.user_id) ?? undefined,
        like_count: likeCountByPost.get(p.id) ?? 0,
        liked_by_me: likedByMeSet.has(p.id),
        comment_count: commentCountByPost.get(p.id) ?? 0,
      }));

      // Discover "For You": rank by personal interests inferred from recent interactions.
        if (activeMode === "discover" && discoverSortModeRef.current === "forYou" && feed.length > 0) {
        const [likesByMe, reactionsByMe, commentsByMe] = await Promise.all([
          (async () => {
            try {
              const result = await supabase.from("likes").select("post_id").eq("user_id", me).limit(220);
              return result.error ? [] : ((result.data ?? []) as any[]);
            } catch {
              return [] as any[];
            }
          })(),
          (async () => {
            try {
              const result = await supabase.from("post_reactions").select("post_id").eq("user_id", me).limit(220);
              return result.error ? [] : ((result.data ?? []) as any[]);
            } catch {
              return [] as any[];
            }
          })(),
          (async () => {
            try {
              const result = await supabase.from("comments").select("post_id").eq("user_id", me).limit(220);
              return result.error ? [] : ((result.data ?? []) as any[]);
            } catch {
              return [] as any[];
            }
          })(),
        ]);

        const interestWeightByPostId = new Map<string, number>();
        const addInterestWeight = (rows: any[] | null | undefined, weight: number) => {
          for (const row of rows ?? []) {
            const postId = String(row?.post_id ?? "");
            if (!postId) continue;
            interestWeightByPostId.set(postId, (interestWeightByPostId.get(postId) ?? 0) + weight);
          }
        };

        addInterestWeight(likesByMe, 2);
        addInterestWeight(reactionsByMe, 2);
        addInterestWeight(commentsByMe, 3);

        const interestPostIds = Array.from(interestWeightByPostId.keys()).slice(0, 160);

        const authorAffinityById = new Map<string, number>();
        const tokenAffinityByWord = new Map<string, number>();

        if (interestPostIds.length > 0) {
          const { data: interestPosts } = await supabase
            .from("posts")
            .select("id, user_id, caption")
            .in("id", interestPostIds);

          for (const post of (interestPosts ?? []) as any[]) {
            const postId = String(post?.id ?? "");
            const authorId = String(post?.user_id ?? "");
            const weight = interestWeightByPostId.get(postId) ?? 0;
            if (!authorId || weight <= 0) continue;

            authorAffinityById.set(authorId, (authorAffinityById.get(authorId) ?? 0) + weight);

            const uniqueTokens = Array.from(new Set(captionTokens(String(post?.caption ?? ""))));
            for (const token of uniqueTokens) {
              tokenAffinityByWord.set(token, (tokenAffinityByWord.get(token) ?? 0) + weight);
            }
          }
        }

        feed = [...feed].sort((a, b) => {
          const ageHoursA = Math.max(0, (Date.now() - new Date(a.created_at).getTime()) / 3600000);
          const ageHoursB = Math.max(0, (Date.now() - new Date(b.created_at).getTime()) / 3600000);

          const recencyA = clamp((96 - ageHoursA) / 96, 0, 1) * 2.2;
          const recencyB = clamp((96 - ageHoursB) / 96, 0, 1) * 2.2;

          const authorA = Math.min(12, (authorAffinityById.get(a.user_id) ?? 0) * 0.75);
          const authorB = Math.min(12, (authorAffinityById.get(b.user_id) ?? 0) * 0.75);

          const tokenScore = (caption: string | null | undefined) => {
            const tokens = Array.from(new Set(captionTokens(caption)));
            let total = 0;
            for (const token of tokens) total += tokenAffinityByWord.get(token) ?? 0;
            return Math.min(10, total * 0.25);
          };

          const keywordA = tokenScore(a.caption);
          const keywordB = tokenScore(b.caption);

          const reactionsA = Object.values(nextReactionCounts[a.id] ?? {}).reduce((sum, n) => sum + n, 0);
          const reactionsB = Object.values(nextReactionCounts[b.id] ?? {}).reduce((sum, n) => sum + n, 0);
          const engagementA = Math.log1p((a.like_count ?? 0) + (a.comment_count ?? 0) + reactionsA) * 0.9;
          const engagementB = Math.log1p((b.like_count ?? 0) + (b.comment_count ?? 0) + reactionsB) * 0.9;

          const scoreA = authorA + keywordA + engagementA + recencyA;
          const scoreB = authorB + keywordB + engagementB + recencyB;
          if (scoreA !== scoreB) return scoreB - scoreA;

          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      // Top Posts: sort by total engagement (reactions + comments), highest first
        if (activeMode === "top") {
        feed = [...feed].sort((a, b) => {
          const scoreA = (reactionCountsByPost[a.id] ? Object.values(nextReactionCounts[a.id] ?? {}).reduce((s: number, n: number) => s + n, 0) : 0) + a.comment_count;
          const scoreB = (reactionCountsByPost[b.id] ? Object.values(nextReactionCounts[b.id] ?? {}).reduce((s: number, n: number) => s + n, 0) : 0) + b.comment_count;
          return scoreB - scoreA;
        });
      }

        if (activeMode !== modeRef.current) return;
        if (aliveRef.current && reqId === feedReqIdRef.current) {
          setItems(feed);
          setReactionCountsByPost(nextReactionCounts);
          setMyFeedReactions(nextMyReactions);
          setFeedLoadError(null);
        }
      } catch (err: any) {
        if (aliveRef.current && activeMode === modeRef.current) {
          setFeedLoadError(String(err?.message ?? "Could not load the feed right now."));
        }
      }
    },
    [t]
  );

  const loadDealerCampaigns = useCallback(async () => {
    const [discoverRes, followingRes] = await Promise.all([loadActiveCampaigns("discover", t), loadActiveCampaigns("following", t)]);
    const merged = [...discoverRes.campaigns, ...followingRes.campaigns];
    const byId = new Map<string, SponsoredAd>();
    for (const ad of merged) {
      const existing = byId.get(ad.id);
      if (!existing || (ad.weight ?? 1) > (existing.weight ?? 1)) {
        byId.set(ad.id, ad);
      }
    }
    const sorted = Array.from(byId.values()).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
    if (aliveRef.current) setDealerCampaigns(sorted);
  }, [t]);

  const loadShopCampaigns = useCallback(async () => {
    const { data, error } = await supabase
      .from("active_ad_campaigns")
      .select("id, title, sponsor_name, body, cta_text, cta_url, image_url, weight, badge_text")
      .eq("badge_text", "Store")
      .order("weight", { ascending: false })
      .limit(120);

    if (error) {
      if (aliveRef.current) setShopCampaigns([]);
      return;
    }

    const mapped = ((data ?? []) as any[]).map((row) => ({
      id: String(row.id ?? ""),
      sponsor_name: String(row.sponsor_name ?? t("stores.title", { defaultValue: "Store" })),
      sponsor_tag: "Sponsored" as const,
      title: String(row.title ?? t("stores.product", { defaultValue: "Product" })),
      body: String(row.body ?? ""),
      cta: String(row.cta_text ?? t("stores.open_product", { defaultValue: "Open product" })),
      route: String(row.cta_url ?? "/stores"),
      image_url: row.image_url ? String(row.image_url) : null,
      weight: Number(row.weight ?? 1),
    }));

    if (aliveRef.current) setShopCampaigns(mapped);
  }, [t]);

  const toggleLike = useCallback(
    async (postId: string, currentlyLiked: boolean, postOwnerId: string) => {
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
        const removedReaction = myFeedReactions[postId];
        setMyFeedReactions((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
        if (removedReaction) {
          setReactionCountsByPost((prev) => {
            const current = prev[postId] ? { ...prev[postId] } : { ...EMPTY_FEED_REACTION_COUNTS };
            current[removedReaction] = Math.max(0, (current[removedReaction] ?? 0) - 1);
            const next = { ...prev, [postId]: current };
            const total = Object.values(current).reduce((sum, n) => sum + n, 0);
            if (total === 0) delete next[postId];
            return next;
          });
        }
        const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", me);
        if (error) Alert.alert(t("feed.unlike_failed_title", { defaultValue: "Unlike failed" }), error.message);
        await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", me);
      } else {
        const { error } = await supabase.from("likes").upsert({ post_id: postId, user_id: me }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
        if (error) Alert.alert(t("feed.like_failed_title", { defaultValue: "Like failed" }), error.message);
        if (!error && postOwnerId && postOwnerId !== me) {
          await sendPushEvent({
            recipientUserId: postOwnerId,
            type: "like",
            postId,
          });
        }
      }
    },
    [myFeedReactions, t]
  );

  const chooseFeedReaction = useCallback(
    async (postId: string, reaction: FeedReactionKind, currentlyLiked: boolean, postOwnerId: string) => {
      const previousReaction = myFeedReactions[postId];

      setMyFeedReactions((prev) => ({ ...prev, [postId]: reaction }));
      setReactionCountsByPost((prev) => {
        const current = prev[postId] ? { ...prev[postId] } : { ...EMPTY_FEED_REACTION_COUNTS };
        if (previousReaction && previousReaction !== reaction) {
          current[previousReaction] = Math.max(0, (current[previousReaction] ?? 0) - 1);
        }
        if (!previousReaction || previousReaction !== reaction) {
          current[reaction] = (current[reaction] ?? 0) + 1;
        }
        return { ...prev, [postId]: current };
      });

      setReactionPickerPostId(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const me = sessionData.session?.user?.id;
      if (!me) return;

      const { error: reactionErr } = await supabase.from("post_reactions").upsert(
        {
          post_id: postId,
          user_id: me,
          reaction,
        } as any,
        { onConflict: "post_id,user_id" }
      );

      if (reactionErr) {
        Alert.alert("Reaction failed", reactionErr.message);
      }

      if (!currentlyLiked) {
        await toggleLike(postId, false, postOwnerId);
      }
    },
    [myFeedReactions, toggleLike]
  );

  const openViewer = useCallback((urls: string[], index: number) => {
    if (!urls || urls.length === 0) return;
    router.push({ pathname: "/viewer", params: { urls: JSON.stringify(urls), index: String(index) } });
  }, []);

  const clipViewerFeed = useMemo<ClipViewerFeedItem[]>(() => {
    return items
      .map((entry) => {
        const firstVideo = (entry.post_media ?? []).find((media) => isVideoUrl(media.url))?.url;
        if (!firstVideo) return null;
        return {
          url: firstVideo,
          postId: entry.id,
          ownerId: entry.user_id,
          authorName: entry.author_name,
          authorAvatarUrl: entry.author_avatar_url ?? "",
          canDelete: !!myUserId && myUserId === entry.user_id,
          likeCount: Math.max(0, Number(entry.like_count ?? 0)),
          commentCount: Math.max(0, Number(entry.comment_count ?? 0)),
          likedByMe: !!entry.liked_by_me,
        };
      })
      .filter((entry): entry is ClipViewerFeedItem => !!entry);
  }, [items, myUserId]);

  const goToNewPost = useCallback(() => router.push("/new-post"), []);
  const goToNewClip = useCallback(() => router.push("/new-clip"), []);

  const loadTopRiders = useCallback(async () => {
    setTopRidersLoading(true);
    try {
      let ridersRes = await supabase
        .from("top_riders" as any)
        .select("id, full_name, avatar_url, is_premium, premium_style, is_supporter, role, follower_count, total_likes, gift_score, score")
        .order("score", { ascending: false })
        .limit(50);

      // Backward-compatible fallback if the view/table doesn't include premium_style.
      if (ridersRes.error && String(ridersRes.error.message ?? "").toLowerCase().includes("premium_style")) {
        ridersRes = await supabase
          .from("top_riders" as any)
          .select("id, full_name, avatar_url, is_premium, is_supporter, role, follower_count, total_likes, gift_score, score")
          .order("score", { ascending: false })
          .limit(50);
      }

      const buzzRes = await supabase
        .from("user_gifts" as any)
        .select("id, recipient_id, gift_types(emoji, name, score_value), profiles!user_gifts_recipient_id_fkey(full_name)")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(40);

      if (!ridersRes.error && ridersRes.data && aliveRef.current) {
        setTopRiders(ridersRes.data as TopRider[]);
      }

      if (!buzzRes.error && buzzRes.data && aliveRef.current) {
        const mapped: BigGiftBuzzItem[] = ((buzzRes.data ?? []) as any[])
          .map((row: any) => ({
            id: String(row.id),
            recipient_id: String(row.recipient_id ?? ""),
            recipient_name: row.profiles?.full_name ?? null,
            gift_emoji: String(row.gift_types?.emoji ?? "🎁"),
            gift_name: String(row.gift_types?.name ?? "Gift"),
            score_value: Number(row.gift_types?.score_value ?? 0),
          }))
          .filter((row) => row.recipient_id && row.score_value >= 50)
          .slice(0, 12);
        setBigGiftBuzz(mapped);
      }
    } catch {}
    if (aliveRef.current) setTopRidersLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const focusReqId = ++focusLoadReqIdRef.current;
      if (aliveRef.current) {
        setLoading(true);
        setFeedLoadError(null);
      }

      void withTimeout(
        (async () => {
          if (mode === "dealers") {
            await loadDealerCampaigns();
          } else if (mode === "shop") {
            await loadShopCampaigns();
          } else {
            await loadFeed(mode);
          }
        })(),
        FEED_LOAD_TIMEOUT_MS,
        `focus feed load (${mode})`
      ).catch(() => {
        if (aliveRef.current && focusReqId === focusLoadReqIdRef.current) {
          if (itemsRef.current.length === 0) {
          setFeedLoadError("Feed laden duurde te lang. Trek omlaag om opnieuw te proberen.");
          }
          setLoading(false);
        }
      }).finally(() => {
        if (aliveRef.current && focusReqId === focusLoadReqIdRef.current) setLoading(false);
      });
    }, [mode, loadDealerCampaigns, loadFeed, loadShopCampaigns])
  );

  useEffect(() => {
    if (mode === "leaderboard" && topRiders.length === 0) {
      loadTopRiders();
    }
  }, [mode, topRiders.length, loadTopRiders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await withTimeout(
        (async () => {
          if (mode === "leaderboard") {
            await loadTopRiders();
            return;
          }
          if (mode === "dealers") {
            await loadDealerCampaigns();
            return;
          }
          if (mode === "shop") {
            await loadShopCampaigns();
            return;
          }
          if (mode === "clips") {
            await loadFeed(mode);
            return;
          }
          if (isPremium) {
            await loadFeed(mode);
            return;
          }

          const adPlacement = mode === "top" ? "discover" : mode;
          const [_, adResult] = await Promise.all([loadFeed(mode), loadActiveCampaigns(adPlacement, t)]);
          if (aliveRef.current) {
            setCampaigns(adResult.campaigns);
            setCampaignsLoaded(true);
            loggedImpressionsRef.current = new Set();
          }
        })(),
        FEED_LOAD_TIMEOUT_MS,
        `refresh (${mode})`
      );
    } catch (err: any) {
      const message = String(err?.message ?? "");
      if (message.includes("timed out")) {
        showError(t("feed.refresh_timeout", { defaultValue: "Feed is taking longer than expected. Please try again." }));
      } else {
        showError(t("feed.refresh_failed", { defaultValue: "Could not refresh feed right now." }));
      }
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [mode, isPremium, loadDealerCampaigns, loadFeed, loadShopCampaigns, loadTopRiders, t]);

  const switchDiscoverSortMode = useCallback(
    (next: DiscoverSortMode) => {
      const alreadyInDiscover = modeRef.current === "discover";
      const unchangedSort = next === discoverSortMode;
      if (alreadyInDiscover && unchangedSort) return;

      discoverSortModeRef.current = next;
      setDiscoverSortMode(next);

      if (!alreadyInDiscover) {
        setMode("discover");
        return;
      }

      if (aliveRef.current) {
        setFeedLoadError(null);
      }
      void loadFeed("discover");
    },
    [discoverSortMode, loadFeed]
  );

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
      const [carouselW, setCarouselW] = useState(IMAGE_W);

      const safeIndex = clamp(getCarouselIndex(postId), 0, Math.max(0, urls.length - 1));

      const onCarouselLayout = (e: LayoutChangeEvent) => {
        const measured = Math.floor(e.nativeEvent.layout.width);
        if (measured > 0 && measured !== carouselW) {
          setCarouselW(measured);
        }
      };

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
        const pageW = Math.max(1, carouselW);
        const idx = clamp(Math.round(x / pageW), 0, urls.length - 1);
        if (idx !== safeIndex) setCarouselIndex(postId, idx);
      };

      return (
        <View style={{ marginTop: 10 }}>
          <View
            onLayout={onCarouselLayout}
            style={{
              width: "100%",
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
              snapToInterval={Math.max(1, carouselW)}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              bounces={false}
              overScrollMode="never"
              nestedScrollEnabled={Platform.OS === "android"}
              onMomentumScrollEnd={onMomentumEnd}
              getItemLayout={(_, index) => ({ length: Math.max(1, carouselW), offset: Math.max(1, carouselW) * index, index })}
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
                  style={{ width: Math.max(1, carouselW), height: IMAGE_H }}
                >
                  <MediaThumbnail url={item} width="100%" height="100%" resizeMode="cover" />
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

  const logAdEvent = useCallback(async (campaignId: string, placement: "discover" | "following", eventType: "impression" | "click" | "hide") => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      await supabase.from("ad_events").insert({
        campaign_id: campaignId,
        user_id: userId,
        placement,
        event_type: eventType,
      } as any);
    } catch {}
  }, []);

  const handleHideAd = useCallback((adId: string, placement: "discover" | "following") => {
    setHiddenAdIds((prev) => {
      const next = new Set(prev);
      next.add(adId);
      return next;
    });
    void logAdEvent(adId, placement, "hide");
    
    // Save to database for persistence across sessions
    const saveHiddenCampaign = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) return;
        
        await supabase.from("user_hidden_campaigns").insert({ 
          user_id: userId, 
          campaign_id: adId,
          hidden_at: new Date().toISOString(),
        } as any);
      } catch {
        // Silently fail if save doesn't work - user still has local state
      }
    };
    void saveHiddenCampaign();
  }, [logAdEvent]);

  const loggedImpressionsRef = useRef<Set<string>>(new Set());

  const logImpression = useCallback(async (campaignId: string, placement: "discover" | "following") => {
    const key = `${campaignId}:${placement}`;
    if (loggedImpressionsRef.current.has(key)) return;
    loggedImpressionsRef.current.add(key);

    await logAdEvent(campaignId, placement, "impression");
  }, [logAdEvent]);

  const logClick = useCallback(async (campaignId: string, placement: "discover" | "following") => {
    await logAdEvent(campaignId, placement, "click");
  }, [logAdEvent]);

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
  const isAdmin = myRole === "admin";

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
        id: "sponsor-advertise",
        sponsor_name: t("ads.partner_name", { defaultValue: "Oranga Partners" }),
        sponsor_tag: "Sponsored",
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
      
      // Load and clean up user's hidden campaigns
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (userId) {
          // Fetch all non-expired hidden campaigns
          const { data: hiddenRows } = await supabase
            .from("user_hidden_campaigns")
            .select("campaign_id")
            .eq("user_id", userId)
            .gt("hidden_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString());
          
          if (hiddenRows && hiddenRows.length > 0) {
            const hiddenIds = new Set(hiddenRows.map((row: any) => row.campaign_id));
            setHiddenAdIds(hiddenIds);
          }
          
          // Delete expired hidden campaigns (older than 36 hours)
          await supabase
            .from("user_hidden_campaigns")
            .delete()
            .eq("user_id", userId)
            .lt("hidden_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString());
        }
      } catch {
        // Silently fail if DB operations don't work - local state still functions
      }
      
      if (aliveRef.current) {
        setCampaigns(loaded);
        setCampaignsLoaded(true);
        loggedImpressionsRef.current = new Set();
      }
    },
    [t]
  );

  useEffect(() => {
    if (mode === "clips" || mode === "leaderboard" || mode === "dealers" || mode === "shop" || isPremium) return;
    loadAdCampaigns(mode === "top" ? "discover" : mode);
  }, [mode, isPremium, loadAdCampaigns]);

  const sponsoredEveryN = mode === "discover" ? SPONSORED_EVERY_DISCOVER : SPONSORED_EVERY_FOLLOWING;
  const effectiveCampaigns = campaignsLoaded && campaigns.length > 0 ? campaigns : fallbackAdTemplates;
  const houseCampaigns = useMemo(
    () => effectiveCampaigns.filter((ad) => ad.sponsor_tag === "House Sponsor" && !hiddenAdIds.has(ad.id)),
    [effectiveCampaigns, hiddenAdIds]
  );
  const nonHouseCampaigns = useMemo(
    () => effectiveCampaigns.filter((ad) => ad.sponsor_tag !== "House Sponsor" && !hiddenAdIds.has(ad.id)),
    [effectiveCampaigns, hiddenAdIds]
  );

  const feedRows = useMemo<FeedRow<FeedItem>[]>(() => {
    if (mode === "dealers" || mode === "shop") {
      return [];
    }

    // Never render ad-only rows when there are no posts.
    if (items.length === 0) {
      return [];
    }

    if (mode === "clips") {
      return items.map((p) => ({ type: "post", key: `post:${p.id}`, post: p }));
    }

    if (!ADS_ENABLED || isPremium) {
      return items.map((p) => ({ type: "post", key: `post:${p.id}`, post: p }));
    }

    const campaignsForInjection = nonHouseCampaigns;
    let everyN = sponsoredEveryN;

    // Override for top mode: inject ads every 6 posts
    if (mode === "top") {
      everyN = 6;
    }

    if (!campaignsForInjection.length) {
      return items.map((p) => ({ type: "post", key: `post:${p.id}`, post: p }));
    }

    return injectSponsoredRows({
      posts: items,
      getPostId: (p) => p.id,
      placement: (mode === "leaderboard" ? "discover" : mode === "top" ? "discover" : mode) as "discover" | "following",
      everyN,
      campaigns: campaignsForInjection,
      hiddenAdIds: mode === "top" ? new Set<string>() : hiddenAdIds,
      maxAdsPerPage: mode === "discover" ? 3 : mode === "top" ? 3 : 2,
      rotationSeed: `${mode}:${new Date().toDateString()}`,
    });
  }, [
    ADS_ENABLED,
    isPremium,
    items,
    mode,
    sponsoredEveryN,
    hiddenAdIds,
    nonHouseCampaigns,
  ]);

  const ReasonChip = ({ label, value }: { label: string; value: "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other" }) => {
    const active = reportReason === value;
    return (
      <AnimatedSelectableButton
        label={label}
        active={active}
        onPress={() => setReportReason(value)}
        containerStyle={{ borderRadius: 999 }}
        pressableStyle={{ borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10 }}
        textStyle={{ fontSize: 12 }}
      />
    );
  };

  const canSwipeLeft = chipScrollX > 10;
  const canSwipeRight = chipContentW - chipViewportW - chipScrollX > 10;
  const chipArrowDirection: "left" | "right" | null = canSwipeRight ? "right" : canSwipeLeft ? "left" : null;
  const chipArrowTranslateX = chipArrowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: chipArrowDirection === "right" ? [0, 5] : [0, -5],
  });
  const chipArrowOpacity = chipArrowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  const Header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
      <LinearGradient
        colors={["rgba(255,255,255,0.04)", "rgba(18,18,26,0.92)", "rgba(11,11,15,0.96)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          overflow: "hidden",
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 20,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AnimatedSelectableButton
            active
            onPress={openMenu}
            containerStyle={{ width: 44, height: 44 }}
            pressableStyle={{ width: 42, height: 42, paddingVertical: 0, paddingHorizontal: 0 }}
          >
            <Ionicons name="menu" size={22} color={COLORS.text} />
          </AnimatedSelectableButton>

          <View style={{ alignItems: "center", flex: 1 }}>
            <View style={{ width: 180, height: 122, alignItems: "center", justifyContent: "center", marginVertical: -10 }}>
              <Image source={require("../../assets/icon.png")} style={{ width: 142, height: 142 }} resizeMode="contain" />
            </View>
            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>{t("brand.tagline", { defaultValue: "Where bikers connect" })}</Text>
            {isPremium ? (
              <Text style={{ marginTop: 2, color: premiumAccentColor, fontWeight: "900", fontSize: 11 }}>
                {t("common.premium", { defaultValue: "Premium" })}
              </Text>
            ) : null}
          </View>

          <AnimatedSelectableButton
            active
            onPress={mode === "clips" ? goToNewClip : goToNewPost}
            hitSlop={10}
            containerStyle={{ width: 44, height: 44 }}
            pressableStyle={{ width: 42, height: 42, paddingVertical: 0, paddingHorizontal: 0 }}
          >
            <Ionicons name={mode === "clips" ? "videocam-outline" : "add"} size={24} color={COLORS.text} />
          </AnimatedSelectableButton>
        </View>
      </LinearGradient>

      <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => router.push("/bike-of-month")}
          style={{
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,214,122,0.45)",
            backgroundColor: "rgba(255,214,122,0.12)",
            paddingVertical: 8,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="trophy" size={14} color="#FFD67A" />
          <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
            {t("botm.home_chip", { defaultValue: "Bike Of The Month Live" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/bike-entries")}
          style={{
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,214,122,0.45)",
            backgroundColor: "rgba(255,214,122,0.12)",
            paddingVertical: 8,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="list-outline" size={14} color="#FFD67A" />
          <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
            {t("botm.entries_chip", { defaultValue: "Entries" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/bike-hall-of-fame")}
          style={{
            flex: 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,214,122,0.45)",
            backgroundColor: "rgba(255,214,122,0.12)",
            paddingVertical: 8,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="medal-outline" size={14} color="#FFD67A" />
          <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
            {t("botm.hall_of_fame_chip", { defaultValue: "Hall Of Fame" })}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 8, position: "relative" }}>
        <ScrollView
          ref={chipScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingVertical: 2 }}
          onLayout={(e) => setChipViewportW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setChipContentW(w)}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            chipScrollXRef.current = x;
            setChipScrollX(x);
          }}
          scrollEventThrottle={16}
        >
          <AnimatedSelectableButton
          label={t("feed.recent_posts", { defaultValue: "Recent" })}
          active={mode === "discover" && discoverSortMode === "recent"}
          onPress={() => switchDiscoverSortMode("recent")}
          containerStyle={{ minWidth: 76 }}
          />

          <AnimatedSelectableButton
          label={t("feed.for_you", { defaultValue: "For You" })}
          active={mode === "discover" && discoverSortMode === "forYou"}
          onPress={() => switchDiscoverSortMode("forYou")}
          containerStyle={{ minWidth: 76 }}
          />

          <AnimatedSelectableButton
          label={t("feed.following", { defaultValue: "Following" })}
          active={mode === "following"}
          onPress={() => setMode("following")}
          containerStyle={{ minWidth: 88 }}
          />

          <AnimatedSelectableButton
          label={t("feed.clips", { defaultValue: "Clips" })}
          active={mode === "clips"}
          onPress={() => setMode("clips")}
          containerStyle={{ minWidth: 72 }}
          />

          <AnimatedSelectableButton
          label={t("feed.leaderboard", { defaultValue: "Top Riders" })}
          active={mode === "leaderboard"}
          onPress={() => setMode("leaderboard")}
          containerStyle={{ minWidth: 100 }}
          />

          <AnimatedSelectableButton
          label={t("feed.top_posts", { defaultValue: "Top Posts" })}
          active={mode === "top"}
          onPress={() => setMode("top")}
          containerStyle={{ minWidth: 90 }}
          />

          <AnimatedSelectableButton
          label={t("feed.dealers", { defaultValue: "Dealers" })}
          active={mode === "dealers"}
          onPress={() => setMode("dealers")}
          containerStyle={{ minWidth: 82 }}
          />

          <AnimatedSelectableButton
          label={t("stores.shop", { defaultValue: "Shop" })}
          active={mode === "shop"}
          onPress={() => setMode("shop")}
          containerStyle={{ minWidth: 72 }}
          />

          <AnimatedSelectableButton
          label={t("menu.events", { defaultValue: "Events" })}
          active={false}
          onPress={() => router.push("/events")}
          containerStyle={{ minWidth: 72 }}
          />
        </ScrollView>

        {chipArrowDirection ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: "50%",
              marginTop: -11,
              right: chipArrowDirection === "right" ? 2 : undefined,
              left: chipArrowDirection === "left" ? 2 : undefined,
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(124,255,178,0.16)",
              borderWidth: 1,
              borderColor: "rgba(124,255,178,0.55)",
              opacity: chipArrowOpacity,
              transform: [{ translateX: chipArrowTranslateX }],
            }}
          >
            <Ionicons name={chipArrowDirection === "right" ? "chevron-forward" : "chevron-back"} size={14} color="#7CFFB2" />
          </Animated.View>
        ) : null}
      </View>

      <View style={{ height: 4 }} />
    </View>
  );

  const renderAuthorName = useCallback((item: FeedItem) => {
    const isAdmin = item.author_role === "admin";
    const isModerator = item.author_role === "moderator";
    const isPremiumAuthor = !!item.author_is_premium;
    const isSupporterAuthor = !!item.author_is_supporter;
    const isBotmChampion = !!item.author_is_botm_champion;
    const bikeRank = Number(item.author_botm_rank ?? 0);
    const showAdminBadge = isAdmin;
    const showModeratorBadge = isModerator;
    const nameColor = isAdmin ? COLORS.adminGold : isModerator ? COLORS.moderatorGreen : COLORS.text;
    const premiumPalette = premiumPaletteForStyle(item.author_premium_style ?? "classic");

    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isAdmin ? (
          <Animated.Text
            style={{
              fontWeight: "900",
              color: nameColor,
              fontSize: 16,
              opacity: adminGlowOpacity,
              textShadowColor: "rgba(255,220,120,1)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: adminGlowRadius,
            }}
            numberOfLines={1}
          >
            {item.author_name}
          </Animated.Text>
        ) : (
          <Text style={{ fontWeight: "900", color: nameColor, fontSize: 16 }} numberOfLines={1}>
            {item.author_name}
          </Text>
        )}

        {showAdminBadge ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="shield" size={14} color={COLORS.adminGold} />
            <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(245,196,81,0.16)", borderWidth: 1, borderColor: "rgba(245,196,81,0.45)" }}>
              <Text style={{ color: "#FFD36A", fontWeight: "900", fontSize: 10 }}>ADMIN</Text>
            </View>
          </View>
        ) : null}
        {showModeratorBadge ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.moderatorGreen} />
            <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(106,183,255,0.12)", borderWidth: 1, borderColor: "rgba(106,183,255,0.4)" }}>
              <Text style={{ color: "#6AB7FF", fontWeight: "900", fontSize: 10 }}>MOD</Text>
            </View>
          </View>
        ) : null}
        {isPremiumAuthor && !isAdmin && !isModerator ? (
          <Pressable
            onPress={() => { if (!isPremium) setShowPremiumModal(true); }}
            hitSlop={6}
          >
            <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: premiumPalette.bg, borderWidth: 1, borderColor: premiumPalette.border }}>
              <Text style={{ color: premiumPalette.text, fontWeight: "900", fontSize: 10 }}>PREMIUM</Text>
            </View>
          </Pressable>
        ) : null}
        {isSupporterAuthor && !isAdmin && !isModerator ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(124,255,178,0.12)", borderWidth: 1, borderColor: "rgba(124,255,178,0.4)" }}>
            <Text style={{ color: "#7CFFB2", fontWeight: "900", fontSize: 10 }}>SUPPORTER</Text>
          </View>
        ) : null}
        {(item.author_gifts_count ?? 0) > 0 ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(200,155,255,0.12)", borderWidth: 1, borderColor: "rgba(200,155,255,0.38)" }}>
            <Text style={{ color: "#D9B8FF", fontWeight: "900", fontSize: 10 }}>
              {(item.author_latest_gift_emoji ?? "🎁")} x{item.author_gifts_count}
            </Text>
          </View>
        ) : null}
        {bikeRank > 0 ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(255,214,122,0.14)", borderWidth: 1, borderColor: "rgba(255,214,122,0.45)" }}>
            <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 10 }}>BOTM #{bikeRank}</Text>
          </View>
        ) : null}
        {isBotmChampion ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(255,214,122,0.14)", borderWidth: 1, borderColor: "rgba(255,214,122,0.45)" }}>
            <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 10 }}>BOTM CHAMP</Text>
          </View>
        ) : null}
      </View>
    );
  }, [adminGlowOpacity, adminGlowRadius, isPremium]);

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
            onHide={(adId) => handleHideAd(adId, row.placement)}
            onImpression={logImpression}
            onDisableHouseSponsors={disableHouseSponsors}
            onPressCta={async (ad) => {
              await logClick(ad.id, row.placement);
              await openAdRoute(String(ad.route ?? ""));
            }}
          />
        );
      }

      const item = row.post;
      const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);
      const selectedReaction = myFeedReactions[item.id] ?? "fire";
      const selectedReactionEmoji = FEED_REACTION_OPTIONS.find((opt) => opt.key === selectedReaction)?.emoji ?? "🔥";
      const reactionCounts = reactionCountsByPost[item.id] ?? EMPTY_FEED_REACTION_COUNTS;
      const visibleReactions = FEED_REACTION_OPTIONS
        .filter((opt) => (reactionCounts[opt.key] ?? 0) > 0)
        .sort((a, b) => {
          const byCount = (reactionCounts[b.key] ?? 0) - (reactionCounts[a.key] ?? 0);
          if (byCount !== 0) return byCount;
          return FEED_REACTION_ORDER[a.key] - FEED_REACTION_ORDER[b.key];
        });
      const displayReactions = visibleReactions.slice(0, MAX_VISIBLE_FEED_REACTION_CHIPS);
      const hiddenReactionTypeCount = Math.max(0, visibleReactions.length - displayReactions.length);

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
            {item.visibility === "private" ? t("feed.private", { defaultValue: "Private" }) : t("feed.public", { defaultValue: "Public" })} · {timeAgo(item.created_at)}
          </Text>

          {urls.length > 0 ? <PostCarousel postId={item.id} urls={urls} /> : null}

          {item.caption ? <MentionText text={item.caption} textStyle={{ marginTop: 10, fontSize: 16, color: COLORS.text }} /> : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                if (item.liked_by_me) {
                  toggleLike(item.id, true, item.user_id);
                  return;
                }
                setReactionPickerPostId(item.id);
              }}
              onLongPress={() => setReactionPickerPostId(item.id)}
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
              {item.liked_by_me ? (
                <Text style={{ fontSize: 18 }}>{selectedReactionEmoji}</Text>
              ) : (
                <Ionicons name="flame-outline" size={18} color="#FFB066" />
              )}
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

          {displayReactions.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
              {displayReactions.map((opt) => (
                <Pressable
                  key={`${item.id}:${opt.key}`}
                  onPress={() => setReactionPickerPostId(item.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.chip,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{opt.emoji}</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{reactionCounts[opt.key]}</Text>
                </Pressable>
              ))}

              {hiddenReactionTypeCount > 0 ? (
                <Pressable
                  onPress={() => setReactionPickerPostId(item.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.chip,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>+{hiddenReactionTypeCount}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    },
    [PostCarousel, disableHouseSponsors, getCarouselIndex, handleHideAd, logClick, logImpression, myFeedReactions, openPostMenu, openViewer, reactionCountsByPost, renderAuthorName, t, toggleLike]
  );

  const renderClipTile = useCallback(
    ({ item }: { item: FeedItem }) => {
      const firstVideo = (item.post_media ?? []).find((m) => isVideoUrl(m.url))?.url;
      if (!firstVideo) return null;

      const clipStartIndex = clipViewerFeed.findIndex((entry) => entry.postId === item.id);
      const initialClipIndex = clipStartIndex >= 0 ? clipStartIndex : 0;

      return (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/viewer",
              params: {
                clips: JSON.stringify(clipViewerFeed),
                urls: JSON.stringify([firstVideo]),
                index: String(initialClipIndex),
                postId: item.id,
                ownerId: item.user_id,
                canDelete: myUserId && myUserId === item.user_id ? "1" : "0",
                authorName: item.author_name,
                authorAvatarUrl: item.author_avatar_url ?? "",
                likeCount: String(item.like_count ?? 0),
                commentCount: String(item.comment_count ?? 0),
                likedByMe: item.liked_by_me ? "1" : "0",
              },
            })
          }
          style={{
            width: CLIP_TILE_W,
            marginBottom: CLIPS_GAP,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            height: Math.max(150, Math.floor(CLIP_TILE_W * 1.65)),
          }}
        >
          <MediaThumbnail url={firstVideo} width="100%" height="100%" resizeMode="cover" />
          <View
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              right: 8,
              backgroundColor: "rgba(0,0,0,0.45)",
              borderRadius: 10,
              paddingVertical: 6,
              paddingHorizontal: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", flexShrink: 1 }} numberOfLines={1}>
                {item.author_name}
              </Text>
              {item.author_is_premium ? <Ionicons name="star" size={12} color="#FFD36A" /> : null}
              {item.author_is_supporter ? <Ionicons name="heart" size={12} color="#7CFFB2" /> : null}
              {item.author_is_botm_champion ? <Ionicons name="trophy" size={12} color="#FFD67A" /> : null}
              {(item.author_gifts_count ?? 0) > 0 ? (
                <View
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    borderRadius: 999,
                    backgroundColor: "rgba(200,155,255,0.16)",
                    borderWidth: 1,
                    borderColor: "rgba(200,155,255,0.38)",
                  }}
                >
                  <Text style={{ color: "#D9B8FF", fontWeight: "900", fontSize: 10 }}>
                    {(item.author_latest_gift_emoji ?? "🎁")} x{item.author_gifts_count}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      );
    },
    [clipViewerFeed, myUserId]
  );

  const TOP_GRID_COLUMNS = 3;
  const TOP_GRID_GAP = 4;
  const TOP_TILE_W = Math.floor((SCREEN_W - 32 - TOP_GRID_GAP * (TOP_GRID_COLUMNS - 1)) / TOP_GRID_COLUMNS);
  const TOP_ROW_H = TOP_TILE_W + TOP_GRID_GAP;

  const getTopGridItemLayout = useCallback(
    (_: ArrayLike<FeedRow<FeedItem>> | null | undefined, index: number) => ({
      length: TOP_ROW_H,
      offset: TOP_ROW_H * Math.floor(index / TOP_GRID_COLUMNS),
      index,
    }),
    [TOP_ROW_H]
  );

  const renderTopTile = useCallback(
    ({ item: row }: { item: FeedRow<FeedItem> }) => {
      if (row.type === "ad") {
        const ad = row.ad;
        return (
          <Pressable
            onPress={async () => {
              await logClick(ad.id, row.placement);
                await openAdRoute(String(ad.route ?? ""));
            }}
            style={{
              width: TOP_TILE_W,
              aspectRatio: 1,
              marginBottom: TOP_GRID_GAP,
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: "#F5C451",
              padding: 8,
              justifyContent: "space-between",
            }}
          >
            <View style={{ alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(245,196,81,0.18)", borderWidth: 1, borderColor: "rgba(245,196,81,0.45)" }}>
              <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 10 }} numberOfLines={1}>Sponsored</Text>
            </View>
            <View>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }} numberOfLines={2}>{ad.sponsor_name}</Text>
              <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }} numberOfLines={3}>{ad.body}</Text>
            </View>
            <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 11 }} numberOfLines={1}>{ad.cta}</Text>
          </Pressable>
        );
      }

      const feedItem = row.post;
      const media = feedItem.post_media ?? [];
      const firstMedia = media[0]?.url;
      const previewUrl = media.find((m) => !isVideoUrl(m.url))?.url ?? firstMedia;
      if (!previewUrl) return null;
      const previewIsVideo = isVideoUrl(previewUrl);
      const score = (feedItem.like_count ?? 0) + (feedItem.comment_count ?? 0);
      return (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/post",
              params: { id: feedItem.id },
            })
          }
          style={{
            width: TOP_TILE_W,
            aspectRatio: 1,
            marginBottom: TOP_GRID_GAP,
            borderRadius: 10,
            overflow: "hidden",
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          {previewIsVideo ? (
            <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#0F0F16" }}>
              <View
                style={{
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
          ) : (
            <ExpoImage source={{ uri: previewUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={previewUrl} />
          )}
          <View
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              paddingVertical: 2,
              paddingHorizontal: 6,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 10 }}>🔥 {score}</Text>
          </View>
        </Pressable>
      );
    },
    [TOP_TILE_W, logClick, router]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      {mode === "leaderboard" ? (
        <FlatList
          key="leaderboard"
          data={topRiders}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={
            <View>
              {Header}
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                  {t("leaderboard.title", { defaultValue: "Top Riders" })}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>
                  {t("leaderboard.subtitle", { defaultValue: "Ranked by followers × 2 + total likes + gift points" })}
                </Text>
              </View>

              {bigGiftBuzz.length > 0 ? (
                <View style={{ paddingBottom: 10 }}>
                  <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 11, letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 6 }}>
                    {t("leaderboard.big_gifts", { defaultValue: "BIG GIFTS (24H)" })}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                    {bigGiftBuzz.map((gift) => (
                      <Pressable
                        key={gift.id}
                        onPress={() => router.push({ pathname: "/rider", params: { id: gift.recipient_id } })}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingVertical: 7,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(200,155,255,0.42)",
                          backgroundColor: "rgba(200,155,255,0.12)",
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{gift.gift_emoji}</Text>
                        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                          {gift.recipient_name ?? t("common.unknown_rider", { defaultValue: "Rider" })}
                        </Text>
                        <Text style={{ color: "#D9B8FF", fontWeight: "900", fontSize: 11 }}>+{gift.score_value}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          }
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            topRidersLoading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 24, alignItems: "center" }}>
                <Text style={{ color: COLORS.muted }}>{t("common.loading", { defaultValue: "Loading…" })}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 24, alignItems: "center" }}>
                <Text style={{ color: COLORS.muted }}>{t("leaderboard.empty", { defaultValue: "No riders yet." })}</Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const rank = index + 1;
            const trophy = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
            const rankColor =
              rank === 1 ? "#FFD36A" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : COLORS.muted;
            const premiumPalette = premiumPaletteForStyle(item.premium_style ?? "classic");
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/rider", params: { id: item.id } })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                  gap: 14,
                }}
              >
                {/* Rank badge */}
                <View style={{ width: 32, alignItems: "center" }}>
                  {trophy ? (
                    <Text style={{ fontSize: 22 }}>{trophy}</Text>
                  ) : (
                    <Text style={{ color: rankColor, fontWeight: "900", fontSize: 15 }}>
                      {rank}
                    </Text>
                  )}
                </View>

                {/* Avatar */}
                {item.avatar_url ? (
                  <Image
                    source={{ uri: item.avatar_url }}
                    style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
                  />
                ) : (
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border }}>
                    <Ionicons name="person" size={22} color={COLORS.muted} />
                  </View>
                )}

                {/* Name + badges */}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={{ fontWeight: "900", color: item.role === "admin" ? COLORS.adminGold : item.role === "moderator" ? COLORS.moderatorGreen : COLORS.text, fontSize: 15 }} numberOfLines={1}>
                      {item.full_name ?? t("common.unknown_rider", { defaultValue: "Rider" })}
                    </Text>
                    {item.role === "admin" ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="shield" size={11} color={COLORS.adminGold} />
                        <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: "rgba(245,196,81,0.16)", borderWidth: 1, borderColor: "rgba(245,196,81,0.45)" }}>
                          <Text style={{ color: "#FFD36A", fontWeight: "900", fontSize: 9 }}>ADMIN</Text>
                        </View>
                      </View>
                    ) : item.role === "moderator" ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="shield-checkmark" size={11} color={COLORS.moderatorGreen} />
                        <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: "rgba(106,183,255,0.12)", borderWidth: 1, borderColor: "rgba(106,183,255,0.4)" }}>
                          <Text style={{ color: "#6AB7FF", fontWeight: "900", fontSize: 9 }}>MOD</Text>
                        </View>
                      </View>
                    ) : item.is_premium ? (
                      <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: premiumPalette.bg, borderWidth: 1, borderColor: premiumPalette.border }}>
                        <Text style={{ color: premiumPalette.text, fontWeight: "900", fontSize: 9 }}>PREMIUM</Text>
                      </View>
                    ) : item.is_supporter ? (
                      <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: "rgba(124,255,178,0.12)", borderWidth: 1, borderColor: "rgba(124,255,178,0.4)" }}>
                        <Text style={{ color: "#7CFFB2", fontWeight: "900", fontSize: 9 }}>SUPPORTER</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="people-outline" size={13} color={COLORS.muted} />
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>{item.follower_count}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="heart-outline" size={13} color={COLORS.muted} />
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>{item.total_likes}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 12 }}>🎁</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>{item.gift_score ?? 0}</Text>
                    </View>
                  </View>
                </View>

                {/* Score chip */}
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ color: rankColor, fontWeight: "900", fontSize: 14 }}>{item.score}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 10 }}>pts</Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : mode === "clips" ? (
        <FlatList
          ref={feedListRef as any}
          key="clips"
          data={items}
          numColumns={CLIPS_COLUMNS}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View style={{ marginHorizontal: -CLIPS_SIDE_PADDING }}>{Header}</View>}
          columnWrapperStyle={{ justifyContent: "space-between" }}
          contentContainerStyle={{
            paddingHorizontal: CLIPS_SIDE_PADDING,
            paddingTop: 2,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={Platform.OS === "android"}
          windowSize={9}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          nestedScrollEnabled={Platform.OS === "android"}
          onScroll={onFeedScroll}
          scrollEventThrottle={16}
          renderItem={renderClipTile}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("common.loading_feed", { defaultValue: "Loading feed…" })}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("feed.no_clips_yet", { defaultValue: "No clips yet." })}</Text>
              </View>
            )
          }
        />
      ) : mode === "dealers" ? (
        <FlatList
          ref={feedListRef as any}
          key="dealers-grid"
          data={dealerCampaigns}
          numColumns={DEALER_COLUMNS}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View>{Header}</View>}
          columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: DEALER_SIDE_PADDING }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={Platform.OS === "android"}
          windowSize={9}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          onScroll={onFeedScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={async () => {
                await openAdRoute(String(item.route ?? ""));
              }}
              style={{
                width: DEALER_TILE_W,
                aspectRatio: 1,
                marginBottom: DEALER_GAP,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
              }}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} resizeMode="cover" />
              ) : null}
              <View style={{ position: "absolute", inset: 0, backgroundColor: item.image_url ? "rgba(0,0,0,0.45)" : "transparent" }} />
              <View
                style={{
                  position: "absolute",
                  right: 6,
                  top: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(124,255,178,0.55)",
                  backgroundColor: "rgba(124,255,178,0.16)",
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ color: "#7CFFB2", fontWeight: "900", fontSize: 10 }}>#{index + 1}</Text>
              </View>
              <View style={{ flex: 1, padding: 8, justifyContent: "space-between" }}>
                <View
                  style={{
                    alignSelf: "flex-start",
                    paddingVertical: 3,
                    paddingHorizontal: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(245,196,81,0.45)",
                    backgroundColor: "rgba(245,196,81,0.16)",
                  }}
                >
                  <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 10 }}>
                    {item.sponsor_tag === "House Sponsor" ? "House Sponsor" : "Dealer"}
                  </Text>
                </View>
                <View>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }} numberOfLines={2}>
                    {item.sponsor_name}
                  </Text>
                  <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 10, marginTop: 5 }} numberOfLines={1}>
                    {item.cta}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("common.loading_feed", { defaultValue: "Loading feed…" })}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("feed.no_dealer_campaigns", { defaultValue: "No dealer campaigns yet." })}</Text>
              </View>
            )
          }
        />
      ) : mode === "shop" ? (
        <FlatList
          ref={feedListRef as any}
          key="shop-grid"
          data={shopCampaigns}
          numColumns={DEALER_COLUMNS}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View>{Header}</View>}
          columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: DEALER_SIDE_PADDING }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={false}
          windowSize={9}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          onScroll={onFeedScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={async () => {
                await openAdRoute(String(item.route ?? ""));
              }}
              style={{
                width: DEALER_TILE_W,
                aspectRatio: 1,
                marginBottom: DEALER_GAP,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
              }}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} resizeMode="cover" />
              ) : null}
              <View style={{ position: "absolute", inset: 0, backgroundColor: item.image_url ? "rgba(0,0,0,0.45)" : "transparent" }} />
              <View
                style={{
                  position: "absolute",
                  right: 6,
                  top: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(124,255,178,0.55)",
                  backgroundColor: "rgba(124,255,178,0.16)",
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ color: "#7CFFB2", fontWeight: "900", fontSize: 10 }}>#{index + 1}</Text>
              </View>
              <View style={{ flex: 1, padding: 8, justifyContent: "space-between" }}>
                <View
                  style={{
                    alignSelf: "flex-start",
                    paddingVertical: 3,
                    paddingHorizontal: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(245,196,81,0.45)",
                    backgroundColor: "rgba(245,196,81,0.16)",
                  }}
                >
                  <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 10 }}>
                    {t("stores.title", { defaultValue: "Store" })}
                  </Text>
                </View>
                <View>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }} numberOfLines={2}>
                    {item.sponsor_name}
                  </Text>
                  <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={{ color: "#F5C451", fontWeight: "900", fontSize: 10, marginTop: 5 }} numberOfLines={1}>
                    {item.cta}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("common.loading_feed", { defaultValue: "Loading feed…" })}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("stores.empty", { defaultValue: "No store products available yet." })}</Text>
              </View>
            )
          }
        />
      ) : mode === "top" ? (
        <FlatList
          ref={feedListRef as any}
          key="top-grid"
          data={feedRows}
          numColumns={TOP_GRID_COLUMNS}
          keyExtractor={(row) => row.key}
          ListHeaderComponent={<View>{Header}</View>}
          columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={false}
          windowSize={5}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={60}
          getItemLayout={getTopGridItemLayout}
          onScroll={undefined}
          renderItem={renderTopTile}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("common.loading_feed", { defaultValue: "Loading feed…" })}</Text>
              </View>
            ) : feedLoadError ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{feedLoadError}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("feed.no_posts_yet", { defaultValue: "No posts yet." })}</Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          ref={feedListRef}
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
          windowSize={Platform.OS === "android" ? 5 : 9}
          initialNumToRender={Platform.OS === "android" ? 5 : 7}
          maxToRenderPerBatch={Platform.OS === "android" ? 5 : 7}
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
            ) : feedLoadError ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{feedLoadError}</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted }}>{t("feed.no_posts_yet", { defaultValue: "No posts yet." })}</Text>
              </View>
            )
          }
        />
      )}

      {showBackToTop ? (
        <Pressable
          onPress={() => {
            feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
            setShowBackToTop(false);
            show();
          }}
          style={{
            position: "absolute",
            right: 16,
            bottom: Math.max(insets.bottom + 78, 90),
            width: 54,
            height: 54,
            borderRadius: 27,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
            shadowColor: "#F5C451",
            shadowOpacity: 0.32,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
            overflow: "hidden",
          }}
          hitSlop={8}
        >
          <LinearGradient
            colors={["#FFE7A3", "#F5C451", "#D8A733"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 27,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.35)",
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(11,11,15,0.22)",
              }}
            >
              <Ionicons name="chevron-up" size={18} color={COLORS.white} />
            </View>
          </LinearGradient>
        </Pressable>
      ) : null}

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
                    onPress={() => {
                      const p = menuPost;
                      closePostMenu();
                      router.push({ pathname: "/edit-post", params: { id: p.id } });
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
                    <Ionicons name="pencil-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.edit_post", { defaultValue: "Edit post" })}</Text>
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

      <Modal
        transparent
        visible={reactionPickerPostId !== null}
        animationType="fade"
        onRequestClose={() => setReactionPickerPostId(null)}
      >
        <Pressable
          onPress={() => setReactionPickerPostId(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", alignItems: "center" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              marginBottom: insets.bottom + 90,
              flexDirection: "row",
              gap: 4,
              backgroundColor: "#1A1A26",
              borderRadius: 40,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              elevation: 10,
            }}
          >
            {FEED_REACTION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  const pid = reactionPickerPostId;
                  setReactionPickerPostId(null);
                  if (!pid) return;
                  const post = items.find((x) => x.id === pid);
                  if (!post) return;
                  void chooseFeedReaction(pid, opt.key, post.liked_by_me, post.user_id);
                }}
                style={({ pressed }) => ({
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(255,255,255,0.1)" : "transparent",
                })}
              >
                <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
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

      {/* Premium upgrade modal — shown when non-premium users tap a PREMIUM badge */}
      <Modal visible={showPremiumModal} transparent animationType="fade" onRequestClose={() => setShowPremiumModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowPremiumModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["#1a1408", "#201a07", "#11110f"]}
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: Math.max(insets.bottom + 16, 32),
                borderTopWidth: 1,
                borderColor: "rgba(245,196,81,0.35)",
              }}
            >
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <View style={{ backgroundColor: "rgba(245,196,81,0.14)", borderRadius: 999, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "rgba(245,196,81,0.4)" }}>
                  <Ionicons name="star" size={28} color="#FFD36A" />
                </View>
                <Text style={{ color: "#FFD36A", fontWeight: "900", fontSize: 20 }}>
                  {t("premium.modal_title", { defaultValue: "This rider is Premium" })}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
                  {t("premium.modal_body", { defaultValue: "Premium members ride without ads, unlock exclusive style packs, and get early access to new features." })}
                </Text>
              </View>

              <View style={{ gap: 10, marginBottom: 20 }}>
                {([
                  { icon: "ban-outline" as const, text: t("premium.perk_ad_free", { defaultValue: "Ad-free browsing" }) },
                  { icon: "color-palette-outline" as const, text: t("premium.perk_style_packs", { defaultValue: "Exclusive style packs" }) },
                  { icon: "flash-outline" as const, text: t("premium.perk_early_access", { defaultValue: "Early access to new features" }) },
                ] as { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }[]).map(({ icon, text }) => (
                  <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name={icon} size={18} color="#FFD36A" />
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: "700" }}>{text}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => { setShowPremiumModal(false); router.push("/premium"); }}
                style={{
                  backgroundColor: "#F5C451",
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#0b0b0f", fontWeight: "900", fontSize: 16 }}>
                  {t("premium.upgrade_cta", { defaultValue: "Upgrade to Premium" })}
                </Text>
              </Pressable>

              <Pressable onPress={() => setShowPremiumModal(false)} style={{ marginTop: 14, alignItems: "center" }}>
                <Text style={{ color: COLORS.muted, fontSize: 14 }}>{t("common.not_now", { defaultValue: "Not now" })}</Text>
              </Pressable>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}