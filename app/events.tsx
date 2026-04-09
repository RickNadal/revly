import { router } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
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
};

export default function EventsScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16 }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
          {t("events.title", { defaultValue: "Events" })}
        </Text>

        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>
          {t("events.subtitle", {
            defaultValue: "Community events by riders. Create rideouts, meetings and more.",
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
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {t("events.what_you_can_do_title", { defaultValue: "What you can do here" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {t("events.what_you_can_do_bullets", {
              defaultValue:
                "• Browse public and invited events\n• Create open or invite-only events\n• Add multiple photos and event details",
            })}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/events/create")}
          style={{
            marginTop: 16,
            backgroundColor: COLORS.button,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("events.create_event", { defaultValue: "Create event" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/events/browse")}
          style={{
            marginTop: 10,
            backgroundColor: COLORS.chip,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {t("events.browse_events", { defaultValue: "Browse events" })}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={{ marginTop: 12, alignItems: "center", padding: 10 }}>
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
            {t("common.back", { defaultValue: "Back" })}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
