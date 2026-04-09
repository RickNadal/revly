import * as Linking from "expo-linking";
import { router } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  warm: "#F5C451",
  warmBg: "rgba(245,196,81,0.12)",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
};

const USES = [
  "Server- en databasekosten.",
  "Google Play- en Apple-ontwikkelaarskosten.",
  "Testtoestellen, bugfixes en buildtijd.",
  "Sneller opleveren van functies waar de community om vraagt.",
];

export default function DonationsScreen() {
  const { t } = useTranslation();
  const [startingDonation, setStartingDonation] = React.useState(false);

  const startDonationCheckout = React.useCallback(async () => {
    try {
      setStartingDonation(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        Alert.alert("Inloggen vereist", "Je sessie is verlopen. Log opnieuw in.");
        router.replace("/sign-in");
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      const supabaseAnonOrPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (!supabaseUrl || !supabaseAnonOrPublishableKey) {
        Alert.alert("Donatie mislukt", "Ontbrekende Supabase-configuratie in deze build.");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-donation-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonOrPublishableKey,
        },
        body: JSON.stringify({}),
      });

      const raw = await response.text();
      let payload: any = null;
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = raw;
        }
      }

      if (!response.ok) {
        const message =
          (payload && typeof payload === "object" && payload.error ? String(payload.error) : null) ??
          (typeof payload === "string" && payload ? payload : null) ??
          `HTTP ${response.status}`;
        Alert.alert("Donatie mislukt", message);
        return;
      }

      const url = String((payload as any)?.url ?? "").trim();
      if (!url) {
        Alert.alert("Donatie mislukt", "Geen checkout-URL ontvangen.");
        return;
      }

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Donatie mislukt", "Je apparaat kan de checkout-link niet openen.");
        return;
      }

      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Donatie mislukt", err?.message ?? "Onbekende fout");
    } finally {
      setStartingDonation(false);
    }
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Terug" })}</Text>
        </Pressable>

        <View
          style={{
            marginTop: 8,
            padding: 18,
            borderRadius: 22,
            backgroundColor: COLORS.warmBg,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.warm, fontWeight: "900", letterSpacing: 0.6 }}>DONATIES</Text>
          <Text style={{ color: COLORS.text, fontSize: 30, fontWeight: "900", marginTop: 8 }}>
            {t("donations.title", { defaultValue: "Steun het project direct" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21, fontWeight: "700" }}>
            {t("donations.subtitle", {
              defaultValue:
                "Als je wilt helpen zonder abonnement, zijn donaties de eenvoudige optie. Elke bijdrage helpt het project levend te houden terwijl het door een solo-ontwikkelaar wordt gebouwd.",
            })}
          </Text>
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("donations.where_it_goes", { defaultValue: "Waar donaties naartoe gaan" })}
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            {USES.map((item) => (
              <View key={item} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: COLORS.warm, fontWeight: "900" }}>•</Text>
                </View>
                <Text style={{ flex: 1, color: COLORS.text, lineHeight: 21 }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={startDonationCheckout}
          disabled={startingDonation}
          style={{ marginTop: 18, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 14, alignItems: "center", opacity: startingDonation ? 0.7 : 1 }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {startingDonation
              ? t("donations.starting", { defaultValue: "Checkout openen..." })
              : t("donations.cta", { defaultValue: "Doneer nu" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/feedback")}
          style={{ marginTop: 10, alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
            {t("donations.feedback_cta", { defaultValue: "Stuur ideeen voor supporter-voordelen" })}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}