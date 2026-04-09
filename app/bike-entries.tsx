import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type Cycle = { id: string; month_start: string; status: "open" | "closed" };
type EntryRow = {
  submission_id: string;
  cycle_id: string;
  user_id: string;
  bike_name: string;
  bike_photo_url: string;
  description: string | null;
  regular_vote_count: number;
  boost_points: number;
  total_points: number;
  rider_name: string;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
};

export default function BikeEntriesScreen() {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const load = useCallback(async () => {
    setLoading(true);

    const { data: cycles } = await supabase
      .from("bike_of_month_cycles")
      .select("id, month_start, status")
      .order("month_start", { ascending: false })
      .limit(1);

    const current = (cycles ?? [])[0] as Cycle | undefined;
    if (!current) {
      setCycle(null);
      setRows([]);
      setLoading(false);
      return;
    }
    setCycle(current);

    const { data: scores } = await supabase
      .from("bike_of_month_submission_scores" as any)
      .select("submission_id, cycle_id, user_id, bike_name, bike_photo_url, description, regular_vote_count, boost_points, total_points")
      .eq("cycle_id", current.id)
      .order("total_points", { ascending: false });

    const riderIds = Array.from(new Set(((scores ?? []) as any[]).map((x) => String(x.user_id)).filter(Boolean)));
    const { data: profs } = riderIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", riderIds)
      : ({ data: [] } as any);

    const nameById = new Map<string, string>();
    for (const p of (profs ?? []) as any[]) nameById.set(String(p.id), String(p.full_name ?? "Rijder"));

    const merged: EntryRow[] = ((scores ?? []) as any[]).map((row: any) => ({
      submission_id: String(row.submission_id),
      cycle_id: String(row.cycle_id),
      user_id: String(row.user_id),
      bike_name: String(row.bike_name ?? "Motor"),
      bike_photo_url: String(row.bike_photo_url ?? ""),
      description: row.description ?? null,
      regular_vote_count: Number(row.regular_vote_count ?? 0),
      boost_points: Number(row.boost_points ?? 0),
      total_points: Number(row.total_points ?? 0),
      rider_name: nameById.get(String(row.user_id)) ?? "Rijder",
    }));

    setRows(merged);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openViewer = (photoUrl: string) => {
    const url = String(photoUrl ?? "").trim();
    if (!url) return;

    router.push({
      pathname: "/viewer",
      params: {
        urls: JSON.stringify([url]),
        index: "0",
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>Alle BOTM-inzendingen</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: COLORS.muted, fontSize: 22 }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/bike-of-month")}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(255,214,122,0.45)",
              backgroundColor: "rgba(255,214,122,0.12)",
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: "#FFD67A", fontWeight: "900" }}>Open BOTM</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("list")}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: viewMode === "list" ? "rgba(124,255,178,0.45)" : COLORS.border,
              backgroundColor: viewMode === "list" ? "rgba(124,255,178,0.12)" : COLORS.card,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: viewMode === "list" ? "#7CFFB2" : COLORS.muted, fontWeight: "900" }}>List</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("grid")}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: viewMode === "grid" ? "rgba(124,255,178,0.45)" : COLORS.border,
              backgroundColor: viewMode === "grid" ? "rgba(124,255,178,0.12)" : COLORS.card,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: viewMode === "grid" ? "#7CFFB2" : COLORS.muted, fontWeight: "900" }}>Grid</Text>
          </Pressable>
          {cycle ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                {new Date(cycle.month_start).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <FlatList
        key={viewMode}
        data={rows}
        numColumns={viewMode === "grid" ? 2 : 1}
        keyExtractor={(item) => item.submission_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 10 }}
        columnWrapperStyle={viewMode === "grid" ? { gap: 10 } : undefined}
        ListEmptyComponent={
          <Text style={{ color: COLORS.muted }}>
            {loading ? "Inzendingen laden..." : "Nog geen inzendingen."}
          </Text>
        }
        renderItem={({ item, index }) => (
          <View
            style={{
              flex: viewMode === "grid" ? 1 : undefined,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: "hidden",
              backgroundColor: COLORS.card,
            }}
          >
            <Pressable onPress={() => openViewer(item.bike_photo_url)}>
              {item.bike_photo_url ? (
                <Image source={{ uri: item.bike_photo_url }} style={{ width: "100%", height: viewMode === "grid" ? 140 : 180 }} resizeMode="cover" />
              ) : (
                <View style={{ width: "100%", height: viewMode === "grid" ? 140 : 180, alignItems: "center", justifyContent: "center", backgroundColor: "#101019" }}>
                  <Text style={{ color: COLORS.muted }}>Geen foto</Text>
                </View>
              )}
            </Pressable>

            <View style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                  {item.bike_name}
                </Text>
                <Text style={{ color: "#FFD67A", fontWeight: "900" }}>#{index + 1}</Text>
              </View>
              <Pressable onPress={() => router.push({ pathname: "/rider", params: { id: item.user_id } })}>
                <Text style={{ color: COLORS.muted, marginTop: 2 }} numberOfLines={1}>{item.rider_name}</Text>
              </Pressable>
              {viewMode === "list" && item.description ? (
                <Text style={{ color: COLORS.text, marginTop: 8 }} numberOfLines={2}>{item.description}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: viewMode === "grid" ? 8 : 12, marginTop: 10 }}>
                <Text style={{ color: COLORS.muted }}>Stemmen: {item.regular_vote_count}</Text>
                {viewMode === "list" ? <Text style={{ color: "#D9B8FF" }}>Boost: +{item.boost_points}</Text> : null}
                <Text style={{ color: "#FFD67A", fontWeight: "900" }}>Totaal: {item.total_points}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
