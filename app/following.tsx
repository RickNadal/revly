import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type Row = { id: string; full_name: string };

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
};

export default function FollowingScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const targetId = params.id;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return router.replace("/sign-in");

    const uid = targetId ?? session.user.id;

    // 1) Get IDs you follow
    const { data: f, error: fErr } = await supabase.from("follows").select("following_id").eq("follower_id", uid);

    if (fErr) console.log("FOLLOWING ERROR:", fErr);

    const followingIds = (f ?? []).map((x: any) => x.following_id);

    // ✅ If none, show empty
    if (followingIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 2) Try to get names from profiles
    const { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name").in("id", followingIds);

    if (pErr) console.log("PROFILES ERROR:", pErr);

    // ✅ Build map of names (if profiles were returned)
    const nameById = new Map<string, string>();
    for (const p of profs ?? []) {
      nameById.set(p.id, p.full_name ?? "Rider");
    }

    // ✅ IMPORTANT: even if profiles returns nothing, we STILL show IDs
    const list: Row[] = followingIds.map((id: string) => ({
      id,
      full_name: nameById.get(id) ?? "Rider",
    }));

    setRows(list);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [targetId])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: COLORS.text }}>Following</Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {targetId ? "This rider follows" : "People you follow"}
        </Text>

        {loading ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>Loading...</Text>
        ) : (
          <FlatList
            style={{ marginTop: 12 }}
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: "/rider", params: { id: item.id } })}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  marginBottom: 10,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", fontSize: 16, color: COLORS.text }}>{item.full_name}</Text>
                <Text style={{ color: COLORS.muted, marginTop: 4 }} numberOfLines={1}>
                  {item.id}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={{ marginTop: 14, color: COLORS.muted }}>Not following anyone yet.</Text>}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
