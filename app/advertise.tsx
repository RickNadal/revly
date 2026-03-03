// app/advertise.tsx
import { router } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

        {/* House sponsor */}
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {t("advertise.house.title", { defaultValue: "House Sponsor" })}
            </Text>

            <View
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: COLORS.accent,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                {t("advertise.house.badge", { defaultValue: "Funding the project" })}
              </Text>
            </View>
          </View>

          <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 10 }}>
            {t("advertise.house.brand", { defaultValue: "Decazi.com" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {t("advertise.house.body", {
              defaultValue:
                "Oranga is funded by Decazi.com. House Sponsor campaigns support development and help keep the product moving fast.",
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
              {t("advertise.house.how_title", { defaultValue: "How it appears in the feed" })}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("advertise.house.how_bullets", {
                defaultValue:
                  "• Labeled “House Sponsor”\n• Premium native post layout (looks like a real post)\n• Appears roughly every ~10 posts in Discover\n• Less frequent in Following\n• Users can hide a campaign locally",
              })}
            </Text>
          </View>
        </View>

        {/* Sponsor packages */}
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
                "Brands, shops, events, and local businesses can run Sponsored campaigns that still respect the feed experience.",
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
              {t("advertise.placements.requirements_title", { defaultValue: "Requirements" })}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("advertise.placements.requirements_bullets", {
                defaultValue:
                  "• Clear sponsor name + label (“Sponsored”)\n• Short body copy + CTA\n• Optional image\n• No misleading claims, no spam, no adult content",
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
              {t("advertise.placements.packages_title", { defaultValue: "Example packages" })}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {t("advertise.placements.packages_bullets", {
                defaultValue:
                  "• Local sponsor (city/region)\n• Event promotion (date window)\n• Shop promotion (weekly rotation)\n• Premium native post + basic reporting (impressions/clicks)",
              })}
            </Text>
          </View>
        </View>

        {/* ACTION */}
        <Pressable
          onPress={() => router.push("/advertise/request")}
          style={{
            marginTop: 16,
            backgroundColor: COLORS.button,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("advertise.request_cta", { defaultValue: "Request a campaign" })}
          </Text>
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