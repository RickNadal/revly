// app/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type PostRow = {
  id: string;
  caption: string | null;
  visibility: "public" | "private";
  created_at: string;
  user_id: string;
  post_media: { url: string; sort_order: number }[];
};

type FeedItem = PostRow & {
  author_name: string;
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
};

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_SIDE_MARGIN = 16;
const CARD_PADDING = 12;
const IMAGE_W = SCREEN_W - CARD_SIDE_MARGIN * 2 - CARD_PADDING * 2;
const IMAGE_H = 280;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Index() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"discover" | "following">("discover");

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) router.replace("/sign-in");
  };

  useFocusEffect(
    useCallback(() => {
      ensureAuth();
    }, [])
  );

  const loadFeed = useCallback(async (activeMode: "discover" | "following") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    const me = session.user.id;

    let followingIds: string[] = [];
    if (activeMode === "following") {
      const { data: f, error: fErr } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me);

      if (fErr) console.log("FOLLOWS ERROR:", fErr);
      followingIds = (f ?? []).map((x: any) => x.following_id);
    }

    let postQuery = supabase
      .from("posts")
      .select("id, caption, visibility, created_at, user_id, post_media(url, sort_order)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (activeMode === "following") {
      const ids = Array.from(new Set([...followingIds, me]));
      postQuery = postQuery.in("user_id", ids);
    }

    const { data: posts, error: postErr } = await postQuery;

    if (postErr) {
      console.log("POSTS ERROR:", postErr);
      if (aliveRef.current) setItems([]);
      return;
    }

    const normalizedPosts: PostRow[] = (posts ?? []).map((p: any) => ({
      ...p,
      post_media: (p.post_media ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    const postIds = normalizedPosts.map((p) => p.id);
    const userIds = Array.from(new Set(normalizedPosts.map((p) => p.user_id)));

    const profilesPromise =
      userIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [], error: null } as any);

    const likesPromise =
      postIds.length > 0
        ? supabase.from("likes").select("post_id, user_id").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null } as any);

    const commentsPromise =
      postIds.length > 0
        ? supabase.from("comments").select("post_id").in("post_id", postIds)
        : Promise.resolve({ data: [], error: null } as any);

    const [
      { data: profs, error: pErr },
      { data: likes, error: likesErr },
      { data: comments, error: cErr },
    ] = await Promise.all([profilesPromise, likesPromise, commentsPromise]);

    if (pErr) console.log("PROFILES ERROR:", pErr);
    if (likesErr) console.log("LIKES ERROR:", likesErr);
    if (cErr) console.log("COMMENTS ERROR:", cErr);

    const nameById = new Map<string, string>();
    for (const pr of profs ?? []) nameById.set(pr.id, pr.full_name ?? "Rider");

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

    const feed: FeedItem[] = normalizedPosts.map((p) => ({
      ...p,
      author_name: nameById.get(p.user_id) ?? "Rider",
      like_count: likeCountByPost.get(p.id) ?? 0,
      liked_by_me: likedByMeSet.has(p.id),
      comment_count: commentCountByPost.get(p.id) ?? 0,
    }));

    if (aliveRef.current) setItems(feed);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const toggleLike = async (postId: string, currentlyLiked: boolean) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return router.replace("/sign-in");
    const me = session.user.id;

    setItems((prev) =>
      prev.map((it) =>
        it.id === postId
          ? {
              ...it,
              liked_by_me: !currentlyLiked,
              like_count: Math.max(0, it.like_count + (currentlyLiked ? -1 : 1)),
            }
          : it
      )
    );

    if (currentlyLiked) {
      const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", me);
      if (error) Alert.alert("Unlike failed", error.message);
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: me });
      if (error) Alert.alert("Like failed", error.message);
    }
  };

  const openViewer = (urls: string[], index: number) => {
    if (!urls || urls.length === 0) return;
    router.push({
      pathname: "/viewer",
      params: { urls: JSON.stringify(urls), index: String(index) },
    });
  };

  const IconBtn = ({
    icon,
    label,
    onPress,
    danger,
  }: {
    icon: any;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: danger ? "#2A1114" : COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <Ionicons name={icon} size={22} color={COLORS.text} />
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadFeed(mode);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  };

  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

  const setCarouselIndex = (postId: string, idx: number) => {
    setCarouselIndexByPost((prev) => {
      if (prev[postId] === idx) return prev;
      return { ...prev, [postId]: idx };
    });
  };

  const PostCarousel = ({ postId, urls }: { postId: string; urls: string[] }) => {
    const currentIndex = carouselIndexByPost[postId] ?? 0;
    const listRef = useRef<FlatList<string>>(null);
    const safeIndex = clamp(currentIndex, 0, Math.max(0, urls.length - 1));

    useEffect(() => {
      const t = setTimeout(() => {
        if (urls.length <= 1) return;
        try {
          listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
        } catch {}
      }, 0);
      return () => clearTimeout(t);
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
            getItemLayout={(_, index) => ({
              length: IMAGE_W,
              offset: IMAGE_W * index,
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
              <Pressable onPress={() => openViewer(urls, index)} style={{ width: IMAGE_W, height: IMAGE_H }}>
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
                    backgroundColor:
                      i === safeIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                    transform: [{ scale: i === safeIndex ? 1.15 : 1 }],
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const unreadDot = useMemo(
    () => items.some((x) => x.liked_by_me || x.comment_count >= 0),
    [items]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 34, fontWeight: "900", color: COLORS.text }}>Revly</Text>

          {/* ✅ Feedback link (doesn't mess up your icon row) */}
          <Pressable
            onPress={() => router.push("/feedback")}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Feedback</Text>
          </Pressable>
        </View>

        <Text style={{ marginTop: -2, color: COLORS.muted, fontWeight: "800" }}>
          Where bikers connect
        </Text>

        {/* Icon actions */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <IconBtn icon="notifications-outline" label="Notifs" onPress={() => router.push("/notifications")} />
          <IconBtn icon="add-circle-outline" label="Post" onPress={() => router.push("/new-post")} />
          <IconBtn icon="search-outline" label="Search" onPress={() => router.push("/search")} />
          <IconBtn icon="person-outline" label="Me" onPress={() => router.push("/profile")} />
          <IconBtn
            icon="log-out-outline"
            label="Out"
            danger
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace("/sign-in");
            }}
          />
        </View>

        {/* Discover / Following */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
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
            <Text style={{ color: mode === "discover" ? COLORS.black : COLORS.text, fontWeight: "900" }}>
              Discover
            </Text>
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
            <Text style={{ color: mode === "following" ? COLORS.black : COLORS.text, fontWeight: "900" }}>
              Following
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Feed */}
      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: COLORS.muted }}>Loading feed…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={false}
          renderItem={({ item }) => {
            const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);
            const first = urls[0];

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
                {/* Author */}
                <Pressable onPress={() => router.push({ pathname: "/rider", params: { id: item.user_id } })}>
                  <Text style={{ fontWeight: "900", color: COLORS.text, fontSize: 16 }}>
                    {item.author_name}
                  </Text>
                </Pressable>

                <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                  {item.visibility === "private" ? "Private" : "Public"} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </Text>

                {/* Carousel */}
                {urls.length > 0 ? <PostCarousel postId={item.id} urls={urls} /> : null}

                {/* Caption */}
                {item.caption ? (
                  <Text style={{ marginTop: 10, fontSize: 16, color: COLORS.text }}>
                    {item.caption}
                  </Text>
                ) : null}

                {/* Actions */}
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
                    <Ionicons
                      name={item.liked_by_me ? "heart" : "heart-outline"}
                      size={18}
                      color={item.liked_by_me ? COLORS.black : COLORS.text}
                    />
                    <Text style={{ color: item.liked_by_me ? COLORS.black : COLORS.text, fontWeight: "900" }}>
                      {item.like_count}
                    </Text>
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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {item.comment_count}
                    </Text>
                  </Pressable>

                  <View style={{ flex: 1 }} />

                  {urls.length > 0 ? (
                    <Pressable
                      onPress={() => openViewer(urls, carouselIndexByPost[item.id] ?? 0)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: COLORS.chip,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>View</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
              <Text style={{ color: COLORS.muted }}>
                No posts yet. Tap “Post” to share your first ride.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
