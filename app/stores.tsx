import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

// ── Currency detection ──────────────────────────────────────────────────────
const EU_REGIONS = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR",
  "HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

function detectCurrency(): "EUR" | "USD" {
  try {
    const region = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1]?.toUpperCase() ?? "";
    return EU_REGIONS.has(region) ? "EUR" : "USD";
  } catch {
    return "EUR";
  }
}

const CURRENCY = detectCurrency();

// TODO: create one Stripe price per currency in your Stripe dashboard and paste the IDs below.
const PRICE_IDS: Record<"EUR" | "USD", string> = {
  EUR: "price_1THOVKJD8YRbDapt6TdhZt80", // replace with EUR price ID
  USD: "price_1THOVKJD8YRbDapt6TdhZt80", // replace with USD price ID
};
const PRICE_LABELS: Record<"EUR" | "USD", string> = {
  EUR: "€29 / month",
  USD: "$29 / month",
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
  accent: "#7CFFB2",
  accentBg: "rgba(124,255,178,0.12)",
};

const STORE_PLAN_PRICE = PRICE_LABELS[CURRENCY];

export default function StoresScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [storeType, setStoreType] = useState("");

  const storeCapabilities = useMemo(
    () => [
      t("stores.capability_1", { defaultValue: "Publiceer store-producten met directe website links." }),
      t("stores.capability_2", { defaultValue: "Upload duidelijke afbeeldingskaarten voor gear, helmen en onderdelen." }),
      t("stores.capability_3", { defaultValue: "Verschijn in Shop zodat rijders je producten kunnen ontdekken." }),
      t("stores.capability_4", { defaultValue: "Dien producten in voor moderatie voordat ze live gaan." }),
    ],
    [t]
  );

  const storePlanBenefits = useMemo(
    () => [
      t("stores.benefit_1", { defaultValue: "Zichtbaarheid in de Shop-sectie van de app." }),
      t("stores.benefit_2", { defaultValue: "Productkaarten met afbeelding + link-CTA." }),
      t("stores.benefit_3", { defaultValue: "Account- en productreview voor kwaliteitscontrole." }),
      t("stores.benefit_4", { defaultValue: "Vindbaar via de Shop-tab op de homefeed." }),
    ],
    [t]
  );

  const accountValid = useMemo(() => businessName.trim().length >= 2 && contactEmail.trim().includes("@"), [businessName, contactEmail]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id ?? null;
    setUserId(me);

    if (!me) {
      setLoading(false);
      return;
    }

    const { data: account } = await supabase
      .from("business_accounts")
      .select("business_name, contact_email, dealer_type, status")
      .eq("user_id", me)
      .maybeSingle();

    setBusinessName(String((account as any)?.business_name ?? ""));
    setContactEmail(String((account as any)?.contact_email ?? ""));
    setStoreType(String((account as any)?.dealer_type ?? "").replace(/^store\|/i, ""));
    setAccountStatus(String((account as any)?.status ?? ""));

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Opens Stripe checkout for the given price, returns true on success
  const openCheckout = useCallback(async (priceId: string): Promise<boolean> => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      Alert.alert("Inloggen vereist", "Je sessie is verlopen. Log opnieuw in.");
      router.replace("/sign-in");
      return false;
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!supabaseUrl || !anonKey) {
      Alert.alert("Afrekenen mislukt", "Supabase-configuratie ontbreekt in deze build.");
      return false;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create-store-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ priceId }),
    });

    const raw = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(raw); } catch { payload = raw; }

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && payload.error ? String(payload.error) : null) ??
        (typeof payload === "string" && payload ? payload : null) ??
        `HTTP ${response.status}`;
      Alert.alert("Afrekenen mislukt", message);
      return false;
    }

    const url = String((payload as any)?.url ?? "").trim();
    if (!url) { Alert.alert("Afrekenen mislukt", "Geen checkout-URL ontvangen."); return false; }

    const supported = await Linking.canOpenURL(url);
    if (!supported) { Alert.alert("Afrekenen mislukt", "Je apparaat kan de checkout-link niet openen."); return false; }

    await Linking.openURL(url);
    return true;
  }, []);

  // Open Stripe customer billing portal for active subscribers
  const openBillingPortal = useCallback(async () => {
    if (!userId) { router.replace("/sign-in"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-store-billing-portal", {
        method: "POST",
      });
      if (error) {
        Alert.alert("Could not open billing portal", error.message ?? "Unknown error");
        return;
      }
      const url = String((data as any)?.url ?? "").trim();
      if (!url) { Alert.alert("Billing portal error", "No portal URL received."); return; }
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert("Billing portal error", err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }, [userId]);

  // Single combined submit + pay action
  const submitAndPay = useCallback(async () => {
    if (!userId) { router.replace("/sign-in"); return; }

    // Already active — open billing portal to manage subscription
    if (accountStatus === "active" || accountStatus === "approved") {
      await openBillingPortal();
      return;
    }

    // Already submitted, payment dropped off — retry checkout only
    if (accountStatus === "pending_review" || accountStatus === "pending_payment") {
      setSubmitting(true);
      await openCheckout(PRICE_IDS[CURRENCY]);
      setSubmitting(false);
      return;
    }

    // New submission — validate, save, then pay
    if (!accountValid) {
      Alert.alert(
        t("stores.invalid_account_title", { defaultValue: "Accountinfo ontbreekt" }),
        t("stores.invalid_account_body", { defaultValue: "Vul je store-naam en een geldig contact e-mailadres in." })
      );
      return;
    }

    setSubmitting(true);

    const { error: upsertErr } = await supabase.from("business_accounts").upsert(
      {
        user_id: userId,
        business_name: businessName.trim(),
        contact_email: contactEmail.trim(),
        dealer_type: `store|${storeType.trim() || "general"}`,
        tier_id: "dealer_basic",
        status: "pending_payment",
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id" }
    );

    if (upsertErr) {
      setSubmitting(false);
      Alert.alert(t("stores.account_failed", { defaultValue: "Store-account opslaan mislukt" }), upsertErr.message);
      return;
    }

    await supabase.from("ad_requests").insert({
      user_id: userId,
      requested_tier_id: "dealer_basic",
      business_name: businessName.trim(),
      contact_email: contactEmail.trim(),
      placement: "discover",
      message: "Store account request",
      status: "new",
    } as any);

    setAccountStatus("pending_payment");
    await openCheckout(PRICE_IDS[CURRENCY]);
    setSubmitting(false);
  }, [userId, accountStatus, accountValid, businessName, contactEmail, storeType, openBillingPortal, openCheckout, t]);

  if (!userId && !loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22 }}>
            {t("stores.sign_in_title", { defaultValue: "Stores" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 8, textAlign: "center" }}>
            {t("stores.sign_in_body", { defaultValue: "Log in om een store-account aan te maken en producten te uploaden." })}
          </Text>
          <Pressable onPress={() => router.replace("/sign-in")} style={{ marginTop: 14, backgroundColor: COLORS.button, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 }}>
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
              {t("stores.sign_in", { defaultValue: "Inloggen" })}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>

        <View
          style={{
            marginTop: 2,
            padding: 18,
            borderRadius: 22,
            backgroundColor: COLORS.accentBg,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.accent, fontWeight: "900", letterSpacing: 0.6 }}>STORE-ACCOUNT</Text>
          <Text style={{ color: COLORS.text, fontSize: 30, fontWeight: "900", marginTop: 8 }}>
            {t("stores.title", { defaultValue: "Stores" })}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 10, lineHeight: 21, fontWeight: "700" }}>
            {t("stores.subtitle", { defaultValue: "Een speciale plek voor motorzaken om producten met links te publiceren." })}
          </Text>
        </View>

        <View style={{ padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("stores.what_you_can_do", { defaultValue: "Wat je hier kunt doen" })}
          </Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            {storeCapabilities.map((item) => (
              <View key={item} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "900" }}>✓</Text>
                </View>
                <Text style={{ flex: 1, color: COLORS.text, lineHeight: 21 }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("stores.plan_card_title", { defaultValue: "Store-plan" })}
          </Text>
          <Text style={{ color: COLORS.accent, fontWeight: "900", marginTop: 4 }}>{STORE_PLAN_PRICE}</Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            {storePlanBenefits.map((item) => (
              <View key={item} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "900" }}>✓</Text>
                </View>
                <Text style={{ flex: 1, color: COLORS.text, lineHeight: 21 }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14, gap: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("stores.account_section", { defaultValue: "Store-account aanmaken" })}
          </Text>
          <TextInput value={businessName} onChangeText={setBusinessName} placeholder={t("stores.business_name", { defaultValue: "Store-naam" })} placeholderTextColor={COLORS.muted} style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }} />
          <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder={t("stores.contact_email", { defaultValue: "Contact e-mail" })} placeholderTextColor={COLORS.muted} autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }} />
          <TextInput value={storeType} onChangeText={setStoreType} placeholder={t("stores.store_type", { defaultValue: "Type store (gear, helmen, parts...)" })} placeholderTextColor={COLORS.muted} style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }} />

          <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: COLORS.chip }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              {accountStatus
                ? t("stores.account_status", { defaultValue: "Status: {{status}}", status: accountStatus })
                : t("stores.not_submitted", { defaultValue: "Status: nog niet verzonden" })}
            </Text>
          </View>

          <Pressable disabled={submitting} onPress={submitAndPay} style={{ marginTop: 2, backgroundColor: submitting ? "#777" : COLORS.button, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: COLORS.buttonText, fontWeight: "900", fontSize: 16 }}>
              {submitting
                ? t("stores.submitting", { defaultValue: "Verwerken..." })
                : accountStatus === "active" || accountStatus === "approved"
                ? t("stores.manage_billing", { defaultValue: "Abonnement beheren →" })
                : accountStatus === "pending_review" || accountStatus === "pending_payment"
                ? `${t("stores.complete_payment", { defaultValue: "Betaling afronden" })}  ·  ${PRICE_LABELS[CURRENCY]}`
                : `${t("stores.submit_and_pay", { defaultValue: "Verzenden & betalen" })}  ·  ${PRICE_LABELS[CURRENCY]}`}
            </Text>
          </Pressable>

          <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
            {accountStatus === "active" || accountStatus === "approved"
              ? t("stores.billing_active", { defaultValue: "Je account is actief. Tik hierboven om je abonnement te beheren." })
              : accountStatus === "pending_review" || accountStatus === "pending_payment"
              ? t("stores.billing_pending", { defaultValue: "Account opgeslagen. Rond je betaling af om setup te voltooien." })
              : t("stores.billing_hint", { defaultValue: "Je accountgegevens zijn opgeslagen en verstuurd voor review. Betaling bevestigt je abonnement." })}
          </Text>
        </View>

        {(accountStatus === "active" || accountStatus === "approved") && (
          <Pressable
            onPress={() => router.push("/store-dashboard")}
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: COLORS.accentBg,
              borderWidth: 1,
              borderColor: COLORS.accent,
              alignItems: "center",
              gap: 4,
            }}
          >
            <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 16 }}>
              {t("stores.go_to_dashboard", { defaultValue: "Ga naar store-dashboard →" })}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {t("stores.dashboard_hint", { defaultValue: "Upload en beheer je productlistings" })}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
