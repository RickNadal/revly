import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
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
  accent: "#7CFFB2",
  accentBg: "rgba(124,255,178,0.12)",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
};

const LIVE_PERKS = [
  "Advertentievrije feed- en browse-ervaring.",
  "Premium-badge op je profiel zodat vroege supporters opvallen.",
  "Ondersteunt direct hosting, builds, testtoestellen en nieuwe functies.",
  "Prioritaire feedbackreview wanneer je bugs of ideeen doorgeeft.",
];

const NEXT_PERKS = [
  "Vroege toegang tot nieuwe functies voor bredere uitrol.",
  "Exclusieve profielstijlen en supporter-cosmetics.",
  "Creator boost-tools: langere clips, betere kwaliteitsopties en postplanning.",
  "Premium-only community drops, giveaways of beta-tools.",
];

type PremiumStyle = "classic" | "aurora" | "sunset" | "electric";

const STYLE_OPTIONS: Array<{ key: PremiumStyle; label: string; color: string }> = [
  { key: "classic", label: "Classic", color: "#7CFFB2" },
  { key: "aurora", label: "Aurora", color: "#60E8FF" },
  { key: "sunset", label: "Sunset", color: "#FFB86A" },
  { key: "electric", label: "Electric", color: "#D29BFF" },
];

export default function PremiumScreen() {
  const { t } = useTranslation();
  const [startingCheckout, setStartingCheckout] = React.useState(false);
  const [restoringPremium, setRestoringPremium] = React.useState(false);
  const [isPremium, setIsPremium] = React.useState(false);
  const [premiumStyle, setPremiumStyle] = React.useState<PremiumStyle>("classic");
  const [savingStyle, setSavingStyle] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      (async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
          if (alive) {
            setIsPremium(false);
            setPremiumStyle("classic");
          }
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("is_premium, premium_style")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!alive) return;
        const nextPremium = !!(data as any)?.is_premium;
        const nextStyle = String((data as any)?.premium_style ?? "classic") as PremiumStyle;
        setIsPremium(nextPremium);
        setPremiumStyle(
          nextStyle === "aurora" || nextStyle === "sunset" || nextStyle === "electric" ? nextStyle : "classic"
        );
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  const startPremiumCheckout = React.useCallback(async () => {
    try {
      setStartingCheckout(true);

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
        Alert.alert("Afrekenen mislukt", "Ontbrekende Supabase-configuratie in deze build.");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-premium-checkout`, {
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
        Alert.alert("Afrekenen mislukt", message);
        return;
      }

      const url = String((payload as any)?.url ?? "").trim();
      if (!url) {
        Alert.alert("Afrekenen mislukt", "Geen checkout-URL ontvangen.");
        return;
      }

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Afrekenen mislukt", "Je apparaat kan de checkout-link niet openen.");
        return;
      }

      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Afrekenen mislukt", err?.message ?? "Onbekende fout");
    } finally {
      setStartingCheckout(false);
    }
  }, []);

  const restorePremiumStatus = React.useCallback(async () => {
    try {
      setRestoringPremium(true);

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
        Alert.alert("Herstellen mislukt", "Ontbrekende Supabase-configuratie in deze build.");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-premium-status`, {
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
        Alert.alert("Herstellen mislukt", message);
        return;
      }

      const isPremium = !!(payload as any)?.isPremium;
      setIsPremium(isPremium);
      Alert.alert(
        "Premium vernieuwd",
        isPremium ? "Je premiumstatus is actief." : "Er is geen actieve premium-abonnement gevonden."
      );
    } catch (err: any) {
      Alert.alert("Herstellen mislukt", err?.message ?? "Onbekende fout");
    } finally {
      setRestoringPremium(false);
    }
  }, []);

  const savePremiumStyle = React.useCallback(async (nextStyle: PremiumStyle) => {
    try {
      if (!isPremium) {
        Alert.alert("Premium vereist", "Neem eerst Premium om exclusieve profielstijlen vrij te spelen.");
        return;
      }

      setSavingStyle(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        Alert.alert("Inloggen vereist", "Je sessie is verlopen. Log opnieuw in.");
        router.replace("/sign-in");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ premium_style: nextStyle } as any)
        .eq("id", session.user.id);

      if (error) {
        Alert.alert("Stijl bijwerken mislukt", error.message);
        return;
      }

      setPremiumStyle(nextStyle);
    } finally {
      setSavingStyle(false);
    }
  }, [isPremium]);

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
            backgroundColor: COLORS.accentBg,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.accent, fontWeight: "900", letterSpacing: 0.6 }}>PREMIUM</Text>
          <Text style={{ color: COLORS.text, fontSize: 30, fontWeight: "900", marginTop: 8 }}>
            {t("premium.title", { defaultValue: "Steun de app en ontgrendel meer" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21, fontWeight: "700" }}>
            {t("premium.subtitle", {
              defaultValue:
                "Premium moet het waard zijn. Het houdt de app lichter qua advertenties, helpt ontwikkeling als solo-bouwer te financieren en geeft supporters zichtbare voordelen in plaats van een verborgen fooienpot.",
            })}
          </Text>
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("premium.live_perks", { defaultValue: "Wat premium moet bevatten" })}
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            {LIVE_PERKS.map((perk) => (
              <View key={perk} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "900" }}>✓</Text>
                </View>
                <Text style={{ flex: 1, color: COLORS.text, lineHeight: 21 }}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("premium.future_perks", { defaultValue: "Voordelen om hierna te bouwen" })}
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            {NEXT_PERKS.map((perk) => (
              <View key={perk} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "900" }}>+</Text>
                </View>
                <Text style={{ flex: 1, color: COLORS.text, lineHeight: 21 }}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("premium.style_pack", { defaultValue: "Exclusief profielstijl-pakket" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {t("premium.style_pack_body", {
              defaultValue: "Kies hoe je Premium-badge en accentkleur in de app worden weergegeven.",
            })}
          </Text>

          <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {STYLE_OPTIONS.map((opt) => {
              const active = premiumStyle === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => savePremiumStyle(opt.key)}
                  disabled={savingStyle}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? opt.color : COLORS.border,
                    backgroundColor: active ? "rgba(255,255,255,0.08)" : COLORS.chip,
                    opacity: savingStyle ? 0.75 : 1,
                  }}
                >
                  <Text style={{ color: active ? opt.color : COLORS.text, fontWeight: "900", fontSize: 12 }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("premium.solo_dev", { defaultValue: "Waarom dit belangrijk is" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21 }}>
            {t("premium.solo_dev_body", {
              defaultValue:
                "Dit project wordt solo gebouwd. Premium is niet alleen een badge. Het helpt betalen voor infrastructuur, Stripe-kosten, Android- en iOS-releases, testhardware en de tijd die nodig is om updates te blijven leveren.",
            })}
          </Text>
        </View>

        <Pressable
          onPress={startPremiumCheckout}
          disabled={startingCheckout}
          style={{ marginTop: 18, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 14, alignItems: "center", opacity: startingCheckout ? 0.7 : 1 }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {startingCheckout
              ? t("premium.checkout_starting", { defaultValue: "Checkout openen..." })
              : t("premium.cta", { defaultValue: "Neem Premium" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/early-access")}
          style={{ marginTop: 10, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {t("premium.early_access", { defaultValue: "Open vroege toegang" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/feedback")}
          style={{ marginTop: 10, alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
            {t("premium.feedback_cta", { defaultValue: "Stel premium-voordelen voor" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={restorePremiumStatus}
          disabled={restoringPremium}
          style={{ marginTop: 8, alignItems: "center", paddingVertical: 8, opacity: restoringPremium ? 0.7 : 1 }}
        >
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
            {restoringPremium
              ? t("premium.restoring", { defaultValue: "Premium herstellen..." })
              : t("premium.restore", { defaultValue: "Premiumstatus herstellen" })}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}