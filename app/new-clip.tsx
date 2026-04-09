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

const MAX_CLIP_SECONDS = 20;

function isMissingPostTypeError(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("post_type") && (msg.includes("column") || msg.includes("does not exist"));
}

type PickedClip = {
  uri: string;
  durationMs: number | null;
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

export default function NewClip() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [caption, setCaption] = useState("");
  const [clip, setClip] = useState<PickedClip | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [popularTags, setPopularTags] = useState<string[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionProfile[]>([]);

  const titleText = useMemo(() => t("new_clip.title", { defaultValue: "New Clip" }), [t]);
  const subtitleText = useMemo(
    () => t("new_clip.subtitle", { defaultValue: "Upload a vertical clip up to 20 seconds." }),
    [t]
  );

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
        setPopularTags(["reel", "ride", "clip", "wheelie", "nightride", "touring"]);
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

  const pickClip = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert(
        t("new_clip.permission_needed_title", { defaultValue: "Permission needed" }),
        t("new_clip.permission_needed_body", { defaultValue: "Allow media access." })
      );
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.9,
    });

    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset?.uri) return;

    const durationMs = typeof asset.duration === "number" ? asset.duration : null;
    if (durationMs && durationMs > MAX_CLIP_SECONDS * 1000) {
      Alert.alert(
        t("new_clip.too_long_title", { defaultValue: "Clip too long" }),
        t("new_clip.too_long_body", {
          defaultValue: "Max clip length is {{seconds}} seconds.",
          seconds: MAX_CLIP_SECONDS,
        })
      );
      return;
    }

    setClip({ uri: asset.uri, durationMs });
  };

  const uploadClip = async (userId: string, uri: string, onProgress?: (p: number) => void) => {
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`;
    return uploadMediaToSupabase(uri, "post-images", filePath, "video", onProgress);
  };

  const publishClip = async () => {
    if (!clip) {
      Alert.alert(
        t("new_clip.pick_clip_title", { defaultValue: "Pick a clip" }),
        t("new_clip.pick_clip_body", { defaultValue: "Select a video first." })
      );
      return;
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
      visibility: "public",
    };

    const { data: post1, error: postErr1 } = await supabase
      .from("posts")
      .insert({ ...baseInsert, post_type: "clip" })
      .select("id")
      .single();

    if (postErr1) {
      if (!isMissingPostTypeError(postErr1)) {
        setLoading(false);
        return Alert.alert(
          t("new_clip.publish_failed_title", { defaultValue: "Publish failed" }),
          postErr1?.message ?? t("new_clip.unknown_error", { defaultValue: "Unknown error" })
        );
      }

      const { data: post2, error: postErr2 } = await supabase.from("posts").insert(baseInsert).select("id").single();
      if (postErr2 || !post2) {
        setLoading(false);
        return Alert.alert(
          t("new_clip.publish_failed_title", { defaultValue: "Publish failed" }),
          postErr2?.message ?? postErr1?.message ?? t("new_clip.unknown_error", { defaultValue: "Unknown error" })
        );
      }
      postId = post2.id;
    } else {
      postId = post1?.id ?? null;
    }

    if (!postId) {
      setLoading(false);
      return Alert.alert(
        t("new_clip.publish_failed_title", { defaultValue: "Publish failed" }),
        t("new_clip.missing_post_id", { defaultValue: "Could not create post id" })
      );
    }

    try {
      setUploadProgress(0);
      const url = await uploadClip(userId, clip.uri, (p) => setUploadProgress(p));

      const { error: mediaErr } = await supabase.from("post_media").insert({
        post_id: postId,
        url,
        sort_order: 0,
      });

      if (mediaErr) throw mediaErr;

      setLoading(false);
      setUploadProgress(null);
      router.replace({ pathname: "/", params: { mode: "clips" } });

      // Fire and forget so navigation is not blocked by push dispatch.
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
        t("new_clip.upload_failed_title", { defaultValue: "Upload failed" }),
        e?.message ?? t("new_clip.unknown_error", { defaultValue: "Unknown error" })
      );
    }
  };

  const progressPct = uploadProgress == null ? 0 : Math.round(uploadProgress * 100);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: Math.max(insets.bottom + 36, 52) }}
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>{titleText}</Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>{subtitleText}</Text>

        <TextInput
          placeholder={t("new_clip.caption_placeholder", { defaultValue: "Caption (optional)" })}
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
              {t("new_clip.tags_suggested", { defaultValue: "Suggested tags" })}
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
              {t("new_clip.mentions_suggested", { defaultValue: "Suggested riders" })}
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
          onPress={pickClip}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#777" : COLORS.button,
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("new_clip.pick_clip", { defaultValue: "Pick clip (max 20s)" })}
          </Text>
        </Pressable>

        {clip ? (
          <View
            style={{
              borderRadius: 14,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
            }}
          >
            <MediaThumbnail url={clip.uri} width="100%" height={260} resizeMode="cover" />
            <View style={{ padding: 10 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                {clip.durationMs
                  ? t("new_clip.duration", {
                      defaultValue: "Duration: {{seconds}}s",
                      seconds: Math.round(clip.durationMs / 1000),
                    })
                  : t("new_clip.duration_unknown", { defaultValue: "Duration: unknown" })}
              </Text>
            </View>
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
              {t("new_clip.no_clip_yet", { defaultValue: "No clip selected yet." })}
            </Text>
          </View>
        )}

        <Pressable
          onPress={publishClip}
          disabled={loading || !clip}
          style={{
            backgroundColor: loading || !clip ? "#777" : COLORS.button,
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading
              ? t("new_clip.publishing", { defaultValue: "Publishing…" })
              : t("new_clip.publish", { defaultValue: "Publish clip" })}
          </Text>
        </Pressable>

        {uploadProgress !== null ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                {t("new_clip.uploading", { defaultValue: "Uploading clip…" })}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "900" }}>{progressPct}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: COLORS.card, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: COLORS.button,
                  width: `${progressPct}%`,
                }}
              />
            </View>
          </View>
        ) : null}

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
