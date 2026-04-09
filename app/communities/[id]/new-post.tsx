// app/communities/[id]/new-post.tsx
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaThumbnail } from "../../../components/media/MediaThumbnail";
import { supabase } from "../../../lib/supabase";
import { uploadMediaToSupabase } from "../../../lib/uploadMedia";

type Picked = { uri: string; type?: "image" | "video" };

function extFromUri(uri: string, type?: "image" | "video") {
  const clean = String(uri).split("?")[0].split("#")[0];
  const fromUri = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "";
  if (fromUri) return fromUri;
  return type === "video" ? "mp4" : "jpg";
}

function mimeFromExt(ext: string, type?: "image" | "video") {
  const e = ext.toLowerCase();
  if (type === "video" || ["mp4", "mov", "m4v", "webm"].includes(e)) {
    if (e === "mov") return "video/quicktime";
    if (e === "webm") return "video/webm";
    return "video/mp4";
  }
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

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

export default function CommunityNewPost() {
  const params = useLocalSearchParams<{ id: string }>();
  const groupId = params.id;

  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow media access.");

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      selectionLimit: 8,
    });

    if (res.canceled) return;

    setPhotos(
      res.assets.map((a) => ({
        uri: a.uri,
        type: a.type === "video" ? "video" : "image",
      }))
    );
  };

  const uploadMedia = async (userId: string, media: Picked) => {
    const clean = String(media.uri).split("?")[0].split("#")[0];
    const dotExt = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : (media.type === "video" ? "mp4" : "jpg");
    const storagePath = `groups/${groupId}/${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${dotExt}`;
    return uploadMediaToSupabase(media.uri, "post-images", storagePath, media.type);
  };

  const create = async () => {
    if (!groupId) return;
    if (photos.length === 0 && !content.trim()) {
      return Alert.alert("Empty post", "Add text or at least 1 photo.");
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;

    // Ensure membership is active (RLS also enforces this)
    const { data: mem } = await supabase
      .from("group_members")
      .select("status")
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .maybeSingle();

    if (String((mem as any)?.status ?? "") !== "active") {
      setLoading(false);
      return Alert.alert("Not allowed", "You must be an active member to post.");
    }

    const { data: post, error: pErr } = await supabase
      .from("group_posts")
      .insert({
        group_id: groupId,
        user_id: uid,
        content: content.trim() || null,
      } as any)
      .select("id")
      .single();

    if (pErr || !post?.id) {
      setLoading(false);
      return Alert.alert("Post failed", pErr?.message ?? "Unknown error");
    }

    try {
      for (let i = 0; i < photos.length; i++) {
        const url = await uploadMedia(uid, photos[i]);
        const { error: mErr } = await supabase.from("group_post_media").insert({
          post_id: post.id,
          url,
          sort_order: i,
        } as any);
        if (mErr) throw mErr;
      }

      setLoading(false);
      router.replace({ pathname: "/communities/[id]", params: { id: groupId } });
    } catch (e: any) {
      setLoading(false);
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    }
  };

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>New community post</Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>Post inside this community</Text>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Write something (optional)…"
          placeholderTextColor={COLORS.muted}
          multiline
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            borderRadius: 14,
            padding: 12,
            minHeight: 90,
          }}
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
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>Pick Photos / Videos (max 8)</Text>
        </Pressable>

        {photos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ position: "relative" }}>
                <MediaThumbnail
                  url={p.uri}
                  width={110}
                  height={110}
                  borderRadius={14}
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
        ) : null}

        <Pressable
          onPress={create}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#777" : COLORS.button,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{loading ? "Posting…" : "Post"}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={{
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}