// app/new-post.tsx
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaThumbnail } from "../components/media/MediaThumbnail";
import { applyMentionSuggestion, extractMentionHandles, getTrailingMentionQuery, resolveMentionHandlesToUserIds } from "../lib/mentions";
import { sendPushEvent } from "../lib/push";
import { supabase } from "../lib/supabase";
import { applyTagSuggestion, getTrailingTagQuery, pickSuggestedTags } from "../lib/tags";
import { uploadMediaToSupabase } from "../lib/uploadMedia";

type Picked = {
  uri: string;
  type?: "image" | "video";
};

type MentionProfile = {
  id: string;
  full_name: string | null;
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

export default function NewPost() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [popularTags, setPopularTags] = useState<string[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionProfile[]>([]);

  const titleText = useMemo(() => t("new_post.title_default", { defaultValue: "New Post" }), [t]);

  const subtitleText = useMemo(
    () => t("new_post.subtitle_ride", { defaultValue: "Share a moment from your ride" }),
    [t]
  );

  const primaryButtonText = useMemo(() => {
    const posting = t("new_post.posting", { defaultValue: "Bezig…" });
    return loading ? posting : t("new_post.primary_ride", { defaultValue: "Plaatsen" });
  }, [loading, t]);

  const trailingTagQuery = useMemo(() => getTrailingTagQuery(caption), [caption]);
  const trailingMentionQuery = useMemo(() => getTrailingMentionQuery(caption), [caption]);
  const suggestedTags = useMemo(() => pickSuggestedTags(popularTags, trailingTagQuery, 8), [popularTags, trailingTagQuery]);
  const showTagSuggestions = useMemo(() => /(?:^|\s)#[a-z0-9_]*$/i.test(caption), [caption]);
  const showMentionSuggestions = useMemo(() => /(?:^|\s)@[a-z0-9_]*$/i.test(caption), [caption]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("post_tags")
        .select("tag")
        .order("created_at", { ascending: false })
        .limit(120);

      if (!alive) return;
      if (error) {
        const msg = String(error.message ?? "").toLowerCase();
        if (!msg.includes("post_tags") || !msg.includes("does not exist")) {
          console.log("LOAD TAGS ERROR:", error);
        }
        setPopularTags(["bmw", "yamaha", "honda", "wheelie", "nightride", "touring"]);
        return;
      }

      const tags = Array.from(new Set(((data ?? []) as any[]).map((row) => String(row.tag ?? "").toLowerCase()).filter(Boolean)));
      setPopularTags(tags);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!showMentionSuggestions || !trailingMentionQuery) {
      setMentionSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${trailingMentionQuery}%`)
        .order("full_name", { ascending: true })
        .limit(8);

      if (!active) return;
      if (error) {
        setMentionSuggestions([]);
        return;
      }

      setMentionSuggestions((data ?? []) as MentionProfile[]);
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [showMentionSuggestions, trailingMentionQuery]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert(
        t("new_post.permission_needed_title", { defaultValue: "Permission needed" }),
        t("new_post.permission_needed_body", { defaultValue: "Allow photo access." })
      );
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      selectionLimit: 6,
    });

    if (res.canceled) return;

    setPhotos(
      res.assets.map((a) => ({
        uri: a.uri,
        type: a.type === "video" ? "video" : "image",
      }))
    );
  };

  const uploadMedia = async (userId: string, media: Picked, onProgress?: (p: number) => void) => {
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ext = media.uri.split("?")[0].split("#")[0];
    const dotExt = ext.includes(".") ? ext.slice(ext.lastIndexOf(".") + 1).toLowerCase() : (media.type === "video" ? "mp4" : "jpg");
    const storagePath = `${filePath}.${dotExt}`;
    return uploadMediaToSupabase(media.uri, "post-images", storagePath, media.type, onProgress);
  };

  const createPost = async () => {
    if (photos.length === 0) {
      return Alert.alert(
        t("new_post.add_photos_title", { defaultValue: "Add photos" }),
        t("new_post.add_photos_body", { defaultValue: "Pick at least 1 photo." })
      );
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const userId = session.user.id;
    let postId: string | null = null;

    const baseInsert: any = {
      user_id: userId,
      caption: caption.trim() || null,
      visibility,
    };

    const { data: post1, error: postErr1 } = await supabase
      .from("posts")
      .insert({ ...baseInsert, post_type: "ride" })
      .select("id")
      .single();

    if (postErr1) {
      const { data: post2, error: postErr2 } = await supabase.from("posts").insert(baseInsert).select("id").single();

      if (postErr2 || !post2) {
        setLoading(false);
        return Alert.alert(
          t("new_post.post_failed_title", { defaultValue: "Post failed" }),
          postErr2?.message ?? postErr1?.message ?? t("new_post.unknown_error", { defaultValue: "Unknown error" })
        );
      }

      postId = post2.id;
    } else {
      postId = post1?.id ?? null;
    }

    if (!postId) {
      setLoading(false);
      return Alert.alert(
        t("new_post.post_failed_title", { defaultValue: "Post failed" }),
        t("new_post.missing_post_id", { defaultValue: "Could not create post id" })
      );
    }

    try {
      for (let i = 0; i < photos.length; i++) {
        const isVideo = photos[i].type === "video";
        setUploadProgress(isVideo ? 0 : null);
        const url = await uploadMedia(
          userId,
          photos[i],
          isVideo ? (p) => setUploadProgress(p) : undefined
        );
        setUploadProgress(null);

        const { error: mediaErr } = await supabase.from("post_media").insert({
          post_id: postId,
          url,
          sort_order: i,
        });

        if (mediaErr) throw mediaErr;
      }

      setLoading(false);
      setUploadProgress(null);
      router.replace("/");

      // Fire and forget so UI can return to feed immediately.
      void (async () => {
        try {
          const mentionHandles = extractMentionHandles(caption);
          if (mentionHandles.length === 0) return;

          const mentionUserByHandle = await resolveMentionHandlesToUserIds(mentionHandles);
          const taggedUserIds = Array.from(new Set(Object.values(mentionUserByHandle))).filter((id) => id && id !== userId);

          for (const taggedUserId of taggedUserIds) {
            await sendPushEvent({
              recipientUserId: taggedUserId,
              type: "mention",
              postId,
            });
          }
        } catch {
          // Keep upload UX fast; background mention push failures are non-blocking.
        }
      })();
    } catch (e: any) {
      setLoading(false);
      setUploadProgress(null);
      Alert.alert(
        t("new_post.upload_failed_title", { defaultValue: "Upload failed" }),
        e?.message ?? t("new_post.unknown_error", { defaultValue: "Unknown error" })
      );
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const captionPlaceholder = t("new_post.caption_placeholder_ride", { defaultValue: "Caption (optional)" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: Math.max(insets.bottom + 36, 52) }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>{titleText}</Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>{subtitleText}</Text>

        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(124,255,178,0.55)",
            backgroundColor: "rgba(124,255,178,0.12)",
            paddingVertical: 8,
            paddingHorizontal: 10,
          }}
        >
          <Text style={{ color: "#D8FFE8", fontWeight: "800", fontSize: 12 }}>
            {t("new_post.clip_upload_notice", { defaultValue: "If you upload a video here, it will appear in Clips." })}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Pressable
            onPress={() => setVisibility("public")}
            disabled={loading}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: visibility === "public" ? COLORS.button : COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: visibility === "public" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("new_post.visibility_public", { defaultValue: "Public" })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setVisibility("private")}
            disabled={loading}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: visibility === "private" ? COLORS.button : COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: visibility === "private" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("new_post.visibility_private", { defaultValue: "Private" })}
            </Text>
          </Pressable>
        </View>

        <TextInput
          placeholder={captionPlaceholder}
          placeholderTextColor={COLORS.muted}
          value={caption}
          onChangeText={setCaption}
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            minHeight: 48,
          }}
          multiline
        />

        {showTagSuggestions && suggestedTags.length > 0 ? (
          <View style={{ marginTop: -2 }}>
            <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>
              {t("new_post.tags_suggested", { defaultValue: "Suggested tags" })}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {suggestedTags.map((tag) => (
                <Pressable
                  key={tag}
                  disabled={loading}
                  onPress={() => setCaption((prev) => applyTagSuggestion(prev, tag))}
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>#{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {showMentionSuggestions && mentionSuggestions.length > 0 ? (
          <View style={{ marginTop: 2 }}>
            <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>
              {t("new_post.mentions_suggested", { defaultValue: "Suggested riders" })}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {mentionSuggestions.map((profile) => {
                const label = String(profile.full_name ?? "").trim();
                if (!label) return null;
                return (
                  <Pressable
                    key={profile.id}
                    disabled={loading}
                    onPress={() => setCaption((prev) => applyMentionSuggestion(prev, label))}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: COLORS.chip,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>@{label.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={pickPhotos}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#777" : COLORS.button,
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("new_post.pick_photos", { defaultValue: "Foto's / Video uploaden (max 6)" })}
          </Text>
        </Pressable>

        {photos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ position: "relative" }}>
                <MediaThumbnail url={p.uri} width={110} height={110} borderRadius={14} resizeMode="cover" />
                <Pressable
                  onPress={() => removePhoto(i)}
                  disabled={loading}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "rgba(0,0,0,0.65)",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.15)",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.muted }}>
              {t("new_post.no_photos_prefix", { defaultValue: "No photos selected yet. Tap" })}{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("new_post.no_photos_pick_photos", { defaultValue: "Foto's / Video uploaden" })}
              </Text>
              .
            </Text>
          </View>
        )}

        <Pressable
          onPress={createPost}
          disabled={loading || photos.length === 0}
          style={{
            backgroundColor: loading || photos.length === 0 ? "#777" : COLORS.button,
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{primaryButtonText}</Text>
        </Pressable>

        {uploadProgress !== null && (
          <View style={{ marginTop: 10, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                {t("new_post.uploading_video", { defaultValue: "Video uploaden…" })}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "900" }}>
                {Math.round(uploadProgress * 100)}%
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: COLORS.card, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: COLORS.button,
                  width: `${Math.round(uploadProgress * 100)}%`,
                }}
              />
            </View>
          </View>
        )}

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={{
            marginTop: 6,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}