import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getBusinessAccessSummary, type BusinessAccessSummary } from "../lib/ads/businessAccess";

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
};

export default function AdvertiseScreen() {
  const { t } = useTranslation();
  const [access, setAccess] = useState<BusinessAccessSummary | null>(null);

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

  const ctaLabel = useMemo(() => {
    if (access?.nextStep === "sign-in") return t("advertise.request_cta", { defaultValue: "Sign in to continue" });
    if (access?.nextStep === "manage") return t("advertise.request_cta", { defaultValue: "Open campaign manager" });
    if (access?.nextStep === "review") return t("advertise.request_cta", { defaultValue: "View business access status" });
    if (access?.nextStep === "pay") return t("advertise.request_cta", { defaultValue: "Complete subscription setup" });
    return t("advertise.request_cta", { defaultValue: "Apply for business access" });
  }, [access?.nextStep, t]);

  const openNextRoute = useCallback(() => {
    if (access?.nextStep === "sign-in") {
      router.replace("/sign-in");
      return;
    }

    if (access?.nextStep === "manage") {
      router.push("/advertise/manage");
      return;
    }

    router.push("/advertise/request");
  }, [access?.nextStep]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
          {t("advertise.title", { defaultValue: "Advertise" })}
        </Text>

        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>
          {t("advertise.subtitle", {
            defaultValue:
              "Sponsored posts on Oranga are designed to feel native: clearly labeled, not spammy, and paced to protect the feed experience.",
          })}
        </Text>

        <View
          style={{
            marginTop: 14,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("advertise.account.title", { defaultValue: "Business access" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {access?.canAdvertise
              ? t("advertise.account.active", {
                  defaultValue: "Your business account is active on the {{tier}} tier. Active placements: {{count}} / {{max}}.",
                  tier: access.tier?.name ?? "tier",
                  count: access.activeCampaignCount,
                  max: access.tier?.max_active_campaigns ?? 0,
                })
              : access?.nextStep === "review"
                ? t("advertise.account.review", {
                    defaultValue: "Your business profile is pending review. Once approved, you can complete payment and start campaigns.",
                  })
                : access?.nextStep === "pay"
                  ? t("advertise.account.pay", {
                      defaultValue: "Your business profile is approved, but billing is not active yet. Complete payment to unlock placements.",
                    })
                  : t("advertise.account.none", {
                      defaultValue: "Dealer accounts are behind a paywall. Pick a tier, request access, and then activate billing before ads can run.",
                    })}
          </Text>
        </View>

        <View
          style={{
            marginTop: 14,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("advertise.placements.title", { defaultValue: "Sponsored placements" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {t("advertise.placements.subtitle", {
              defaultValue:
                "Motorcycle dealers and businesses can run native-looking sponsored placements that respect the feed experience.",
            })}
          </Text>

          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {t("advertise.placements.packages_title", { defaultValue: "Packages" })}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("advertise.placements.packages_bullets", {
                defaultValue:
                  "• Dealer Basic: Discover placements only, up to 2 active campaigns\n• Dealer Pro: Discover + Following, up to 6 active campaigns\n• Pro gets heavier rotation weight and broader reach\n• Add-ons later can sell extra placement volume without changing tier",
              })}
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {t("advertise.placements.requirements_title", { defaultValue: "Requirements" })}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("advertise.placements.requirements_bullets", {
                defaultValue:
                  "• Active paid business tier required\n• Moderator approval before campaigns go live\n• Clear sponsor name + CTA\n• No misleading claims, no spam, no adult content",
              })}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={openNextRoute}
          style={{
            marginTop: 16,
            backgroundColor: COLORS.button,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{ctaLabel}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={{ marginTop: 12, alignItems: "center", padding: 10 }}>
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
            {t("common.back", { defaultValue: "Back" })}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
