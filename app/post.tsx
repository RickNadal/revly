// app/post.tsx
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
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

type ProfileRole = "user" | "moderator" | "admin";

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  author_name: string;
};

type PostMediaRow = {
  url: string;
  sort_order: number;
};

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  visibility: "public" | "private";
  user_id: string;
  author_name: string;
  post_media: PostMediaRow[];
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
  danger: "#FF5A5F",
};

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIDE_PADDING = 16;
const CARD_PADDING = 0;
const CAROUSEL_W = SCREEN_W - PAGE_SIDE_PADDING * 2 - CARD_PADDING * 2;
const CAROUSEL_H = 260;

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

function openViewer(opts: {
  urls: string[];
  index: number;
  postId: string;
  ownerId: string;
  canDelete: boolean;
  media: { url: string; sort_order: number }[];
}) {
  if (!opts.urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      urls: JSON.stringify(opts.urls),
      index: String(opts.index),

      postId: opts.postId,
      ownerId: opts.ownerId,
      canDelete: opts.canDelete ? "1" : "0",
      media: JSON.stringify(opts.media),
    },
  });
}

function PostCarousel({
  postId,
  ownerId,
  canDelete,
  media,
  urls,
  currentIndex,
  onIndexChange,
}: {
  postId: string;
  ownerId: string;
  canDelete: boolean;
  media: { url: string; sort_order: number }[];
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
            <Pressable
              onPress={() =>
                openViewer({
                  urls,
                  index,
                  postId,
                  ownerId,
                  canDelete,
                  media,
                })
              }
              style={{ width: CAROUSEL_W, height: CAROUSEL_H }}
            >
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

function ActionRow({
  label,
  destructive,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "transparent",
        borderWidth: 1,
        borderColor: COLORS.border,
      })}
    >
      <Text
        style={{
          color: destructive ? COLORS.danger : COLORS.text,
          fontWeight: "900",
          fontSize: 16,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
  const [myRole, setMyRole] = useState<ProfileRole>("user");

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

  const [actionsOpen, setActionsOpen] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other"
  >("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

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

  const loadMyRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
      if (error) {
        console.log("POST SCREEN ROLE ERROR:", error);
        setMyRole("user");
        return;
      }
      setMyRole(((data as any)?.role ?? "user") as ProfileRole);
    } catch (e: any) {
      console.log("POST SCREEN ROLE EXCEPTION:", e?.message ?? e);
      setMyRole("user");
    }
  };

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
    loadMyRole(me);

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

  const canDeleteComment = (commentUserId: string) => {
    if (!meId) return false;
    return meId === commentUserId || meId === post?.user_id;
  };

  const canDeleteThisPost = !!meId && !!post && meId === post.user_id;
  const isModOrAdmin = myRole === "moderator" || myRole === "admin";

  const closeActions = () => setActionsOpen(false);
  const openActions = () => setActionsOpen(true);

  const deleteOwnPost = async () => {
    if (!post) return;
    if (!canDeleteThisPost) return;

    Alert.alert("Delete post?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingPost(true);
            closeActions();
            router.back();

            const { error } = await supabase.from("posts").delete().eq("id", post.id);

            if (error) {
              Alert.alert("Delete failed", error.message);
              router.replace({ pathname: "/post", params: { id: post.id } });
              return;
            }
          } finally {
            setDeletingPost(false);
          }
        },
      },
    ]);
  };

  const removePostAsMod = async () => {
    if (!post) return;
    if (!isModOrAdmin) return;

    Alert.alert("Remove post?", "This will delete the post (moderator action).", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingPost(true);
            closeActions();
            router.back();

            const { error } = await supabase.rpc("mod_delete_post", { target_post: post.id });
            if (error) {
              Alert.alert("Remove failed", error.message);
              router.replace({ pathname: "/post", params: { id: post.id } });
              return;
            }
          } finally {
            setDeletingPost(false);
          }
        },
      },
    ]);
  };

  const openReport = () => {
    closeActions();
    setReportReason("spam");
    setReportDetails("");
    setReportOpen(true);
  };

  const closeReport = () => setReportOpen(false);

  const submitReport = async () => {
    if (!post) return;

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
        post_id: post.id,
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

  const currentIndex = carouselIndexByPost[post.id] ?? 0;
  const canDeletePostMedia = !!meId && meId === post.user_id;

  const ReasonChip = ({
    label,
    value,
  }: {
    label: string;
    value: "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other";
  }) => {
    const active = reportReason === value;
    return (
      <Pressable
        onPress={() => setReportReason(value)}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 999,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900", fontSize: 12 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={{ padding: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: COLORS.text }}>{post.author_name}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 2 }}>
              {post.visibility === "private" ? "Private" : "Public"} · {new Date(post.created_at).toLocaleString()}
            </Text>
          </View>

          {/* ⋯ menu button */}
          <Pressable
            onPress={openActions}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "transparent",
              borderWidth: 1,
              borderColor: COLORS.border,
            })}
          >
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>⋯</Text>
          </Pressable>
        </View>

        {/* Carousel */}
        {urls.length > 0 ? (
          <PostCarousel
            postId={post.id}
            ownerId={post.user_id}
            canDelete={canDeletePostMedia}
            media={post.post_media}
            urls={urls}
            currentIndex={currentIndex}
            onIndexChange={setCarouselIndex}
          />
        ) : null}

        {post.caption ? <Text style={{ marginTop: 10, fontSize: 16, color: COLORS.text }}>{post.caption}</Text> : null}

        <Text style={{ marginTop: 14, fontWeight: "900", color: COLORS.text }}>Comments ({comments.length})</Text>
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

              {canDeleteComment(item.user_id) ? (
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

      {/* Comment input */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
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

      {/* Actions modal */}
      <Modal transparent visible={actionsOpen} animationType="fade" onRequestClose={closeActions}>
        <Pressable
          onPress={closeActions}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              padding: 14,
              paddingBottom: insets.bottom + 14,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTopWidth: 1,
              borderColor: COLORS.border,
              gap: 10,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 6 }}>
              <View
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.25)",
                }}
              />
            </View>

            <ActionRow label="Open post" onPress={closeActions} />

            <ActionRow
              label="View profile"
              onPress={() => {
                closeActions();
                router.push({ pathname: "/rider", params: { id: post.user_id } });
              }}
            />

            <ActionRow label="Report" destructive onPress={openReport} />

            {canDeleteThisPost ? (
              <ActionRow
                label={deletingPost ? "Deleting..." : "Delete"}
                destructive
                onPress={() => {
                  if (deletingPost) return;
                  deleteOwnPost();
                }}
              />
            ) : null}

            {!canDeleteThisPost && isModOrAdmin ? (
              <ActionRow
                label={deletingPost ? "Removing..." : "Remove post (mod)"}
                destructive
                onPress={() => {
                  if (deletingPost) return;
                  removePostAsMod();
                }}
              />
            ) : null}

            <ActionRow label="Cancel" onPress={closeActions} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal transparent visible={reportOpen} animationType="fade" onRequestClose={closeReport}>
        <Pressable
          onPress={closeReport}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              padding: 14,
              paddingBottom: insets.bottom + 14,
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTopWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 6 }}>
              <View
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              />
            </View>

            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Report post</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>
              {post?.author_name ?? ""}
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
              style={{
                marginTop: 10,
                minHeight: 84,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                color: COLORS.text,
                borderRadius: 14,
                padding: 12,
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={reporting}
                onPress={submitReport}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: reporting ? "#777" : COLORS.button,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                  {reporting ? "Sending…" : "Submit report"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}