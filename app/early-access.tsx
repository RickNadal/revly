import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  accent: "#7CFFB2",
  accentBg: "rgba(124,255,178,0.12)",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

const BETA_ITEMS = [
  {
    title: "Creator-planner",
    body: "Plan posts en clips vooruit zodat je content actief blijft, ook wanneer je offline bent.",
    status: "Geplande beta",
  },
  {
    title: "Verbeterde clip-export",
    body: "Export-kwaliteitsinstellingen en stabielere uploads voor creators die vaak posten.",
    status: "In ontwerp",
  },
  {
    title: "Community-lab drops",
    body: "Probeer geselecteerde experimenten eerst en stem mee welke functies voor iedereen worden uitgerold.",
    status: "Doorlopend concept",
  },
];

export default function EarlyAccessScreen() {
  const [checking, setChecking] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setChecking(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
          if (alive) {
            setIsPremium(false);
            setChecking(false);
          }
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("is_premium")
          .eq("id", session.user.id)
          .maybeSingle();

        if (alive) {
          setIsPremium(!!(data as any)?.is_premium);
          setChecking(false);
        }
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Terug</Text>
        </Pressable>

        <View style={{ marginTop: 8, padding: 18, borderRadius: 22, backgroundColor: COLORS.accentBg, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.accent, fontWeight: "900", letterSpacing: 0.6 }}>VROEGE TOEGANG</Text>
          <Text style={{ color: COLORS.text, fontSize: 30, fontWeight: "900", marginTop: 8 }}>Premium functielab</Text>
          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21, fontWeight: "700" }}>
            Premium-leden krijgen geselecteerde functies eerst en helpen bepalen wat hierna voor iedereen wordt uitgebracht.
          </Text>
        </View>

        {checking ? (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.muted }}>Toegang controleren...</Text>
          </View>
        ) : isPremium ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            {BETA_ITEMS.map((item) => (
              <View
                key={item.title}
                style={{ padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{item.title}</Text>
                <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 21 }}>{item.body}</Text>
                <View style={{ alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(124,255,178,0.12)", borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 12 }}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Premium vereist</Text>
            <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 21 }}>
              Vroege toegang is inbegrepen bij Premium. Upgrade om beta-tools te ontgrendelen en als eerste toegang te krijgen tot komende functies.
            </Text>

            <Pressable
              onPress={() => router.push("/premium")}
              style={{ marginTop: 14, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>Bekijk Premium</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}