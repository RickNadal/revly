// app/(tabs)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaThumbnail } from "../../components/media/MediaThumbnail";
import MentionText from "../../components/MentionText";
import { sendPushEvent } from "../../lib/push";
import { supabase } from "../../lib/supabase";


type ProfileRole = "user" | "moderator" | "admin";
type PremiumStyle = "classic" | "aurora" | "sunset" | "electric";

type Post = {
  id: string;
  caption: string | null;
  created_at: string;
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
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
  danger: "#FF5A5F",
  badgeBg: "rgba(255,255,255,0.10)",
  badgeBorder: "#232334",
  badgeGold: "#F5C451",
  badgeGreen: "#7CFFB2",
};

// Keep your old "admin uid" debug check
const ADMIN_USER_ID = "165b27e6-a9df-4cc2-a529-9c667cb5f018";

function Badge({ label, tone }: { label: string; tone?: "default" | "gold" | "green" }) {
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

function openViewer(
  urls: string[],
  index: number,
  opts?: {
    postId?: string;
    ownerId?: string;
    likeCount?: number;
    commentCount?: number;
    likedByMe?: boolean;
    canDelete?: boolean;
  }
) {
  if (!urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      urls: JSON.stringify(urls),
      index: String(index),
      ...(opts?.postId ? { postId: opts.postId } : {}),
      ...(opts?.ownerId ? { ownerId: opts.ownerId } : {}),
      likeCount: String(opts?.likeCount ?? 0),
      commentCount: String(opts?.commentCount ?? 0),
      likedByMe: opts?.likedByMe ? "1" : "0",
      canDelete: opts?.canDelete ? "1" : "0",
    },
  });
}

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function Profile() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState<"avatar" | "banner" | null>(null);
  const [editing, setEditing] = useState(false);

  const [role, setRole] = useState<ProfileRole>("user");
  const [isPremium, setIsPremium] = useState(false);
  const [premiumStyle, setPremiumStyle] = useState<PremiumStyle>("classic");
  const [isLegacy, setIsLegacy] = useState(false);
  const [isSupporter, setIsSupporter] = useState(false);
  const [botmWinsCount, setBotmWinsCount] = useState(0);
  const [isBotmChampion, setIsBotmChampion] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postViewMode, setPostViewMode] = useState<"list" | "grid">("list");
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [myFeedReactions, setMyFeedReactions] = useState<Record<string, FeedReactionKind>>({});
  const [reactionCountsByPost, setReactionCountsByPost] = useState<Record<string, FeedReactionCountMap>>({});

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [giftsReceivedCount, setGiftsReceivedCount] = useState(0);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const isAdminByRole = role === "admin";
  const isAdminByUid = !!myUserId && myUserId === ADMIN_USER_ID;
  const isAdmin = useMemo(() => isAdminByRole || isAdminByUid, [isAdminByRole, isAdminByUid]);

  const load = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return;
    }

    const uid = sessionData.session.user.id;
    setMyUserId(uid);

    let profile: any = null;
    let profErr: any = null;

    const fullProfile = await supabase
      .from("profiles")
      .select("full_name, bio, avatar_url, banner_url, role, is_premium, premium_style, is_legacy, is_supporter, botm_wins_count, botm_champion_until")
      .eq("id", uid)
      .maybeSingle();

    const fullProfileErr = String(fullProfile.error?.message ?? "").toLowerCase();
    if (fullProfile.error && (fullProfileErr.includes("avatar_url") || fullProfileErr.includes("is_supporter"))) {
      const fallback = await supabase
        .from("profiles")
        .select("full_name, bio, role, is_premium, premium_style, is_legacy, is_supporter, botm_wins_count, botm_champion_until")
        .eq("id", uid)
        .maybeSingle();
      profile = fallback.data;
      profErr = fallback.error;
    } else {
      profile = fullProfile.data;
      profErr = fullProfile.error;
    }

    if (profErr) {
      console.log("PROFILE LOAD ERROR:", profErr);
    } else {
      const profileName = String(profile?.full_name ?? "").trim();
      const metaName = String(sessionData.session.user.user_metadata?.full_name ?? "").trim();
      const bestName = profileName || metaName;

      setFullName(bestName);
      setBio(String(profile?.bio ?? ""));
      setAvatarUrl(String(profile?.avatar_url ?? ""));
      setBannerUrl(String(profile?.banner_url ?? ""));
      setEditing(bestName.length === 0);

      const r = ((profile as any)?.role ?? "user") as ProfileRole;
      setRole(r);

      setIsPremium(!!(profile as any)?.is_premium);
      const style = String((profile as any)?.premium_style ?? "classic") as PremiumStyle;
      setPremiumStyle(style === "aurora" || style === "sunset" || style === "electric" ? style : "classic");
      setIsLegacy(!!(profile as any)?.is_legacy);
      setIsSupporter(!!(profile as any)?.is_supporter);
      setBotmWinsCount(Number((profile as any)?.botm_wins_count ?? 0));
      const championUntil = String((profile as any)?.botm_champion_until ?? "").trim();
      setIsBotmChampion(!!championUntil && new Date(championUntil).getTime() > Date.now());
    }

    const { count: followers } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", uid);

    const { count: following } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", uid);

    const { count: giftsReceived } = await supabase
      .from("user_gifts" as any)
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", uid);

    setFollowersCount(followers ?? 0);
    setFollowingCount(following ?? 0);
    setGiftsReceivedCount(giftsReceived ?? 0);

    const { data: userPosts } = await supabase
      .from("posts")
      .select("id, caption, created_at, user_id, post_media(url, sort_order)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    const normalized = (userPosts ?? []).map((p: any) => ({
      ...p,
      post_media: (p.post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

    const postIds = normalized.map((post: any) => String(post.id)).filter(Boolean);

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
      if (String(like.user_id ?? "") === uid) likedByMeSet.add(postId);
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
      if (userId === uid) nextMyReactions[postId] = reaction;
    }

    const postsWithCounts: Post[] = normalized.map((post: any) => ({
      ...post,
      like_count: likeCountByPost.get(post.id) ?? 0,
      comment_count: commentCountByPost.get(post.id) ?? 0,
      liked_by_me: likedByMeSet.has(post.id),
    }));

    setPosts(postsWithCounts);
    setMyFeedReactions(nextMyReactions);
    setReactionCountsByPost(nextReactionCounts);

    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const saveProfile = async () => {
    const name = fullName.trim();
    const nextBio = bio.trim();
    if (!name) {
      return Alert.alert(
        t("profile.missing_name_title", { defaultValue: "Missing name" }),
        t("profile.missing_name_body", { defaultValue: "Enter a name." })
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return router.replace("/sign-in");

    const { error } = await supabase.from("profiles").upsert(
      {
        id: uid,
        full_name: name,
        bio: nextBio || null,
      } as any,
      { onConflict: "id" }
    );
    if (error) return Alert.alert(t("profile.save_failed_title", { defaultValue: "Save failed" }), error.message);

    setFullName(name);
    setBio(nextBio);
    setEditing(false);
  };

  const pickAndUploadProfileMedia = async (kind: "avatar" | "banner") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return router.replace("/sign-in");

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to update your profile media.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      aspect: kind === "avatar" ? [1, 1] : [3, 1],
      base64: true,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    try {
      setUploadingMedia(kind);
      const uri = picked.assets[0].uri;
      const clean = String(uri).split("?")[0].split("#")[0];
      const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      const path = `${uid}/profile/${kind}-${Date.now()}.${ext}`;
      const base64 = picked.assets[0].base64 ?? (await FileSystem.readAsStringAsync(uri, { encoding: "base64" }));
      if (!base64) {
        Alert.alert("Upload failed", "Could not read selected image.");
        return;
      }

      const uploadBody = base64ToBytes(base64);

      const { error: uploadErr } = await supabase.storage.from("post-images").upload(path, uploadBody, {
        contentType: mime,
        upsert: true,
      });

      if (uploadErr) {
        Alert.alert("Upload failed", uploadErr.message);
        return;
      }

      const publicUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
      const payload = kind === "avatar" ? { avatar_url: publicUrl } : { banner_url: publicUrl };

      // Prefer update to avoid NOT NULL issues on partial upserts.
      let saveErr: any = null;
      const updateRes = await supabase.from("profiles").update(payload as any).eq("id", uid);
      saveErr = updateRes.error;

      if (saveErr) {
        const fallbackName = fullName.trim() || "Rider";
        const upsertRes = await supabase.from("profiles").upsert(
          {
            id: uid,
            full_name: fallbackName,
            ...payload,
          } as any,
          { onConflict: "id" }
        );
        saveErr = upsertRes.error;
      }

      if (saveErr) {
        const msg = String(saveErr.message ?? "");
        const missingMediaColumn = msg.includes("banner_url") || msg.includes("avatar_url");

        if (missingMediaColumn) {
          if (kind === "avatar") setAvatarUrl(publicUrl);
          else setBannerUrl(publicUrl);

          Alert.alert(
            "Database update required",
            "This profile media uploaded, but your database is missing avatar/banner columns. Run: alter table public.profiles add column if not exists avatar_url text, add column if not exists banner_url text;"
          );
          return;
        }

        Alert.alert("Save failed", saveErr.message);
        return;
      }

      if (kind === "avatar") setAvatarUrl(publicUrl);
      else setBannerUrl(publicUrl);
    } finally {
      setUploadingMedia(null);
    }
  };

  const deletePost = async (postId: string) => {
    Alert.alert(
      t("profile.delete_post_title", { defaultValue: "Delete post?" }),
      t("profile.delete_post_body", { defaultValue: "This cannot be undone." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("common.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("posts").delete().eq("id", postId);
            if (error) return Alert.alert(t("profile.delete_failed_title", { defaultValue: "Delete failed" }), error.message);
            load();
          },
        },
      ]
    );
  };

  const toggleLike = async (postId: string, currentlyLiked: boolean, postOwnerId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return router.replace("/sign-in");
    const uid = session.user.id;

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

      const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", uid);
      if (error) Alert.alert(t("feed.unlike_failed_title", { defaultValue: "Unlike failed" }), error.message);
      await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", uid);
      return;
    }

    const { error } = await supabase.from("likes").upsert({ post_id: postId, user_id: uid }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    if (error) {
      Alert.alert(t("feed.like_failed_title", { defaultValue: "Like failed" }), error.message);
      return;
    }

    if (postOwnerId && postOwnerId !== uid) {
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
    const uid = sessionData.session?.user?.id;
    if (!uid) return;

    const { error: reactionErr } = await supabase.from("post_reactions").upsert(
      {
        post_id: postId,
        user_id: uid,
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

  const roleLabel = useMemo(() => {
    if (role === "admin") return t("profile.badge_admin", { defaultValue: "ADMIN" });
    if (role === "moderator") return t("profile.badge_mod", { defaultValue: "MOD" });
    return "";
  }, [role, t]);

  const listData = useMemo(() => {
    if (postViewMode === "grid") {
      return posts.filter((item) => (item.post_media ?? []).some((m) => !!m.url));
    }
    return posts;
  }, [postViewMode, posts]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
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
      <FlatList
        key={postViewMode}
        style={{ flex: 1 }}
        data={listData}
        keyExtractor={(item) => item.id}
        numColumns={postViewMode === "grid" ? 3 : 1}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews={Platform.OS === "android"}
        initialNumToRender={postViewMode === "grid" ? 10 : 4}
        maxToRenderPerBatch={postViewMode === "grid" ? 10 : 4}
        windowSize={10}
        updateCellsBatchingPeriod={60}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom + 36, 60) }}
        ListHeaderComponent={
          <>
        <Pressable
          onPress={() => pickAndUploadProfileMedia("banner")}
          style={{
            marginBottom: 10,
            height: 130,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {bannerUrl ? <Image source={{ uri: bannerUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
          <View
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.55)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
              {uploadingMedia === "banner" ? "Uploading..." : "Edit banner"}
            </Text>
          </View>
        </Pressable>

        {/* Avatar + Name + Bio row */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
          <Pressable onPress={() => pickAndUploadProfileMedia("avatar")}>
            <View style={{ width: 86, height: 86, borderRadius: 43, overflow: "hidden", backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
            </View>
            {uploadingMedia === "avatar" ? (
              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)", paddingVertical: 3, alignItems: "center", borderBottomLeftRadius: 43, borderBottomRightRadius: 43 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>Uploading…</Text>
              </View>
            ) : null}
          </Pressable>

          <View style={{ flex: 1, paddingTop: 2 }}>
            {bio.trim() ? (
              <Pressable onPress={() => setEditing(true)}>
                <View style={{ padding: 10, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.muted, fontWeight: "900", marginBottom: 4, fontSize: 11 }}>
                    {t("profile.bio_title", { defaultValue: "Bike & Gear" })}
                  </Text>
                  <Text style={{ color: COLORS.text, lineHeight: 18, fontSize: 13 }}>{bio}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable onPress={() => setEditing(true)}>
                <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>
                  {t("profile.edit_name", { defaultValue: "Edit name" })}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Debug info (DEV only) */}
        {__DEV__ ? (
          <View
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
              {t("profile.dev_admin_uid_check", { defaultValue: "Admin UID check:" })}
            </Text>

            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
              {t("profile.dev_you", { defaultValue: "You:" })} {myUserId ?? t("profile.dev_loading", { defaultValue: "(loading...)" })}
            </Text>

            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
              {t("profile.dev_admin", { defaultValue: "Admin:" })} {ADMIN_USER_ID}
            </Text>

            <Text style={{ color: isAdminByUid ? "#7CFF9A" : COLORS.muted, fontWeight: "900", marginTop: 4 }}>
              {isAdminByUid
                ? t("profile.dev_admin_by_uid_yes", { defaultValue: "✅ Admin by UID" })
                : t("profile.dev_admin_by_uid_no", { defaultValue: "❌ Not admin by UID" })}
            </Text>

            <Text style={{ color: isAdminByRole ? "#7CFF9A" : COLORS.muted, fontWeight: "900", marginTop: 4 }}>
              {isAdminByRole
                ? t("profile.dev_admin_by_role_yes", { role, defaultValue: `✅ Admin by role (${role})` })
                : t("profile.dev_role", { role, defaultValue: `Role: ${role}` })}
            </Text>
          </View>
        ) : null}

        {editing ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder={t("profile.full_name_placeholder", { defaultValue: "Full name" })}
              placeholderTextColor={COLORS.muted}
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                padding: 12,
                borderRadius: 12,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
              }}
            />

            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder={t("profile.bio_placeholder", { defaultValue: "Your bike + gear setup (optional)" })}
              placeholderTextColor={COLORS.muted}
              multiline
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                padding: 12,
                borderRadius: 12,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
                minHeight: 92,
                textAlignVertical: "top",
              }}
            />

            <Pressable
              onPress={saveProfile}
              style={{
                backgroundColor: COLORS.button,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                {t("common.save", { defaultValue: "Save" })}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setEditing(false)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: role === "moderator" ? COLORS.badgeGreen : COLORS.text }}>
                {fullName || t("feed.rider_fallback", { defaultValue: "Rider" })}
              </Text>

              {roleLabel ? <Badge label={roleLabel} tone={role === "moderator" ? "green" : "gold"} /> : null}
              {isLegacy ? <Badge label={t("profile.badge_legacy", { defaultValue: "LEGACY" })} tone="gold" /> : null}
              {isPremium ? <Badge label={t("profile.badge_premium", { defaultValue: "PREMIUM" })} tone={premiumTone(premiumStyle)} /> : null}
              {isSupporter ? <Badge label={t("profile.badge_supporter", { defaultValue: "SUPPORTER" })} tone="gold" /> : null}
              {isBotmChampion ? <Badge label={t("profile.badge_botm_champ", { defaultValue: "BOTM CHAMP" })} tone="gold" /> : null}
              {botmWinsCount > 0 ? <Badge label={t("profile.badge_botm_winner", { defaultValue: `BOTM WINNER x${botmWinsCount}` })} tone="gold" /> : null}
            </View>

            <Pressable onPress={() => setEditing(true)} style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.text, textDecorationLine: "underline", fontWeight: "800" }}>
                {t("profile.edit_name", { defaultValue: "Edit name" })}
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/followers", params: { id: myUserId ?? "" } })}
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
                  {t("profile.followers", { count: followersCount, defaultValue: `Followers: ${followersCount}` })}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/following", params: { id: myUserId ?? "" } })}
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
                  {t("profile.following", { count: followingCount, defaultValue: `Following: ${followingCount}` })}
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
                  {t("profile.gifts_received", { count: giftsReceivedCount, defaultValue: `Gifts: ${giftsReceivedCount}` })}
                </Text>
              </View>
            </View>

            {isAdmin ? (
              <Pressable
                onPress={() => router.push("/admin-feedback")}
                style={{
                  marginTop: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                  backgroundColor: COLORS.chip,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {t("profile.admin_view_feedback", { defaultValue: "Admin: View feedback" })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontWeight: "900", color: COLORS.text }}>
            {t("profile.my_posts", { count: posts.length, defaultValue: `My posts (${posts.length})` })}
          </Text>
        </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <Text style={{ marginTop: 12, color: COLORS.muted }}>
              {t("common.loading", { defaultValue: "Loading…" })}
            </Text>
          ) : (
            <Text style={{ marginTop: 12, color: COLORS.muted }}>
              {t("profile.empty_posts", { defaultValue: "You haven’t posted yet. Tap “Post” on the home screen 🚀" })}
            </Text>
          )
        }
        columnWrapperStyle={postViewMode === "grid" ? { justifyContent: "space-between", marginTop: 4 } : undefined}
        renderItem={({ item }) => {
          const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);
          const firstUrl = urls[0];
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
                }}
              >
                <Pressable
                  onPress={() => openViewer(urls, 0, { postId: item.id, ownerId: item.user_id, likeCount: item.like_count, commentCount: item.comment_count, likedByMe: item.liked_by_me, canDelete: item.user_id === myUserId })}
                  onLongPress={() => deletePost(item.id)}
                  delayLongPress={400}
                  style={({ pressed }) => ({
                    width: "100%",
                    height: "100%",
                    backgroundColor: pressed ? "rgba(0,0,0,0.3)" : "transparent",
                  })}
                >
                  <MediaThumbnail url={firstUrl} width="100%" height="100%" resizeMode="cover" />

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
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 11 }}>
                        +{urls.length - 1}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          }

          return (
            <View
              style={{
                marginTop: 10,
                marginBottom: 4,
                padding: 12,
                borderRadius: 16,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.muted }}>{new Date(item.created_at).toLocaleString()}</Text>

                <Pressable onPress={() => deletePost(item.id)}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900" }}>
                    {t("common.delete", { defaultValue: "Delete" })}
                  </Text>
                </Pressable>
              </View>

              {urls[0] ? (
                <Pressable onPress={() => openViewer(urls, 0, { postId: item.id, ownerId: item.user_id, likeCount: item.like_count, commentCount: item.comment_count, likedByMe: item.liked_by_me, canDelete: item.user_id === myUserId })} onStartShouldSetResponder={() => true} style={{ marginTop: 10 }}>
                  <MediaThumbnail
                    url={urls[0]}
                    width="100%"
                    height={220}
                    borderRadius={14}
                    resizeMode="cover"
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
                    >
                      <Text style={{ color: "white", fontWeight: "900" }}>
                        {t("profile.photos_count", { count: urls.length, defaultValue: `${urls.length} photos` })}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
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

                <Pressable
                  onPress={() => router.push({ pathname: "/post", params: { id: item.id } })}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.open", { defaultValue: "Open" })}</Text>
                </Pressable>
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
        }}
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

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}