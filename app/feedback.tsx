// app/feedback.tsx
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

type Category = "Bug" | "Idea" | "Other";

export default function FeedbackScreen() {
  const [rating, setRating] = useState<number>(0); // 0 = none
  const [category, setCategory] = useState<Category>("Bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const appVersion = useMemo(() => {
    const v =
      (Constants as any)?.expoConfig?.version ??
      (Constants as any)?.manifest?.version ??
      (Constants as any)?.manifest2?.extra?.expoClient?.version ??
      "unknown";
    return String(v);
  }, []);

  const submit = async () => {
    const msg = message.trim();
    if (!msg) return Alert.alert("Missing feedback", "Please write your feedback message.");

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/sign-in");
        return;
      }

      const userId = session.user.id;

      const payload = {
        user_id: userId,
        rating: rating === 0 ? null : rating,
        category,
        message: msg,
        app_version: appVersion,
        platform: Platform.OS,
      };

      const { error } = await supabase.from("feedback").insert(payload);
      if (error) throw new Error(error.message);

      setMessage("");
      setRating(0);

      Alert.alert("Thanks!", "Feedback sent ✅", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Send failed", e?.message ?? "Unknown error");
    } finally {
      setSending(false);
    }
  };

  const CategoryChip = ({ label }: { label: Category }) => {
    const active = category === label;
    return (
      <Pressable
        onPress={() => setCategory(label)}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingRight: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>v{appVersion}</Text>
        </View>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text, marginTop: 6 }}>
          Feedback
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          Tell me what’s broken or what to improve.
        </Text>

        {/* Rating */}
        <View
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 16,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Rating (optional)</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = rating >= n;
              return (
                <Pressable key={n} onPress={() => setRating(n)} style={{ padding: 4 }}>
                  <Ionicons
                    name={filled ? "star" : "star-outline"}
                    size={28}
                    color={filled ? "#FFD34D" : COLORS.muted}
                  />
                </Pressable>
              );
            })}
            {rating > 0 ? (
              <Pressable onPress={() => setRating(0)} style={{ marginLeft: 6 }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Category */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Category</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <CategoryChip label="Bug" />
            <CategoryChip label="Idea" />
            <CategoryChip label="Other" />
          </View>
        </View>

        {/* Message */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write your feedback here…"
            placeholderTextColor={COLORS.muted}
            multiline
            style={{
              marginTop: 10,
              minHeight: 140,
              borderWidth: 1,
              borderColor: COLORS.inputBorder,
              padding: 12,
              borderRadius: 12,
              backgroundColor: COLORS.inputBg,
              color: COLORS.text,
              textAlignVertical: "top",
            }}
          />
        </View>

        {/* Submit */}
        <Pressable
          onPress={submit}
          disabled={sending}
          style={{
            marginTop: 16,
            backgroundColor: sending ? "#777" : COLORS.button,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900", fontSize: 16 }}>
            {sending ? "Sending…" : "Send feedback"}
          </Text>
        </Pressable>

        <Text style={{ marginTop: 10, color: COLORS.muted, fontWeight: "700", fontSize: 12 }}>
          Tip: include what you tapped + what you expected to happen.
        </Text>
      </View>
    </SafeAreaView>
  );
}
