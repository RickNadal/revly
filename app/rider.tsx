// app/rider.tsx
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type Post = {
  id: string;
  caption: string | null;
  created_at: string;
  visibility: "public" | "private";
  post_media: { url: string; sort_order: number }[];
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIDE_PADDING = 16;
const CARD_PADDING = 12;
const CAROUSEL_W = SCREEN_W - PAGE_SIDE_PADDING * 2 - CARD_PADDING * 2;
const CAROUSEL_H = 220;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function openViewer(urls: string[], index: number) {
  if (!urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      // ✅ same stable pattern as your feed/profile
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

  // Restore scroll position if row gets recycled/re-mounted
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
            <Pressable
              onPress={() => openViewer(urls, index)}
              style={{ width: CAROUSEL_W, height: CAROUSEL_H }}
            >
              <Image
                source={{ uri: item }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />

        {/* Counter */}
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

        {/* Dots */}
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
}

export default function RiderScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const riderId = params.id;

  const [me, setMe] = useState<string | null>(null);
  const [name, setName] = useState("Rider");
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Remember carousel page per post
  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

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

    // Name
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", riderId)
      .single();

    if (profErr) console.log("RIDER PROFILE ERROR:", profErr);
    setName(prof?.full_name ?? "Rider");

    // Counts
    const { count: followers } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", riderId);

    const { count: following } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", riderId);

    setFollowersCount(followers ?? 0);
    setFollowingCount(following ?? 0);

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
      .select("id, caption, created_at, visibility, post_media(url, sort_order)")
      .eq("user_id", riderId)
      .order("created_at", { ascending: false });

    if (myId !== riderId) q = q.eq("visibility", "public");

    const { data: p, error: pErr } = await q;
    if (pErr) console.log("RIDER POSTS ERROR:", pErr);

    const normalized = (p ?? []).map((row: any) => ({
      ...row,
      post_media: (row.post_media ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    setPosts(normalized);
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

    if (error) return Alert.alert("Follow failed", error.message);

    setIsFollowing(true);
    setFollowersCount((x) => x + 1);
  };

  const unfollow = async () => {
    if (!me || !riderId || me === riderId) return;

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", me)
      .eq("following_id", riderId);

    if (error) return Alert.alert("Unfollow failed", error.message);

    setIsFollowing(false);
    setFollowersCount((x) => Math.max(0, x - 1));
  };

  const setCarouselIndex = (postId: string, index: number) => {
    setCarouselIndexByPost((prev) => {
      if (prev[postId] === index) return prev;
      return { ...prev, [postId]: index };
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {/* Header */}
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>{name}</Text>
        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>Rider profile</Text>

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
              Followers: {followersCount}
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
              Following: {followingCount}
            </Text>
          </Pressable>
        </View>

        {/* Follow */}
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
              {isFollowing ? "Following ✓ (tap to unfollow)" : "Follow"}
            </Text>
          </Pressable>
        ) : null}

        {/* Posts */}
        <Text style={{ marginTop: 18, fontWeight: "900", color: COLORS.text }}>
          Posts ({posts.length})
        </Text>

        {loading ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>Loading...</Text>
        ) : posts.length === 0 ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>No posts yet.</Text>
        ) : (
          <FlatList
            style={{ marginTop: 10 }}
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 30 }}
            removeClippedSubviews={false}
            renderItem={({ item }) => {
              const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);
              const currentIndex = carouselIndexByPost[item.id] ?? 0;

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
                  {/* Carousel */}
                  {urls.length > 0 ? (
                    <PostCarousel
                      postId={item.id}
                      urls={urls}
                      currentIndex={currentIndex}
                      onIndexChange={setCarouselIndex}
                    />
                  ) : null}

                  {item.caption ? (
                    <Text style={{ marginTop: 10, color: COLORS.text }}>{item.caption}</Text>
                  ) : null}

                  <Text style={{ marginTop: 8, color: COLORS.muted, fontWeight: "700" }}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
