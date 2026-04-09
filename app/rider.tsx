// app/rider.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MentionText from "../components/MentionText";
import { sendPushEvent } from "../lib/push";
import { supabase } from "../lib/supabase";


type ProfileRole = "user" | "moderator" | "admin";
type PremiumStyle = "classic" | "aurora" | "sunset" | "electric";

type Post = {
  id: string;
  caption: string | null;
  created_at: string;
  visibility: "public" | "private";
  user_id: string;
  post_media: { url: string; sort_order: number }[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
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

const MAX_VISIBLE_FEED_REACTION_CHIPS = 3;

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  badgeBg: "rgba(255,255,255,0.10)",
  badgeBorder: "#232334",
  badgeGold: "#F5C451",
  badgeGreen: "#7CFFB2",
};

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIDE_PADDING = 16;
const CARD_PADDING = 12;
const CAROUSEL_W = SCREEN_W - PAGE_SIDE_PADDING * 2 - CARD_PADDING * 2;
const CAROUSEL_H = 220;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone?: "default" | "gold" | "green";
}) {
  const color = tone === "gold" ? COLORS.badgeGold : tone === "green" ? COLORS.badgeGreen : COLORS.text;

  return (
    <View
      style={{
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: COLORS.badgeBg,
        borderWidth: 1,
        borderColor: COLORS.badgeBorder,
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function premiumTone(style: PremiumStyle): "green" | "gold" {
  if (style === "sunset") return "gold";
  return "green";
}

function openViewer(urls: string[], index: number) {
  if (!urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      urls: JSON.stringify(urls),
      index: String(index),
    },
  });
}

function PostCarousel({
  postId,
  urls,
  currentIndex,
  onIndexChange,
}: {
  postId: string;
  urls: string[];
  currentIndex: number;
  onIndexChange: (postId: string, index: number) => void;
}) {
  const listRef = useRef<FlatList<string>>(null);
  const safeIndex = clamp(currentIndex, 0, Math.max(0, urls.length - 1));

  useEffect(() => {
    const idx = clamp(safeIndex, 0, Math.max(0, urls.length - 1));
    const t = setTimeout(() => {
      if (urls.length <= 1) return;
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, urls.length]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = clamp(Math.round(x / CAROUSEL_W), 0, urls.length - 1);
    if (idx !== safeIndex) onIndexChange(postId, idx);
  };

  return (
    <View style={{ marginTop: 10 }}>
      <View
        style={{
          width: "100%",
          height: CAROUSEL_H,
          borderRadius: 14,
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
          snapToInterval={CAROUSEL_W}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          bounces={false}
          overScrollMode="never"
          nestedScrollEnabled={Platform.OS === "android"}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, index) => ({
            length: CAROUSEL_W,
            offset: CAROUSEL_W * index,
            index,
          })}
          initialScrollIndex={safeIndex}
          onScrollToIndexFailed={() => {
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
              } catch {}
            }, 40);
          }}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => openViewer(urls, index)} style={{ width: CAROUSEL_W, height: CAROUSEL_H }}>
              <Image source={{ uri: item }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            </Pressable>
          )}
        />

        {urls.length > 1 ? (
          <View
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
            pointerEvents="none"
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              {safeIndex + 1} / {urls.length}
            </Text>
          </View>
        ) : null}

        {urls.length > 1 ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 10,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
            pointerEvents="none"
          >
            {urls.map((_, i) => (
              <View
                key={`${postId}-dot-${i}`}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: i === safeIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                  transform: [{ scale: i === safeIndex ? 1.15 : 1 }],
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function RiderScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ id: string }>();
  const riderId = params.id;

  const [me, setMe] = useState<string | null>(null);

  const [name, setName] = useState(t("feed.rider_fallback", { defaultValue: "Rider" }));
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [role, setRole] = useState<ProfileRole>("user");
  const [isPremium, setIsPremium] = useState(false);
  const [premiumStyle, setPremiumStyle] = useState<PremiumStyle>("classic");
  const [isLegacy, setIsLegacy] = useState(false);
  const [isSupporter, setIsSupporter] = useState(false);
  const [botmWinsCount, setBotmWinsCount] = useState(0);
  const [isBotmChampion, setIsBotmChampion] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [giftsReceivedCount, setGiftsReceivedCount] = useState(0);

  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});
  const [postViewMode, setPostViewMode] = useState<"list" | "grid">("list");
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [myFeedReactions, setMyFeedReactions] = useState<Record<string, FeedReactionKind>>({});
  const [reactionCountsByPost, setReactionCountsByPost] = useState<Record<string, FeedReactionCountMap>>({});

  type RecentGift = { id: string; emoji: string; name: string; count: number };
  const [recentGifts, setRecentGifts] = useState<RecentGift[]>([]);

  const load = async () => {
    if (!riderId) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }

    const myId = session.user.id;
    setMe(myId);

    // Name + badges
    let prof: any = null;
    let profErr: any = null;

    const fullProfile = await supabase
      .from("profiles")
      .select("full_name, bio, avatar_url, banner_url, role, is_premium, premium_style, is_legacy, is_supporter, botm_wins_count, botm_champion_until")
      .eq("id", riderId)
      .maybeSingle();

    const fullProfileErr = String(fullProfile.error?.message ?? "").toLowerCase();
    if (fullProfile.error && (fullProfileErr.includes("avatar_url") || fullProfileErr.includes("is_supporter"))) {
      const fallback = await supabase
        .from("profiles")
        .select("full_name, bio, avatar_url, banner_url, role, is_premium, premium_style, is_legacy, is_supporter, botm_wins_count, botm_champion_until")
        .eq("id", riderId)
        .maybeSingle();
      prof = fallback.data;
      profErr = fallback.error;
    } else {
      prof = fullProfile.data;
      profErr = fullProfile.error;
    }

    if (profErr) console.log("RIDER PROFILE ERROR:", profErr);

    setName(prof?.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
    setBio(String(prof?.bio ?? ""));
    setAvatarUrl(String(prof?.avatar_url ?? ""));
    setBannerUrl(String(prof?.banner_url ?? ""));
    setRole(((prof as any)?.role ?? "user") as ProfileRole);
    setIsPremium(!!(prof as any)?.is_premium);
    const style = String((prof as any)?.premium_style ?? "classic") as PremiumStyle;
    setPremiumStyle(style === "aurora" || style === "sunset" || style === "electric" ? style : "classic");
    setIsLegacy(!!(prof as any)?.is_legacy);
    setIsSupporter(!!(prof as any)?.is_supporter);
    setBotmWinsCount(Number((prof as any)?.botm_wins_count ?? 0));
    const championUntil = String((prof as any)?.botm_champion_until ?? "").trim();
    setIsBotmChampion(!!championUntil && new Date(championUntil).getTime() > Date.now());

    // Counts
    const { count: followers } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", riderId);

    const { count: following } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", riderId);

    const { count: giftsReceived } = await supabase.from("user_gifts" as any).select("*", { count: "exact", head: true }).eq("recipient_id", riderId);

    setFollowersCount(followers ?? 0);
    setFollowingCount(following ?? 0);
    setGiftsReceivedCount(giftsReceived ?? 0);

    // Follow status
    if (myId !== riderId) {
      const { data: f, error: fErr } = await supabase
        .from("follows")
        .select("follower_id, following_id")
        .eq("follower_id", myId)
        .eq("following_id", riderId)
        .maybeSingle();

      if (fErr) console.log("FOLLOW STATUS ERROR:", fErr);
      setIsFollowing(!!f);
    } else {
      setIsFollowing(false);
    }

    // Posts
    let q = supabase
      .from("posts")
      .select("id, caption, created_at, visibility, user_id, post_media(url, sort_order)")
      .eq("user_id", riderId)
      .order("created_at", { ascending: false });

    if (myId !== riderId) q = q.eq("visibility", "public");

    const { data: p, error: pErr } = await q;
    if (pErr) console.log("RIDER POSTS ERROR:", pErr);

    const normalized = (p ?? []).map((row: any) => ({
      ...row,
      post_media: (row.post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

    const postIds = normalized.map((row: any) => String(row.id)).filter(Boolean);

    const likesPromise =
      postIds.length > 0
        ? supabase.from("likes").select("post_id, user_id").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null } as any);

    const commentsPromise =
      postIds.length > 0
        ? supabase.from("comments").select("post_id").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null } as any);

    const reactionsPromise =
      postIds.length > 0
        ? supabase.from("post_reactions").select("post_id, user_id, reaction").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null } as any);

    const [{ data: likes }, { data: comments }, { data: reactions }] = await Promise.all([
      likesPromise,
      commentsPromise,
      reactionsPromise,
    ]);

    const likeCountByPost = new Map<string, number>();
    const likedByMeSet = new Set<string>();
    for (const like of (likes ?? []) as any[]) {
      const postId = String(like.post_id ?? "");
      if (!postId) continue;
      likeCountByPost.set(postId, (likeCountByPost.get(postId) ?? 0) + 1);
      if (String(like.user_id ?? "") === myId) likedByMeSet.add(postId);
    }

    const commentCountByPost = new Map<string, number>();
    for (const comment of (comments ?? []) as any[]) {
      const postId = String(comment.post_id ?? "");
      if (!postId) continue;
      commentCountByPost.set(postId, (commentCountByPost.get(postId) ?? 0) + 1);
    }

    const nextReactionCounts: Record<string, FeedReactionCountMap> = {};
    const nextMyReactions: Record<string, FeedReactionKind> = {};
    for (const reactionRow of (reactions ?? []) as any[]) {
      const postId = String(reactionRow.post_id ?? "");
      const userId = String(reactionRow.user_id ?? "");
      const reaction = String(reactionRow.reaction ?? "") as FeedReactionKind;
      if (!postId || !(reaction in EMPTY_FEED_REACTION_COUNTS)) continue;
      if (!nextReactionCounts[postId]) {
        nextReactionCounts[postId] = { ...EMPTY_FEED_REACTION_COUNTS };
      }
      nextReactionCounts[postId][reaction] += 1;
      if (userId === myId) nextMyReactions[postId] = reaction;
    }

    const postsWithCounts: Post[] = normalized.map((row: any) => ({
      ...row,
      like_count: likeCountByPost.get(row.id) ?? 0,
      comment_count: commentCountByPost.get(row.id) ?? 0,
      liked_by_me: likedByMeSet.has(row.id),
    }));

    setPosts(postsWithCounts);
    setMyFeedReactions(nextMyReactions);
    setReactionCountsByPost(nextReactionCounts);

    // Load recent gifts received by this rider
    try {
      const { data: giftsData } = await supabase
        .from("user_gifts" as any)
        .select("id, gift_types(emoji, name)")
        .eq("recipient_id", riderId)
        .order("created_at", { ascending: false })
        .limit(50);

      const grouped = new Map<string, RecentGift>();
      for (const gift of (giftsData ?? []) as any[]) {
        const emoji = String(gift.gift_types?.emoji ?? "🎁");
        const name = String(gift.gift_types?.name ?? "Gift");
        const key = `${emoji}::${name}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        grouped.set(key, {
          id: String(gift.id),
          emoji,
          name,
          count: 1,
        });
      }

      setRecentGifts(Array.from(grouped.values()));
    } catch {}

    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [riderId])
  );

  const follow = async () => {
    if (!me || !riderId || me === riderId) return;

    const { error } = await supabase.from("follows").insert({
      follower_id: me,
      following_id: riderId,
    });

    if (error) return Alert.alert(t("rider.follow_failed_title", { defaultValue: "Follow failed" }), error.message);

    await sendPushEvent({
      recipientUserId: riderId,
      type: "follow",
      postId: null,
    });

    setIsFollowing(true);
    setFollowersCount((x) => x + 1);
  };

  const unfollow = async () => {
    if (!me || !riderId || me === riderId) return;

    const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", riderId);

    if (error) return Alert.alert(t("rider.unfollow_failed_title", { defaultValue: "Unfollow failed" }), error.message);

    setIsFollowing(false);
    setFollowersCount((x) => Math.max(0, x - 1));
  };

  const setCarouselIndex = (postId: string, index: number) => {
    setCarouselIndexByPost((prev) => {
      if (prev[postId] === index) return prev;
      return { ...prev, [postId]: index };
    });
  };

  const toggleLike = async (postId: string, currentlyLiked: boolean, postOwnerId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return router.replace("/sign-in");
    const myId = session.user.id;

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, liked_by_me: !currentlyLiked, like_count: Math.max(0, post.like_count + (currentlyLiked ? -1 : 1)) }
          : post
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
          const total = Object.values(current).reduce((sum, count) => sum + count, 0);
          if (total === 0) delete next[postId];
          return next;
        });
      }

      const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", myId);
      if (error) Alert.alert(t("feed.unlike_failed_title", { defaultValue: "Unlike failed" }), error.message);
      await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", myId);
      return;
    }

    const { error } = await supabase.from("likes").upsert({ post_id: postId, user_id: myId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    if (error) {
      Alert.alert(t("feed.like_failed_title", { defaultValue: "Like failed" }), error.message);
      return;
    }

    if (postOwnerId && postOwnerId !== myId) {
      await sendPushEvent({
        recipientUserId: postOwnerId,
        type: "like",
        postId,
      });
    }
  };

  const chooseFeedReaction = async (postId: string, reaction: FeedReactionKind, currentlyLiked: boolean, postOwnerId: string) => {
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
    const myId = sessionData.session?.user?.id;
    if (!myId) return;

    const { error: reactionErr } = await supabase.from("post_reactions").upsert(
      {
        post_id: postId,
        user_id: myId,
        reaction,
      } as any,
      { onConflict: "post_id,user_id" }
    );

    if (reactionErr) {
      Alert.alert("Reaction failed", reactionErr.message);
      return;
    }

    if (!currentlyLiked) {
      await toggleLike(postId, false, postOwnerId);
    }
  };

  const openProfileMediaViewer = (url: string | null | undefined) => {
    const mediaUrl = String(url ?? "").trim();
    if (!mediaUrl) return;

    router.push({
      pathname: "/viewer",
      params: {
        urls: JSON.stringify([mediaUrl]),
        index: "0",
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <FlatList
        data={postViewMode === "list" ? posts : posts.filter((p) => (p.post_media ?? []).length > 0)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 36, 52) }}
        removeClippedSubviews={false}
        ListHeaderComponent={
          <View style={{ paddingTop: 8 }}>
            {/* Banner */}
            <Pressable
              onPress={() => openProfileMediaViewer(bannerUrl)}
              disabled={!bannerUrl}
              style={{
                marginBottom: 10,
                height: 130,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              {bannerUrl ? <Image source={{ uri: bannerUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
            </Pressable>

            {/* Avatar + Name + Bio row */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
              {/* Left: avatar */}
              <Pressable
                onPress={() => openProfileMediaViewer(avatarUrl)}
                disabled={!avatarUrl}
                style={{ width: 86, height: 86, borderRadius: 43, overflow: "hidden", backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
              >
                {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
              </Pressable>

              {/* Right: name, badges, bio */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: role === "moderator" ? COLORS.badgeGreen : COLORS.text }}>{name}</Text>
                  {me && riderId && me !== riderId && isFollowing ? <Badge label="Following ✓" tone="green" /> : null}
                  {role === "admin" ? <Badge label={t("rider.badge_admin", { defaultValue: "ADMIN" })} tone="gold" /> : null}
                  {role === "moderator" ? <Badge label={t("rider.badge_mod", { defaultValue: "MOD" })} tone="green" /> : null}
                  {isLegacy ? <Badge label={t("rider.badge_legacy", { defaultValue: "LEGACY" })} tone="gold" /> : null}
                  {isPremium ? <Badge label={t("rider.badge_premium", { defaultValue: "PREMIUM" })} tone={premiumTone(premiumStyle)} /> : null}
                  {isSupporter ? <Badge label={t("rider.badge_supporter", { defaultValue: "SUPPORTER" })} tone="gold" /> : null}
                  {isBotmChampion ? <Badge label={t("rider.badge_botm_champ", { defaultValue: "BOTM CHAMP" })} tone="gold" /> : null}
                  {botmWinsCount > 0 ? <Badge label={t("rider.badge_botm_winner", { defaultValue: `BOTM WINNER x${botmWinsCount}` })} tone="gold" /> : null}
                </View>
                <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 11, marginBottom: 4 }}>
                  {t("rider.bio_title", { defaultValue: "Bike & Gear" })}
                </Text>
                <Text style={{ color: bio.trim() ? COLORS.text : COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                  {bio.trim() || t("rider.bio_empty", { defaultValue: "No bio yet." })}
                </Text>
              </View>
            </View>

            {/* Counts */}
            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/followers", params: { id: riderId } })}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  {t("rider.followers", { defaultValue: "Followers: {{count}}", count: followersCount })}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/following", params: { id: riderId } })}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  {t("rider.following", { defaultValue: "Following: {{count}}", count: followingCount })}
                </Text>
              </Pressable>

              <View
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  {t("rider.gifts_received", { defaultValue: "Gifts: {{count}}", count: giftsReceivedCount })}
                </Text>
              </View>
            </View>

            {/* Follow / Unfollow */}
            {me && riderId && me !== riderId ? (
              <Pressable
                onPress={isFollowing ? unfollow : follow}
                style={{
                  marginTop: 12,
                  backgroundColor: isFollowing ? COLORS.chip : COLORS.button,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: isFollowing ? COLORS.text : COLORS.buttonText, fontWeight: "900" }}>
                  {isFollowing
                    ? t("rider.following_cta", { defaultValue: "Following ✓ (tap to unfollow)" })
                    : t("rider.follow_cta", { defaultValue: "Follow" })}
                </Text>
              </Pressable>
            ) : null}

            {/* Gift button — only shown when viewing someone else's profile */}
            {me && riderId && me !== riderId ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/gift-shop",
                    params: { recipientId: riderId, recipientName: name },
                  })
                }
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(181,123,255,0.45)",
                  backgroundColor: "rgba(181,123,255,0.08)",
                }}
              >
                <Text style={{ fontSize: 18 }}>🎁</Text>
                <Text style={{ color: "#C89BFF", fontWeight: "900", fontSize: 15 }}>
                  {t("gifts.send_button", { defaultValue: "Send a Gift" })}
                </Text>
              </Pressable>
            ) : null}

            {/* Recent gifts received */}
            {recentGifts.length > 0 ? (
              <View style={{ marginTop: 16 }}>
                <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 12, marginBottom: 8, letterSpacing: 0.8 }}>
                  {t("gifts.received_title", { defaultValue: "GIFTS RECEIVED" })}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {recentGifts.slice(0, 12).map((g) => (
                    <View
                      key={g.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        backgroundColor: "rgba(181,123,255,0.10)",
                        borderWidth: 1,
                        borderColor: "rgba(181,123,255,0.30)",
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{g.emoji}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
                        {g.name}{g.count > 1 ? ` x${g.count}` : ""}
                      </Text>
                    </View>
                  ))}
                  {recentGifts.length > 12 ? (
                    <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>+{recentGifts.length - 12}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Posts header with list/grid toggle */}
            <View style={{ marginTop: 18, marginBottom: 10 }}>
              <Text style={{ fontWeight: "900", color: COLORS.text, marginBottom: 10 }}>
                {t("rider.posts_title", { defaultValue: "Posts ({{count}})", count: posts.length })}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setPostViewMode("list")}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: "center",
                    backgroundColor: postViewMode === "list" ? COLORS.button : COLORS.chip,
                    borderWidth: 1,
                    borderColor: postViewMode === "list" ? "#7CFFB2" : COLORS.border,
                  }}
                >
                  <Text style={{ color: postViewMode === "list" ? COLORS.buttonText : COLORS.text, fontWeight: "900", fontSize: 14 }}>≡  Lijst</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPostViewMode("grid")}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: "center",
                    backgroundColor: postViewMode === "grid" ? COLORS.button : COLORS.chip,
                    borderWidth: 1,
                    borderColor: postViewMode === "grid" ? "#7CFFB2" : COLORS.border,
                  }}
                >
                  <Text style={{ color: postViewMode === "grid" ? COLORS.buttonText : COLORS.text, fontWeight: "900", fontSize: 14 }}>⊞  Raster</Text>
                </Pressable>
              </View>
            </View>

            {loading ? (
              <Text style={{ color: COLORS.muted }}>{t("common.loading", { defaultValue: "Loading…" })}</Text>
            ) : posts.length === 0 ? (
              <Text style={{ color: COLORS.muted }}>{t("rider.no_posts_yet", { defaultValue: "No posts yet." })}</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const urls = (item.post_media ?? []).map((m: any) => m.url).filter(Boolean);
          const currentIndex = carouselIndexByPost[item.id] ?? 0;
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

          if (postViewMode === "grid") {
            const firstUrl = urls[0];
            if (!firstUrl) return null;
            return (
              <View
                style={{
                  width: "32%",
                  aspectRatio: 1,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  marginBottom: 4,
                }}
              >
                <Pressable onPress={() => openViewer(urls, 0)} style={{ width: "100%", height: "100%" }}>
                  <Image source={{ uri: firstUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  {urls.length > 1 ? (
                    <View
                      style={{
                        position: "absolute",
                        right: 6,
                        top: 6,
                        paddingVertical: 3,
                        paddingHorizontal: 6,
                        borderRadius: 999,
                        backgroundColor: "rgba(0,0,0,0.6)",
                      }}
                      pointerEvents="none"
                    >
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 11 }}>+{urls.length - 1}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          }

          return (
            <View
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 16,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              {urls.length > 0 ? (
                <PostCarousel postId={item.id} urls={urls} currentIndex={currentIndex} onIndexChange={setCarouselIndex} />
              ) : null}
              {item.caption ? <MentionText text={item.caption} textStyle={{ marginTop: 10, color: COLORS.text }} /> : null}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => {
                    if (item.liked_by_me) {
                      void toggleLike(item.id, true, item.user_id);
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
                    backgroundColor: item.liked_by_me ? COLORS.button : COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  {item.liked_by_me ? <Text style={{ fontSize: 18 }}>{selectedReactionEmoji}</Text> : <Ionicons name="flame-outline" size={18} color="#FFB066" />}
                  <Text style={{ color: item.liked_by_me ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{item.like_count}</Text>
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
                    onPress={() => openViewer(urls, currentIndex)}
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

              <Text style={{ marginTop: 8, color: COLORS.muted, fontWeight: "700" }}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          );
        }}
        numColumns={postViewMode === "grid" ? 3 : 1}
        key={postViewMode}
        columnWrapperStyle={postViewMode === "grid" ? { justifyContent: "space-between" } : undefined}
      />

      <Modal transparent visible={reactionPickerPostId !== null} animationType="fade" onRequestClose={() => setReactionPickerPostId(null)}>
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
                  if (!pid) return;
                  const post = posts.find((entry) => entry.id === pid);
                  if (!post) {
                    setReactionPickerPostId(null);
                    return;
                  }
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

    </SafeAreaView>
  );
}
