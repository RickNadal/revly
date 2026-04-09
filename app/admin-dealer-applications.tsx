// app/admin-dealer-applications.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    Text,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ApplicationRow = {
  user_id: string;
  business_name: string;
  contact_email: string;
  tier_id: string;
  dealer_type: string | null;
  status: "pending_review" | "active" | "rejected" | "suspended";
  created_at: string;
  full_name: string | null;
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
  ok: "#7CFFB2",
  okBg: "rgba(124,255,178,0.14)",
  danger: "#FF7C7C",
  dangerBg: "rgba(255,90,95,0.14)",
  warn: "#F5C451",
};

type Tab = "pending" | "all";

export default function AdminDealerApplicationsScreen() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return false;
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", sessionData.session.user.id)
      .single();
    if ((prof as any)?.role !== "admin") {
      Alert.alert("Geen toegang", "Dit scherm is alleen voor admins.");
      router.back();
      return false;
    }
    return true;
  };

  const load = async () => {
    setLoading(true);
    const ok = await ensureAdmin();
    if (!ok) return;

    const { data: accounts, error } = await supabase
      .from("business_accounts")
      .select("user_id, business_name, contact_email, tier_id, dealer_type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setLoading(false);
      Alert.alert("Laden mislukt", error.message);
      return;
    }

    const userIds = (accounts ?? []).map((a: any) => a.user_id);
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        nameMap[(p as any).id] = (p as any).full_name ?? "";
      }
    }

    const mapped: ApplicationRow[] = (accounts ?? []).map((r: any) => ({
      user_id: r.user_id,
      business_name: r.business_name,
      contact_email: r.contact_email,
      tier_id: r.tier_id,
      dealer_type: r.dealer_type ?? null,
      status: r.status,
      created_at: r.created_at,
      full_name: nameMap[r.user_id] ?? null,
    }));

    setRows(mapped);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const displayed = tab === "pending"
    ? rows.filter((r) => r.status === "pending_review")
    : rows;

  const approve = async (row: ApplicationRow) => {
    Alert.alert(
      "Dealer goedkeuren?",
      `${row.business_name} goedkeuren? Ze worden gevraagd facturering in te stellen.`,
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Goedkeuren",
          onPress: async () => {
            setSavingId(row.user_id);
            const { error } = await supabase
              .from("business_accounts")
              .update({ status: "active" })
              .eq("user_id", row.user_id);
            setSavingId(null);
            if (error) return Alert.alert("Mislukt", error.message);
            setRows((prev) =>
              prev.map((r) =>
                r.user_id === row.user_id ? { ...r, status: "active" } : r
              )
            );
          },
        },
      ]
    );
  };

  const reject = async (row: ApplicationRow) => {
    Alert.alert(
      "Dealer afwijzen?",
      `${row.business_name} afwijzen?`,
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Afwijzen",
          style: "destructive",
          onPress: async () => {
            setSavingId(row.user_id);
            const { error } = await supabase
              .from("business_accounts")
              .update({ status: "rejected" })
              .eq("user_id", row.user_id);
            setSavingId(null);
            if (error) return Alert.alert("Mislukt", error.message);
            setRows((prev) =>
              prev.map((r) =>
                r.user_id === row.user_id ? { ...r, status: "rejected" } : r
              )
            );
          },
        },
      ]
    );
  };

  const statusColor = (s: string) => {
    if (s === "active") return COLORS.ok;
    if (s === "rejected" || s === "suspended") return COLORS.danger;
    return COLORS.warn;
  };

  const tierLabel = (id: string) => {
    if (id === "dealer_pro") return "Pro";
    return "Basic";
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Terug</Text>
        </Pressable>

        <Text style={{ fontSize: 24, fontWeight: "900", color: COLORS.text, marginTop: 4 }}>
          Dealer aanvragen
        </Text>

        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
          {rows.filter((r) => r.status === "pending_review").length} in behandeling
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => setTab("pending")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: tab === "pending" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: tab === "pending" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              In behandeling
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("all")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: tab === "all" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: tab === "all" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              Alles
            </Text>
          </Pressable>

          <Pressable
            onPress={load}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {loading ? "…" : "↻"}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 20 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
              {loading ? "Laden…" : tab === "pending" ? "Geen aanvragen in behandeling." : "Nog geen aanvragen."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSaving = savingId === item.user_id;
          return (
            <View
              style={{
                marginBottom: 14,
                padding: 14,
                borderRadius: 18,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
                    {item.business_name}
                  </Text>
                  {item.full_name ? (
                    <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 2 }}>
                      {item.full_name}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor:
                      item.status === "active"
                        ? COLORS.okBg
                        : item.status === "pending_review"
                        ? "rgba(245,196,81,0.14)"
                        : COLORS.dangerBg,
                  }}
                >
                  <Text style={{ color: statusColor(item.status), fontWeight: "900", fontSize: 12 }}>
                    {item.status === "pending_review" ? "In behandeling" : item.status === "active" ? "Actief" : item.status === "rejected" ? "Afgewezen" : item.status === "suspended" ? "Gesuspendeerd" : item.status}
                  </Text>
                </View>
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700" }}>
                {item.contact_email}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    Tier: {tierLabel(item.tier_id)}
                  </Text>
                </View>

                {item.dealer_type ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: COLORS.chip,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                      {item.dealer_type}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 6, fontSize: 12 }}>
                Aangevraagd op {new Date(item.created_at).toLocaleDateString("nl-NL")}
              </Text>

              {item.status === "pending_review" ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => approve(item)}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: COLORS.okBg,
                      borderWidth: 1,
                      borderColor: COLORS.ok,
                      opacity: isSaving ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: COLORS.ok, fontWeight: "900" }}>
                      {isSaving ? "Opslaan…" : "Goedkeuren"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => reject(item)}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: COLORS.dangerBg,
                      borderWidth: 1,
                      borderColor: COLORS.danger,
                      opacity: isSaving ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: "900" }}>
                      {isSaving ? "Opslaan…" : "Afwijzen"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
