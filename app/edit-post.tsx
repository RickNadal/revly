// app/edit-post.tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

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
};

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      router.back();
      return;
    }

    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        router.replace("/sign-in");
        return;
      }

      const { data: post, error } = await supabase
        .from("posts")
        .select("id, caption, user_id")
        .eq("id", id)
        .single();

      if (error || !post) {
        Alert.alert("Error", "Could not load post.");
        router.back();
        return;
      }

      if (post.user_id !== session.session.user.id) {
        Alert.alert("Not allowed", "You can only edit your own posts.");
        router.back();
        return;
      }

      setCaption(post.caption ?? "");
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({ caption: caption.trim() || null })
        .eq("id", id);

      if (error) {
        Alert.alert("Save failed", error.message);
        return;
      }

      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={COLORS.text} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28, gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ padding: 6, marginLeft: -6 }}
            hitSlop={12}
          >
            <Text style={{ color: COLORS.muted, fontSize: 15, fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", flex: 1 }}>Edit post</Text>
        </View>

        {/* Caption input */}
        <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8 }}>
          CAPTION
        </Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption…"
          placeholderTextColor={COLORS.muted}
          multiline
          style={{
            backgroundColor: COLORS.inputBg,
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            borderRadius: 14,
            color: COLORS.text,
            fontSize: 15,
            padding: 14,
            minHeight: 120,
            textAlignVertical: "top",
          }}
          autoFocus
        />

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            marginTop: 24,
            backgroundColor: COLORS.button,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900", fontSize: 15 }}>
            {saving ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
