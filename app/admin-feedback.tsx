// app/admin-feedback.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type FeedbackRow = {
  id: string;
  created_at: string;
  user_id: string;
  category: string | null;
  rating: number | null;
  message: string;
  app_version: string | null;
  platform: string | null;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  danger: "#FF5A5F",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

// ✅ IMPORTANT: replace with YOUR Supabase Auth UID
const ADMIN_USER_ID = "165b27e6-a9df-4cc2-a529-9c667cb5f018";

export default function AdminFeedbackScreen() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.replace("/sign-in");
      return false;
    }

    const uid = session.user.id;
    const ok = uid === ADMIN_USER_ID;

    if (!ok) {
      Alert.alert("Access denied", "This screen is admin-only.");
      router.back();
      return false;
    }

    return true;
  };

  const load = async () => {
    setLoading(true);

    const ok = await ensureAdmin();
    setChecked(true);
    if (!ok) return;

    const { data, error } = await supabase
      .from("feedback")
      .select("id, created_at, user_id, category, rating, message, app_version, platform")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    setItems((data ?? []) as FeedbackRow[]);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const deleteFeedback = async (id: string) => {
    Alert.alert("Delete feedback?", "This will remove it permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("feedback").delete().eq("id", id);
          if (error) return Alert.alert("Delete failed", error.message);
          setItems((prev) => prev.filter((x) => x.id !== id));
        },
      },
    ]);
  };

  // If the guard kicked them out, don't show anything fancy.
  if (checked && !loading && items.length === 0) {
    // still render the shell; RLS/admin guard controls access
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>Admin Feedback</Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          Latest submissions ({items.length})
        </Text>

        <Pressable
          onPress={load}
          style={{
            marginTop: 12,
            backgroundColor: COLORS.button,
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading ? "Loading…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 20 }}>
            <Text style={{ color: COLORS.muted }}>
              {loading ? "Loading…" : "No feedback yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 16,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {item.category ?? "Other"} {item.rating ? `· ${item.rating}/5` : ""}
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                  {new Date(item.created_at).toLocaleString()} · {item.platform ?? "?"} · v{item.app_version ?? "?"}
                </Text>
              </View>

              <Pressable onPress={() => deleteFeedback(item.id)}>
                <Text style={{ color: COLORS.danger, fontWeight: "900" }}>Delete</Text>
              </Pressable>
            </View>

            <Text style={{ color: COLORS.text, marginTop: 10, lineHeight: 20 }}>
              {item.message}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 10, fontSize: 12 }}>
              User: {item.user_id}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
