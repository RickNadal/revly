import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type WinnerRow = {
  id: string;
  cycle_id: string;
  rider_id: string;
  rank_position: number;
  total_points: number;
  created_at: string;
  rider_name: string;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
};

export default function BikeHallOfFameScreen() {
  const [rows, setRows] = useState<WinnerRow[]>([]);

  const load = useCallback(async () => {
    const { data: history } = await supabase
      .from("bike_of_month_winner_history")
      .select("id, cycle_id, rider_id, rank_position, total_points, created_at")
      .order("created_at", { ascending: false })
      .limit(120);

    const riderIds = Array.from(new Set(((history ?? []) as any[]).map((x) => String(x.rider_id))));
    const { data: profiles } = riderIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", riderIds)
      : ({ data: [] } as any);

    const nameById = new Map<string, string>();
    for (const p of (profiles ?? []) as any[]) nameById.set(String(p.id), String(p.full_name ?? "Rijder"));

    const merged: WinnerRow[] = ((history ?? []) as any[]).map((h) => ({
      id: String(h.id),
      cycle_id: String(h.cycle_id),
      rider_id: String(h.rider_id),
      rank_position: Number(h.rank_position),
      total_points: Number(h.total_points ?? 0),
      created_at: String(h.created_at),
      rider_name: nameById.get(String(h.rider_id)) ?? "Rijder",
    }));

    setRows(merged);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const winners = rows.filter((r) => r.rank_position === 1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 24 }}>Hall of Fame</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: COLORS.muted, fontSize: 22 }}>✕</Text></Pressable>
      </View>

      <FlatList
        data={winners}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted }}>Nog geen winnaars.</Text>}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/rider", params: { id: item.rider_id } })}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,214,122,0.4)",
              backgroundColor: index % 2 === 0 ? "rgba(255,214,122,0.10)" : COLORS.card,
              padding: 12,
            }}
          >
            <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }}>BOTM WINNAAR</Text>
            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>{item.rider_name}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 2 }}>{new Date(item.created_at).toLocaleDateString()}</Text>
            <Text style={{ color: "#FFD67A", marginTop: 4, fontWeight: "900" }}>{item.total_points} ptn</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
