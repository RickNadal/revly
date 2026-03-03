// app/advertise/request.tsx
import { router } from "expo-router";
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

export default function AdvertiseRequestScreen() {
  const { t } = useTranslation();

  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [placement, setPlacement] = useState<Placement>("discover");
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

    const { error } = await supabase.from("ad_requests").insert({
      user_id: session.user.id,
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
      t("advertise_request.sent_body", { defaultValue: "Thanks — we’ll review your request and get back to you." })
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
          borderColor: COLORS.border,
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
          {t("advertise_request.title", { defaultValue: "Request a campaign" })}
        </Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700", lineHeight: 20 }}>
          {t("advertise_request.subtitle", {
            defaultValue: "Tell us what you want to promote. We’ll set up the Sponsored post and confirm placement.",
          })}
        </Text>

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