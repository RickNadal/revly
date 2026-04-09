import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getBusinessAccessSummary, type BusinessAccessSummary } from "../lib/ads/businessAccess";
import { signOutSafely, supabase } from "../lib/supabase";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
  accent: "rgba(245,196,81,0.16)",
  success: "rgba(124,255,178,0.12)",
  warning: "rgba(245,196,81,0.12)",
};

function statusTone(access: BusinessAccessSummary | null) {
  if (access?.canAdvertise) return { bg: COLORS.success, text: "#7CFFB2" };
  if (access?.nextStep === "review" || access?.nextStep === "pay") return { bg: COLORS.warning, text: "#F5C451" };
  return { bg: COLORS.chip, text: COLORS.text };
}

export default function DealerAccountScreen() {
  const { t } = useTranslation();
  const [access, setAccess] = useState<BusinessAccessSummary | null>(null);
  const [startingBilling, setStartingBilling] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"dealer_basic" | "dealer_pro">("dealer_basic");

  useEffect(() => {
    const tier = String(access?.account?.tier_id ?? "");
    if (tier === "dealer_pro") setSelectedTier("dealer_pro");
    if (tier === "dealer_basic") setSelectedTier("dealer_basic");
  }, [access?.account?.tier_id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const summary = await getBusinessAccessSummary();
        if (alive) setAccess(summary);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const startBillingCheckout = useCallback(async () => {
    try {
      setStartingBilling(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        Alert.alert("Aanmelden vereist", "Je sessie is verlopen. Log opnieuw in en probeer opnieuw.");
        router.replace("/sign-in");
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      const supabaseAnonOrPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (!supabaseUrl || !supabaseAnonOrPublishableKey) {
        Alert.alert("Facturering mislukt", "Supabase configuratie ontbreekt in deze build.");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-stripe-checkout`, {
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

        if (response.status === 401) {
          await signOutSafely();
          Alert.alert("Sessie verlopen", "Je sessie is ongeldig of verlopen. Log opnieuw in en probeer opnieuw.");
          router.replace("/sign-in");
          return;
        }

        Alert.alert("Facturering mislukt", message);
        return;
      }

      const data = payload;

      const url = String((data as any)?.url ?? "").trim();
      if (!url) {
        Alert.alert("Facturering mislukt", "Geen checkout URL ontvangen van server.");
        return;
      }

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Facturering mislukt", "Je apparaat kan de Stripe checkout link niet openen.");
        return;
      }

      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Facturering mislukt", err?.message ?? "Onbekende fout");
    } finally {
      setStartingBilling(false);
    }
  }, []);

  const nextAction = useMemo(() => {
    if (access?.nextStep === "sign-in") {
      return {
        label: t("dealer_account.sign_in", { defaultValue: "Sign in to apply" }),
        onPress: () => router.replace("/sign-in"),
      };
    }

    if (access?.nextStep === "manage") {
      return {
        label: t("dealer_account.manage", { defaultValue: "Open campaign manager" }),
        onPress: () => router.push("/advertise/manage"),
      };
    }

    if (access?.nextStep === "pay") {
      return {
        label: startingBilling
          ? t("dealer_account.billing_starting", { defaultValue: "Opening checkout..." })
          : t("dealer_account.activate_billing", { defaultValue: "Activate billing" }),
        onPress: startBillingCheckout,
      };
    }

    return {
      label: t("dealer_account.apply", { defaultValue: "Apply for dealer access" }),
      onPress: () =>
        router.push({
          pathname: "/advertise/request",
          params: { tier: selectedTier },
        }),
    };
  }, [access?.nextStep, selectedTier, startBillingCheckout, startingBilling, t]);

  const tone = statusTone(access);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 4 }}>
          {t("dealer_account.title", { defaultValue: "Dealer account" })}
        </Text>

        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>
          {t("dealer_account.subtitle", {
            defaultValue: "Dealers apply here first. Once the account is approved and billing is active, campaign management unlocks automatically.",
          })}
        </Text>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("dealer_account.status_title", { defaultValue: "Current status" })}
          </Text>

          <View style={{ alignSelf: "flex-start", marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: tone.bg, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: tone.text, fontWeight: "900" }}>
              {access?.canAdvertise
                ? t("dealer_account.status_active", { defaultValue: "Active dealer account" })
                : access?.nextStep === "review"
                  ? t("dealer_account.status_review", { defaultValue: "Application under review" })
                  : access?.nextStep === "pay"
                    ? t("dealer_account.status_payment", { defaultValue: "Approved, waiting on billing" })
                    : access?.nextStep === "sign-in"
                      ? t("dealer_account.status_sign_in", { defaultValue: "Sign in required" })
                      : t("dealer_account.status_not_started", { defaultValue: "Not applied yet" })}
            </Text>
          </View>

          <Text style={{ color: COLORS.muted, marginTop: 12, lineHeight: 20 }}>
            {access?.account
              ? t("dealer_account.status_body_existing", {
                  defaultValue: "Business: {{business}}. Tier: {{tier}}. Account status: {{status}}.",
                  business: access.account.business_name,
                  tier: access.tier?.name ?? access.account.tier_id,
                  status: access.account.status,
                })
              : t("dealer_account.status_body_new", {
                  defaultValue: "No dealer profile exists yet. Choose a tier and submit your business details to start review.",
                })}
          </Text>

          <Pressable
            onPress={nextAction.onPress}
            disabled={startingBilling}
            style={{ marginTop: 14, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 13, alignItems: "center", opacity: startingBilling ? 0.7 : 1 }}
          >
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{nextAction.label}</Text>
          </Pressable>

          {access?.nextStep === "manage" ? (
            <Pressable onPress={() => router.push("/advertise")} style={{ marginTop: 10, alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                {t("dealer_account.view_advertise", { defaultValue: "View placement overview" })}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("dealer_account.how_title", { defaultValue: "How dealers apply" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21 }}>
            {t("dealer_account.how_steps", {
              defaultValue:
                "1. Open the application form and pick Dealer Basic or Dealer Pro.\n2. Submit business name, contact email, preferred placement, and your campaign details.\n3. A moderator reviews the account request.\n4. After approval and billing activation, you can create campaigns in the manager.",
            })}
          </Text>
        </View>

        <View style={{ marginTop: 16, gap: 12 }}>
          <Pressable
            onPress={() => setSelectedTier("dealer_basic")}
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: selectedTier === "dealer_basic" ? "rgba(124,255,178,0.12)" : COLORS.card,
              borderWidth: 1,
              borderColor: selectedTier === "dealer_basic" ? "#7CFFB2" : COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("dealer_account.basic_title", { defaultValue: "Dealer Basic" })}</Text>
            <Text style={{ color: "#F5C451", fontWeight: "900", marginTop: 4 }}>£29 / month</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("dealer_account.basic_body", { defaultValue: "Discover placements only, up to 2 active campaigns, lighter rotation." })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedTier("dealer_pro")}
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: selectedTier === "dealer_pro" ? "rgba(124,255,178,0.12)" : COLORS.accent,
              borderWidth: 1,
              borderColor: selectedTier === "dealer_pro" ? "#7CFFB2" : COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("dealer_account.pro_title", { defaultValue: "Dealer Pro" })}</Text>
            <Text style={{ color: "#F5C451", fontWeight: "900", marginTop: 4 }}>£79 / month</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("dealer_account.pro_body", { defaultValue: "Discover and Following placements, up to 6 active campaigns, heavier rotation weight." })}
            </Text>
          </Pressable>

          <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>
            {selectedTier === "dealer_pro"
              ? t("dealer_account.selected_pro", { defaultValue: "Selected tier: Dealer Pro" })
              : t("dealer_account.selected_basic", { defaultValue: "Selected tier: Dealer Basic" })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}