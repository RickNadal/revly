import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type AdminEntry = {
  submission_id: string;
  user_id: string;
  bike_name: string;
  bike_photo_url: string;
  description: string | null;
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

export default function BotmAdminScreen() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    const admin = String((profile as any)?.role ?? "") === "admin";
    setIsAdmin(admin);

    if (!admin) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const { data: cycles } = await supabase
      .from("bike_of_month_cycles")
      .select("id")
      .order("month_start", { ascending: false })
      .limit(1);

    const cycleId = String((cycles ?? [])[0]?.id ?? "").trim();
    if (!cycleId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const { data: scores } = await supabase
      .from("bike_of_month_submission_scores" as any)
      .select("submission_id, user_id, bike_name, bike_photo_url, description, total_points")
      .eq("cycle_id", cycleId)
      .order("total_points", { ascending: false });

    const riderIds = Array.from(new Set(((scores ?? []) as any[]).map((x) => String(x.user_id)).filter(Boolean)));
    const { data: profiles } = riderIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", riderIds)
      : ({ data: [] } as any);

    const nameById = new Map<string, string>();
    for (const p of (profiles ?? []) as any[]) {
      nameById.set(String(p.id), String(p.full_name ?? "Rijder"));
    }

    const merged: AdminEntry[] = ((scores ?? []) as any[]).map((row: any) => ({
      submission_id: String(row.submission_id),
      user_id: String(row.user_id),
      bike_name: String(row.bike_name ?? "Motor"),
      bike_photo_url: String(row.bike_photo_url ?? ""),
      description: row.description ?? null,
      total_points: Number(row.total_points ?? 0),
      rider_name: nameById.get(String(row.user_id)) ?? "Rijder",
    }));

    setEntries(merged);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const removeEntry = (entry: AdminEntry) => {
    Alert.alert(
      "Inzending verwijderen",
      `Verwijder inzending van ${entry.rider_name}? Gebruik dit alleen bij ongepaste inhoud.`,
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            setDeletingId(entry.submission_id);
            const { error } = await supabase
              .from("bike_of_month_submissions")
              .delete()
              .eq("id", entry.submission_id);
            setDeletingId(null);

            if (error) {
              Alert.alert("Verwijderen mislukt", error.message);
              return;
            }

            await load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>BOTM Admin Panel</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: COLORS.muted, fontSize: 22 }}>✕</Text>
        </Pressable>
      </View>

      {!isAdmin && !loading ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: COLORS.muted }}>Alleen admins kunnen deze pagina gebruiken.</Text>
        </View>
      ) : null}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.submission_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 10 }}
        ListEmptyComponent={
          <Text style={{ color: COLORS.muted }}>
            {loading ? "Laden..." : isAdmin ? "Geen inzendingen gevonden." : ""}
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: "hidden",
              backgroundColor: COLORS.card,
            }}
          >
            {item.bike_photo_url ? (
              <Image source={{ uri: item.bike_photo_url }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
            ) : (
              <View style={{ width: "100%", height: 180, alignItems: "center", justifyContent: "center", backgroundColor: "#101019" }}>
                <Text style={{ color: COLORS.muted }}>Geen foto</Text>
              </View>
            )}

            <View style={{ padding: 12 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{item.bike_name}</Text>
              <Text style={{ color: COLORS.muted, marginTop: 2 }}>{item.rider_name}</Text>
              {item.description ? <Text style={{ color: COLORS.text, marginTop: 8 }}>{item.description}</Text> : null}
              <Text style={{ color: "#FFD67A", fontWeight: "900", marginTop: 8 }}>Totaal: {item.total_points}</Text>

              <Pressable
                onPress={() => removeEntry(item)}
                disabled={deletingId === item.submission_id}
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(255,107,107,0.45)",
                  backgroundColor: "rgba(255,107,107,0.12)",
                  alignItems: "center",
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: "#FF6B6B", fontWeight: "900" }}>
                  {deletingId === item.submission_id ? "Verwijderen..." : "Remove Entry"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
