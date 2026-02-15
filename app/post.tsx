// app/post.tsx
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  author_name: string;
};

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  visibility: "public" | "private";
  user_id: string;
  author_name: string;
  post_media: { url: string; sort_order: number }[];
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
};

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIDE_PADDING = 16; // you use <View style={{ padding: 16 }}>
const CARD_PADDING = 0; // there is no card wrapper around the image in this screen
const CAROUSEL_W = SCREEN_W - PAGE_SIDE_PADDING * 2 - CARD_PADDING * 2;
const CAROUSEL_H = 260;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function openViewer(urls: string[], index: number) {
  if (!urls.length) return;

  // ✅ stable pattern (no encodeURIComponent)
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

  // Restore scroll position if something re-mounts
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

export default function PostScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const postId = params.id;

  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<PostRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [meId, setMeId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // remember carousel index for this post
  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const subShow = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const load = async () => {
    if (!postId) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }

    const me = session.user.id;
    setMeId(me);

    const { data: p, error: pErr } = await supabase
      .from("posts")
      .select("id, caption, created_at, visibility, user_id, post_media(url, sort_order)")
      .eq("id", postId)
      .single();

    if (pErr) {
      console.log("POST LOAD ERROR:", pErr);
      setLoading(false);
      return;
    }

    const mediaSorted = (p.post_media ?? []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    const { data: author } = await supabase.from("profiles").select("full_name").eq("id", p.user_id).single();

    const postObj: PostRow = {
      ...p,
      author_name: author?.full_name ?? "Rider",
      post_media: mediaSorted,
    };

    const { data: c, error: cErr } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (cErr) console.log("COMMENTS LOAD ERROR:", cErr);

    const userIds = Array.from(new Set((c ?? []).map((x: any) => x.user_id)));
    const nameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profs, error: p2Err } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (p2Err) console.log("PROFILES ERROR:", p2Err);
      for (const pr of profs ?? []) nameById.set(pr.id, pr.full_name ?? "Rider");
    }

    const commentList: CommentRow[] = (c ?? []).map((row: any) => ({
      ...row,
      author_name: nameById.get(row.user_id) ?? "Rider",
    }));

    setPost(postObj);
    setComments(commentList);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [postId])
  );

  const setCarouselIndex = (id: string, index: number) => {
    setCarouselIndexByPost((prev) => {
      if (prev[id] === index) return prev;
      return { ...prev, [id]: index };
    });
  };

  const addComment = async () => {
    if (!postId) return;
    const content = text.trim();
    if (!content) return;

    setSending(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setSending(false);
      router.replace("/sign-in");
      return;
    }

    const me = session.user.id;

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: me,
      content,
    });

    if (error) {
      setSending(false);
      Alert.alert("Comment failed", error.message);
      return;
    }

    setText("");
    setSending(false);
    Keyboard.dismiss();
    load();
  };

  const deleteComment = async (commentId: string) => {
    Alert.alert("Delete comment?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("comments").delete().eq("id", commentId);

          if (error) {
            Alert.alert("Delete failed", error.message);
            return;
          }

          setComments((prev) => prev.filter((c) => c.id !== commentId));
        },
      },
    ]);
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.muted }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const urls = (post.post_media ?? []).map((m) => m.url).filter(Boolean);

  const inputBarHeight = 64;
  const extraBottom = insets.bottom + 12;
  const bottomOffset = keyboardHeight > 0 ? keyboardHeight : 0;

  const canDelete = (commentUserId: string) => {
    if (!meId) return false;
    return meId === commentUserId || meId === post.user_id;
  };

  const currentIndex = carouselIndexByPost[post.id] ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: COLORS.text }}>{post.author_name}</Text>
        <Text style={{ color: COLORS.muted, marginTop: 2 }}>
          {post.visibility === "private" ? "Private" : "Public"} · {new Date(post.created_at).toLocaleString()}
        </Text>

        {/* Carousel */}
        {urls.length > 0 ? (
          <PostCarousel postId={post.id} urls={urls} currentIndex={currentIndex} onIndexChange={setCarouselIndex} />
        ) : null}

        {post.caption ? (
          <Text style={{ marginTop: 10, fontSize: 16, color: COLORS.text }}>{post.caption}</Text>
        ) : null}

        <Text style={{ marginTop: 14, fontWeight: "900", color: COLORS.text }}>
          Comments ({comments.length})
        </Text>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: inputBarHeight + extraBottom + 16 + bottomOffset,
        }}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ fontWeight: "900", flex: 1, color: COLORS.text }}>{item.author_name}</Text>

              {canDelete(item.user_id) ? (
                <Pressable
                  onPress={() => deleteComment(item.id)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ fontWeight: "900", color: COLORS.text }}>Delete</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={{ marginTop: 4, color: COLORS.text }}>{item.content}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4, fontSize: 12 }}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        )}
      />

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: bottomOffset,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: extraBottom,
          backgroundColor: COLORS.bg,
          borderTopWidth: 1,
          borderColor: COLORS.border,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a comment..."
          placeholderTextColor={COLORS.muted}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
          }}
        />
        <Pressable
          onPress={addComment}
          disabled={sending}
          style={{
            backgroundColor: sending ? "#777" : COLORS.button,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{sending ? "..." : "Send"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
