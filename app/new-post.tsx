// app/new-post.tsx
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type Picked = {
  uri: string;
  base64?: string | null;
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

  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);

  const titleText = useMemo(() => t("new_post.title_default", { defaultValue: "New Post" }), [t]);

  const subtitleText = useMemo(
    () => t("new_post.subtitle_ride", { defaultValue: "Share a moment from your ride" }),
    [t]
  );

  const primaryButtonText = useMemo(() => {
    const posting = t("new_post.posting", { defaultValue: "Posting..." });
    return loading ? posting : t("new_post.primary_ride", { defaultValue: "Post Ride" });
  }, [loading, t]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 6,
      base64: true,
    });

    if (res.canceled) return;

    setPhotos(
      res.assets.map((a) => ({
        uri: a.uri,
        base64: a.base64 ?? null,
      }))
    );
  };

  const uploadImage = async (userId: string, photo: Picked) => {
    let base64 = photo.base64;

    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: "base64" });
    }

    if (!base64) {
      throw new Error(
        t("new_post.read_image_failed", {
          defaultValue: "Could not read image data (base64 missing). Try picking the photo again.",
        })
      );
    }

    const bytes = base64ToBytes(base64);
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;

    const { error } = await supabase.storage.from("post-images").upload(filePath, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });

    if (error) throw error;

    return supabase.storage.from("post-images").getPublicUrl(filePath).data.publicUrl;
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

    // Ride-only: always post_type = "ride"
    const { data: post1, error: postErr1 } = await supabase
      .from("posts")
      .insert({ ...baseInsert, post_type: "ride" })
      .select("id")
      .single();

    if (postErr1) {
      // fallback if post_type column doesn't exist
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
        const url = await uploadImage(userId, photos[i]);

        const { error: mediaErr } = await supabase.from("post_media").insert({
          post_id: postId,
          url,
          sort_order: i,
        });

        if (mediaErr) throw mediaErr;
      }

      setLoading(false);
      router.replace("/");
    } catch (e: any) {
      setLoading(false);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>{titleText}</Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>{subtitleText}</Text>

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
            {t("new_post.pick_photos", { defaultValue: "Pick Photos (max 6)" })}
          </Text>
        </Pressable>

        {photos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ position: "relative" }}>
                <Image
                  source={{ uri: p.uri }}
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#0F0F16",
                  }}
                />
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
                {t("new_post.no_photos_pick_photos", { defaultValue: "Pick Photos" })}
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