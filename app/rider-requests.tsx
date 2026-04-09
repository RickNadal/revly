import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "denied" | "expired" | "blocked";
  message: string | null;
  created_at: string;
  decided_at: string | null;
  sender?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  danger: "#FF7C7C",
  ok: "#7CFFB2",
  warn: "#FFD67A",
};

export default function RiderRequestsScreen() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<RequestRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      router.replace("/sign-in");
      return;
    }

    const { data, error } = await supabase
      .from("rider_contact_requests")
      .select("id, sender_id, receiver_id, status, message, created_at, decided_at, sender:profiles!rider_contact_requests_sender_id_fkey(id, full_name, avatar_url)")
      .eq("receiver_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      Alert.alert("Laden mislukt", error.message);
      setIncoming([]);
      setLoading(false);
      return;
    }

    setIncoming((data ?? []) as any);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const decide = async (row: RequestRow, decision: "accepted" | "denied") => {
    setSavingId(row.id);
    try {
      const { data, error } = await supabase.rpc("decide_rider_contact_request", {
        p_request_id: row.id,
        p_decision: decision,
      } as any);

      if (error) {
        Alert.alert("Actie mislukt", error.message);
        return;
      }

      if (decision === "accepted") {
        const senderId = String((data as any)?.sender_id ?? row.sender_id ?? "");
        if (senderId) {
          const thread = await supabase.rpc("dm_get_or_create_thread", { other_user: senderId });
          if (!thread.error && thread.data) {
            router.push({ pathname: "/messages/[id]", params: { id: String(thread.data) } });
          }
        }
      }

      await load();
    } finally {
      setSavingId(null);
    }
  };

  const pendingOnly = useMemo(() => incoming.filter((x) => x.status === "pending"), [incoming]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 50,
          backgroundColor: "rgba(255,214,122,0.18)",
          borderColor: "rgba(255,214,122,0.5)",
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: 5,
          paddingHorizontal: 10,
        }}
      >
        <Text style={{ color: COLORS.warn, fontWeight: "900", fontSize: 11 }}>EXPERIMENTAL</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>Rijdersverzoeken</Text>
          <Pressable onPress={load} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="refresh" size={20} color={COLORS.text} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={pendingOnly}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, padding: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{loading ? "Laden..." : "Geen openstaande verzoeken"}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6 }}>Wanneer rijders contact aanvragen, verschijnen ze hier ter goedkeuring.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, padding: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
              {item.sender?.full_name?.trim() || "Rider"}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 3, fontSize: 12 }}>
              Aangevraagd op {new Date(item.created_at).toLocaleString()}
            </Text>

            {item.message ? (
              <View style={{ marginTop: 9, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.chip, padding: 10 }}>
                <Text style={{ color: COLORS.text }}>{item.message}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pressable
                onPress={() => router.push({ pathname: "/rider", params: { id: item.sender_id } })}
                style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.chip, paddingVertical: 8, paddingHorizontal: 10 }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>Bekijk profiel</Text>
              </Pressable>

              <Pressable
                onPress={() => void decide(item, "accepted")}
                disabled={savingId === item.id}
                style={{ borderRadius: 10, backgroundColor: COLORS.button, paddingVertical: 8, paddingHorizontal: 10, opacity: savingId === item.id ? 0.7 : 1 }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900", fontSize: 12 }}>Accepteren & chat openen</Text>
              </Pressable>

              <Pressable
                onPress={() => void decide(item, "denied")}
                disabled={savingId === item.id}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip, paddingVertical: 8, paddingHorizontal: 10, opacity: savingId === item.id ? 0.7 : 1 }}
              >
                <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 12 }}>Weigeren</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
