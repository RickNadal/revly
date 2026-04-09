import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type BoostType = {
  id: string;
  name: string;
  emoji: string;
  price_cents: number;
  vote_points: number;
  sort_order: number;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
};

export default function BikeBoostScreen() {
  const params = useLocalSearchParams<{ cycleId?: string; submissionId?: string; bikeName?: string }>();
  const cycleId = String(params.cycleId ?? "").trim();
  const submissionId = String(params.submissionId ?? "").trim();
  const bikeName = String(params.bikeName ?? "Motor").trim();

  const [types, setTypes] = useState<BoostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const parseFunctionError = async (error: any) => {
    const context = error?.context;
    if (context) {
      try {
        const body = await context.json();
        if (typeof body?.error === "string" && body.error.trim()) return body.error;
      } catch {}
      try {
        const text = await context.text();
        if (typeof text === "string" && text.trim()) return text;
      } catch {}
      const status = Number(context?.status ?? 0);
      if (status) return `Afrekenen mislukt (${status}). Probeer opnieuw.`;
    }
    if (typeof error?.message === "string" && error.message.trim()) return error.message;
    return "Er is iets misgegaan.";
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bike_of_month_boost_types")
        .select("id, name, emoji, price_cents, vote_points, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      setTypes((data ?? []) as BoostType[]);
      setLoading(false);
    })();
  }, []);

  const buy = async (type: BoostType) => {
    if (!cycleId || !submissionId) return;
    setErrorText(null);
    setBusy(type.id);

    let { data: sessionData } = await supabase.auth.getSession();
    let accessToken = sessionData.session?.access_token ?? null;

    if (!accessToken) {
      const refreshed = await supabase.auth.refreshSession();
      accessToken = refreshed.data.session?.access_token ?? null;
    }

    if (!accessToken) {
      setBusy(null);
      return router.replace("/sign-in");
    }

    const payload = {
        cycle_id: cycleId,
        submission_id: submissionId,
        boost_type_id: type.id,
      };

    let { data, error } = await supabase.functions.invoke("create-bike-boost-checkout", {
      body: payload,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const status = Number((error as any)?.context?.status ?? (error as any)?.status ?? 0);
    if (error && status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      const retryToken = refreshed.data.session?.access_token ?? accessToken;
      const retried = await supabase.functions.invoke("create-bike-boost-checkout", {
        body: payload,
        headers: {
          Authorization: `Bearer ${retryToken}`,
        },
      });
      data = retried.data;
      error = retried.error;
    }

    setBusy(null);

    if (error) {
      setErrorText(await parseFunctionError(error));
      return;
    }

    if (!data?.url) {
      setErrorText("Afrekenen mislukt: ongeldige reactie van de server.");
      return;
    }

    await Linking.openURL(String(data.url));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Boost voor {bikeName}</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: COLORS.muted, fontSize: 20 }}>✕</Text></Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.muted} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={types}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => buy(item)}
              disabled={busy === item.id}
              style={{ borderRadius: 14, borderWidth: 1, borderColor: "rgba(200,155,255,0.4)", backgroundColor: "rgba(200,155,255,0.1)", padding: 14 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{item.emoji} {item.name}</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 2 }}>+{item.vote_points} stempunten</Text>
                </View>
                <Text style={{ color: "#D9B8FF", fontWeight: "900", fontSize: 16 }}>${(item.price_cents / 100).toFixed(2)}</Text>
              </View>
              {busy === item.id ? <Text style={{ color: COLORS.muted, marginTop: 8 }}>Afrekenen openen...</Text> : null}
            </Pressable>
          )}
        />
      )}

      {errorText ? (
        <Text style={{ color: "#FF6B6B", fontWeight: "700", marginHorizontal: 16, marginTop: 8 }}>
          {errorText}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}
