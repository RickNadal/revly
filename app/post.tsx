// app/post.tsx
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Dimensions,
    FlatList,
    Keyboard,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    Text,
    TextInput,
    View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaThumbnail } from "../components/media/MediaThumbnail";
import MentionText from "../components/MentionText";
import { sendPushEvent } from "../lib/push";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/time";

type ProfileRole = "user" | "moderator" | "admin";

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  author_name: string;
};

type ReactionKind = "like" | "love" | "fire" | "laugh" | "wow";

type ReactionCountMap = Record<ReactionKind, number>;

const REACTION_OPTIONS: Array<{ key: ReactionKind; emoji: string }> = [
  { key: "like", emoji: "👍" },
  { key: "love", emoji: "🔥" },
  { key: "fire", emoji: "🔥" },
  { key: "laugh", emoji: "😂" },
  { key: "wow", emoji: "😮" },
];

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

function formatSupabaseError(err: any) {
  const parts: string[] = [];

  if (err?.message) parts.push(`message: ${String(err.message)}`);
  if (err?.details) parts.push(`details: ${String(err.details)}`);
  if (err?.hint) parts.push(`hint: ${String(err.hint)}`);
  if (err?.code) parts.push(`code: ${String(err.code)}`);
  if (err?.status) parts.push(`status: ${String(err.status)}`);

  if (parts.length === 0) {
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return "Unknown error";
    }
  }

  return parts.join("\n");
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
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
  const { t } = useTranslation();
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
  const [commentReactionsEnabled, setCommentReactionsEnabled] = useState(true);
  const [commentReactionCounts, setCommentReactionCounts] = useState<Record<string, ReactionCountMap>>({});
  const [myCommentReactions, setMyCommentReactions] = useState<Record<string, ReactionKind[]>>({});
  const [reactionPickerCommentId, setReactionPickerCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; author_name: string } | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

  const [actionsOpen, setActionsOpen] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

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
        setMyRole("user");
        return;
      }
      setMyRole(((data as any)?.role ?? "user") as ProfileRole);
    } catch {
      setMyRole("user");
    }
  };

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!postId) return;
    if (!silent) setLoading(true);

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
      if (!silent) setLoading(false);
      Alert.alert("Post load failed", formatSupabaseError(pErr));
      return;
    }

    const mediaSorted = (p.post_media ?? []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    let author: { full_name: string | null } | null = null;

    if (isUuid(p.user_id)) {
      const { data: authorData, error: authorErr } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", p.user_id)
        .maybeSingle();

      if (authorErr) {
        console.log("AUTHOR LOAD FAILED:", formatSupabaseError(authorErr));
      } else {
        author = authorData as { full_name: string | null } | null;
      }
    }

    const postObj: PostRow = {
      ...p,
      author_name: author?.full_name ?? "Rider",
      post_media: mediaSorted,
    };

    const { data: c, error: cErr } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (cErr) {
      setPost(postObj);
      setComments([]);
      if (!silent) setLoading(false);
      Alert.alert("Comments load failed", formatSupabaseError(cErr));
      return;
    }

    const userIds = Array.from(new Set((c ?? []).map((x: any) => String(x.user_id ?? "").trim()).filter(isUuid)));
    const nameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profs, error: p2Err } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (p2Err) {
        setPost(postObj);
        setComments((c ?? []).map((row: any) => ({ ...row, author_name: "Rider" })));
        if (!silent) setLoading(false);
        Alert.alert("Profiles load failed", formatSupabaseError(p2Err));
        return;
      }

      for (const pr of profs ?? []) {
        nameById.set(pr.id, pr.full_name ?? "Rider");
      }
    }

    const commentList: CommentRow[] = (c ?? []).map((row: any) => ({
      ...row,
      parent_id: row.parent_id ?? null,
      author_name: nameById.get(row.user_id) ?? "Rider",
    }));

    const commentIds = commentList.map((row) => row.id);
    const nextCounts: Record<string, ReactionCountMap> = {};
    const nextMine: Record<string, ReactionKind[]> = {};

    if (commentReactionsEnabled && commentIds.length > 0) {
      const { data: reactionRows, error: reactionsErr } = await supabase
        .from("comment_reactions")
        .select("comment_id, user_id, reaction")
        .in("comment_id", commentIds);

      if (reactionsErr) {
        const msg = String(reactionsErr.message ?? "").toLowerCase();
        if (msg.includes("comment_reactions") && msg.includes("does not exist")) {
          setCommentReactionsEnabled(false);
        }
      } else {
        for (const rr of (reactionRows ?? []) as any[]) {
          const cid = String(rr.comment_id ?? "");
          const uid = String(rr.user_id ?? "");
          const reaction = String(rr.reaction ?? "") as ReactionKind;
          if (!cid || !REACTION_OPTIONS.some((x) => x.key === reaction)) continue;

          if (!nextCounts[cid]) {
            nextCounts[cid] = { like: 0, love: 0, fire: 0, laugh: 0, wow: 0 };
          }
          nextCounts[cid][reaction] += 1;

          if (uid === me) {
            if (!nextMine[cid]) nextMine[cid] = [];
            if (!nextMine[cid].includes(reaction)) nextMine[cid].push(reaction);
          }
        }
      }
    }

    setPost(postObj);
    setComments(commentList);
    setCommentReactionCounts(nextCounts);
    setMyCommentReactions(nextMine);
    if (!silent) setLoading(false);
  };

  const toggleCommentReaction = async (commentId: string, reaction: ReactionKind) => {
    const uid = meId;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      setMeId(data.session.user.id);
    }

    const actualUid = uid ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (!actualUid) return;

    const wasActive = (myCommentReactions[commentId] ?? []).includes(reaction);

    setMyCommentReactions((prev) => {
      const current = prev[commentId] ?? [];
      const next = wasActive ? current.filter((x) => x !== reaction) : [...current, reaction];
      return { ...prev, [commentId]: next };
    });

    setCommentReactionCounts((prev) => {
      const base = prev[commentId] ?? { like: 0, love: 0, fire: 0, laugh: 0, wow: 0 };
      const delta = wasActive ? -1 : 1;
      return {
        ...prev,
        [commentId]: {
          ...base,
          [reaction]: Math.max(0, (base[reaction] ?? 0) + delta),
        },
      };
    });

    try {
      if (wasActive) {
        const { error } = await supabase
          .from("comment_reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", actualUid)
          .eq("reaction", reaction);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comment_reactions")
          .insert({ comment_id: commentId, user_id: actualUid, reaction } as any);
        if (error) throw error;
      }
    } catch {
      // Revert optimistic update on failure.
      setMyCommentReactions((prev) => {
        const current = prev[commentId] ?? [];
        const next = wasActive ? [...current, reaction] : current.filter((x) => x !== reaction);
        return { ...prev, [commentId]: next };
      });

      setCommentReactionCounts((prev) => {
        const base = prev[commentId] ?? { like: 0, love: 0, fire: 0, laugh: 0, wow: 0 };
        const delta = wasActive ? 1 : -1;
        return {
          ...prev,
          [commentId]: {
            ...base,
            [reaction]: Math.max(0, (base[reaction] ?? 0) + delta),
          },
        };
      });
    }
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
    if (sending) return;

    setSending(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();

      if (sessionErr) {
        Alert.alert("Session failed", formatSupabaseError(sessionErr));
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/sign-in");
        return;
      }

      const me = session.user.id;

      const { data: inserted, error: insertErr } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          user_id: me,
          content,
          parent_id: replyingTo?.id ?? null,
        })
        .select("id, content, created_at, user_id, parent_id")
        .single();

      if (insertErr) {
        Alert.alert("Comment failed", formatSupabaseError(insertErr));
        return;
      }

      const { data: myProfile, error: myProfileErr } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", me)
        .single();

      if (myProfileErr) {
        Alert.alert("Profile load failed", formatSupabaseError(myProfileErr));
        return;
      }

      const newComment: CommentRow = {
        id: inserted.id,
        content: inserted.content,
        created_at: inserted.created_at,
        user_id: inserted.user_id,
        parent_id: inserted.parent_id ?? null,
        author_name: myProfile?.full_name ?? "Rider",
      };

      const postOwnerId = String(post?.user_id ?? "");
      if (postOwnerId && postOwnerId !== me) {
        await sendPushEvent({
          recipientUserId: postOwnerId,
          type: "comment",
          postId,
        });
      }

      setComments((prev) => [...prev, newComment]);
      setText("");
      setReplyingTo(null);
      Keyboard.dismiss();

      const { data: verifyRows, error: verifyErr } = await supabase
        .from("comments")
        .select("id")
        .eq("id", inserted.id)
        .limit(1);

      if (verifyErr || !verifyRows || verifyRows.length === 0) {
        Alert.alert(
          "Comment verification failed",
          verifyErr ? formatSupabaseError(verifyErr) : "Comment insert returned success but verification could not find the row."
        );
        await load({ silent: true });
        return;
      }

      await load({ silent: true });
    } finally {
      setSending(false);
    }
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
            Alert.alert("Delete failed", formatSupabaseError(error));
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
              Alert.alert("Delete failed", formatSupabaseError(error));
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
              Alert.alert("Remove failed", formatSupabaseError(error));
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

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      Alert.alert("Session failed", formatSupabaseError(sessionErr));
      return;
    }

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

        Alert.alert("Report failed", formatSupabaseError(error));
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
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.muted }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const urls = (post.post_media ?? []).map((m) => m.url).filter(Boolean);

  const inputBarHeight = 64 + (replyingTo ? 36 : 0);
  const extraBottom = insets.bottom + 12;
  const bottomOffset = keyboardHeight > 0 ? keyboardHeight : 0;

  const currentIndex = carouselIndexByPost[post.id] ?? 0;
  const canDeletePostMedia = !!meId && meId === post.user_id;

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const replyMap = new Map<string, CommentRow[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const existing = replyMap.get(c.parent_id) ?? [];
      existing.push(c);
      replyMap.set(c.parent_id, existing);
    }
  }
  const threadedComments: Array<CommentRow & { isReply: boolean }> = [];
  for (const c of topLevelComments) {
    threadedComments.push({ ...c, isReply: false });
    for (const r of replyMap.get(c.id) ?? []) {
      threadedComments.push({ ...r, isReply: true });
    }
  }

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
          borderColor: active ? "#7CFFB2" : COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900", fontSize: 12 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ padding: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: COLORS.text }}>{post.author_name}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 2 }}>
              {post.visibility === "private" ? "Private" : "Public"} · {timeAgo(post.created_at)}
            </Text>
          </View>

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

        {post.caption ? <MentionText text={post.caption} textStyle={{ marginTop: 10, fontSize: 16, color: COLORS.text }} /> : null}

        <Text style={{ marginTop: 14, fontWeight: "900", color: COLORS.text }}>Comments ({comments.length})</Text>
      </View>

      <FlatList
        data={threadedComments}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={false}
        extraData={{ commentReactionCounts, myCommentReactions, replyingTo }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: inputBarHeight + extraBottom + 16 + bottomOffset,
        }}
        renderItem={({ item }) => {
          const reactionCounts = commentReactionCounts[item.id] ?? { like: 0, love: 0, fire: 0, laugh: 0, wow: 0 };
          const myReactions = myCommentReactions[item.id] ?? [];
          const visibleReactions = REACTION_OPTIONS.filter(
            (opt) => reactionCounts[opt.key] > 0 || myReactions.includes(opt.key)
          );
          return (
            <View
              style={{
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: COLORS.border,
                paddingLeft: item.isReply ? 20 : 0,
              }}
            >
              {item.isReply ? (
                <View
                  style={{
                    position: "absolute",
                    left: 6,
                    top: 10,
                    bottom: 10,
                    width: 2,
                    backgroundColor: COLORS.border,
                    borderRadius: 1,
                  }}
                />
              ) : null}

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

              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6 }}>
                <Text style={{ color: COLORS.muted, fontSize: 12 }}>{timeAgo(item.created_at)}</Text>
                {!item.isReply ? (
                  <Pressable
                    onPress={() => setReplyingTo({ id: item.id, author_name: item.author_name })}
                    hitSlop={8}
                  >
                    <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "900" }}>Reply</Text>
                  </Pressable>
                ) : null}
              </View>

              {commentReactionsEnabled ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
                  {visibleReactions.map((opt) => {
                    const mine = myReactions.includes(opt.key);
                    const count = reactionCounts[opt.key] ?? 0;
                    return (
                      <Pressable
                        key={`${item.id}:${opt.key}`}
                        onPress={() => toggleCommentReaction(item.id, opt.key)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: mine ? "rgba(255,255,255,0.35)" : COLORS.border,
                          backgroundColor: mine ? "rgba(255,255,255,0.12)" : COLORS.chip,
                        }}
                      >
                        <Text style={{ fontSize: 13 }}>{opt.emoji}</Text>
                        {count > 0 ? (
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{count}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setReactionPickerCommentId(item.id)}
                    onLongPress={() => setReactionPickerCommentId(item.id)}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.chip,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>😊</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          backgroundColor: COLORS.bg,
          borderTopWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        {replyingTo ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 4,
              gap: 8,
            }}
          >
            <Text style={{ color: COLORS.muted, fontSize: 13, flex: 1 }}>
              Replying to{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>{replyingTo.author_name}</Text>
            </Text>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={10}>
              <Text style={{ color: COLORS.muted, fontSize: 20, lineHeight: 22 }}>×</Text>
            </Pressable>
          </View>
        ) : null}
        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: insets.bottom + 12,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("feed.comment_placeholder", { defaultValue: "Write a comment..." })}
            placeholderTextColor={COLORS.muted}
            autoCapitalize="sentences"
            autoCorrect
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={addComment}
            blurOnSubmit={false}
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
      </View>

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
                label="Edit post"
                onPress={() => {
                  closeActions();
                  router.push({ pathname: "/edit-post", params: { id: post.id } });
                }}
              />
            ) : null}

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

      <Modal
        transparent
        visible={reactionPickerCommentId !== null}
        animationType="fade"
        onRequestClose={() => setReactionPickerCommentId(null)}
      >
        <Pressable
          onPress={() => setReactionPickerCommentId(null)}
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
            {REACTION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  const cid = reactionPickerCommentId;
                  setReactionPickerCommentId(null);
                  if (cid) toggleCommentReaction(cid, opt.key);
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