import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

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
};

type Placement = "discover" | "following";
type RequestedTier = "dealer_basic" | "dealer_pro";

export default function AdvertiseRequestScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tier?: string | string[] }>();

  const initialTier: RequestedTier = (() => {
    const raw = Array.isArray(params.tier) ? params.tier[0] : params.tier;
    return raw === "dealer_pro" ? "dealer_pro" : "dealer_basic";
  })();

  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [placement, setPlacement] = useState<Placement>("discover");
  const [requestedTier, setRequestedTier] = useState<RequestedTier>(initialTier);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = useMemo(() => {
    const b = businessName.trim();
    const e = contactEmail.trim();
    return b.length >= 2 && e.includes("@") && e.includes(".");
  }, [businessName, contactEmail]);

  const submit = async () => {
    const b = businessName.trim();
    const e = contactEmail.trim();
    const m = message.trim() || null;

    if (!valid) {
      return Alert.alert(
        t("advertise_request.missing_info_title", { defaultValue: "Missing info" }),
        t("advertise_request.missing_info_body", { defaultValue: "Add business name and a valid email." })
      );
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const { error: accountError } = await supabase.from("business_accounts").upsert(
      {
        user_id: session.user.id,
        business_name: b,
        contact_email: e,
        tier_id: requestedTier,
        status: "pending_review",
      } as any,
      { onConflict: "user_id" }
    );

    if (accountError) {
      setLoading(false);
      return Alert.alert(t("advertise_request.failed_title", { defaultValue: "Request failed" }), accountError.message);
    }

    const { error: subscriptionError } = await supabase.from("business_subscriptions").upsert(
      {
        user_id: session.user.id,
        tier_id: requestedTier,
        status: "pending_payment",
      } as any,
      { onConflict: "user_id" }
    );

    if (subscriptionError) {
      setLoading(false);
      return Alert.alert(t("advertise_request.failed_title", { defaultValue: "Request failed" }), subscriptionError.message);
    }

    const { error } = await supabase.from("ad_requests").insert({
      user_id: session.user.id,
      requested_tier_id: requestedTier,
      business_name: b,
      contact_email: e,
      placement,
      message: m,
      status: "new",
    } as any);

    setLoading(false);

    if (error) {
      return Alert.alert(t("advertise_request.failed_title", { defaultValue: "Request failed" }), error.message);
    }

    Alert.alert(
      t("advertise_request.sent_title", { defaultValue: "Sent" }),
      t("advertise_request.sent_body", { defaultValue: "Thanks — we saved your dealer access request. Next step is review and payment activation." })
    );
    router.back();
  };

  const Chip = ({ label, value }: { label: string; value: Placement }) => {
    const active = placement === value;
    return (
      <Pressable
        onPress={() => setPlacement(value)}
        disabled={loading}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: active ? "#7CFFB2" : COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  const TierChip = ({ label, value }: { label: string; value: RequestedTier }) => {
    const active = requestedTier === value;
    return (
      <Pressable
        onPress={() => setRequestedTier(value)}
        disabled={loading}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: active ? "#7CFFB2" : COLORS.border,
          minWidth: 160,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("advertise_request.title", { defaultValue: "Apply for business access" })}
        </Text>

        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700", lineHeight: 20 }}>
          {t("advertise_request.subtitle", {
            defaultValue: "Pick a dealer tier, tell us what you want to promote, and we’ll review your business access before campaigns can go live.",
          })}
        </Text>

        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>
          {t("advertise_request.tier_title", { defaultValue: "Dealer tier" })}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <TierChip label={t("advertise_request.tier_basic", { defaultValue: "Basic • Discover only" })} value="dealer_basic" />
          <TierChip label={t("advertise_request.tier_pro", { defaultValue: "Pro • Discover + Following" })} value="dealer_pro" />
        </View>

        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={t("advertise_request.business_placeholder", { defaultValue: "Business / brand name" })}
          placeholderTextColor={COLORS.muted}
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            borderRadius: 14,
            padding: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            fontWeight: "800",
          }}
        />

        <TextInput
          value={contactEmail}
          onChangeText={setContactEmail}
          placeholder={t("advertise_request.email_placeholder", { defaultValue: "Contact email" })}
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            borderRadius: 14,
            padding: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            fontWeight: "800",
          }}
        />

        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>
          {t("advertise_request.placement_title", { defaultValue: "Preferred placement" })}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Chip label={t("feed.discover", { defaultValue: "Discover" })} value="discover" />
          <Chip label={t("feed.following", { defaultValue: "Following" })} value="following" />
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={t("advertise_request.message_placeholder", {
            defaultValue: "What are you promoting? Include city/region, dates, CTA, budget (optional)…",
          })}
          placeholderTextColor={COLORS.muted}
          multiline
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            borderRadius: 14,
            padding: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            minHeight: 120,
          }}
        />

        <Pressable
          onPress={submit}
          disabled={loading || !valid}
          style={{
            backgroundColor: loading || !valid ? "#777" : COLORS.button,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading
              ? t("advertise_request.sending", { defaultValue: "Sending…" })
              : t("advertise_request.submit", { defaultValue: "Submit request" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={{
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
