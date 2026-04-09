import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  premium: "#FFD36A",
  premiumBg: "rgba(245,196,81,0.10)",
  premiumBorder: "rgba(245,196,81,0.35)",
  green: "#66E38A",
  greenBg: "rgba(102,227,138,0.08)",
  greenBorder: "rgba(102,227,138,0.25)",
};

const HOW_IT_WORKS = [
  {
    step: "1",
    icon: "radio-outline" as const,
    title: "Go Visible",
    body: "Tap \"Go Live\" to share your approximate location — blurred to a ~1 km zone. Your exact coordinates are never stored.",
  },
  {
    step: "2",
    icon: "map-outline" as const,
    title: "See Riders Nearby",
    body: "A live map shows other opted-in riders around you as avatar pins. Only riders who chose to be visible appear.",
  },
  {
    step: "3",
    icon: "paper-plane-outline" as const,
    title: "Send a Ride Request",
    body: "Tap a rider\u2019s pin to send a \u201cRide Together?\u201d request. They decide whether to accept or decline — you stay anonymous until they say yes.",
  },
  {
    step: "4",
    icon: "checkmark-circle-outline" as const,
    title: "Match & Connect",
    body: "Once both sides accept, profiles are unlocked so you can plan a ride, find a meet-up spot, or just say hi.",
  },
];

const FEATURE_PILLS = [
  { icon: "shield-checkmark-outline" as const, label: "Privacy-first · ~1 km blur" },
  { icon: "toggle-outline" as const, label: "Fully opt-in · you control visibility" },
  { icon: "sparkles-outline" as const, label: "Premium exclusive feature" },
];

export default function RidersNearMeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Riders Near Me</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🗺️</Text>
          <View style={styles.comingSoonPill}>
            <Ionicons name="sparkles-outline" size={13} color={COLORS.premium} />
            <Text style={styles.comingSoonText}>Coming Soon · Premium</Text>
          </View>
          <Text style={styles.heroTitle}>Meet Riders Around You</Text>
          <Text style={styles.heroSub}>
            Riders Near Me lets you discover fellow motorcycle riders in your area in real time — safely, privately, and entirely on your terms.
          </Text>
        </View>

        {/* Privacy pills */}
        <View style={styles.pillRow}>
          {FEATURE_PILLS.map((p) => (
            <View key={p.label} style={styles.pill}>
              <Ionicons name={p.icon} size={13} color={COLORS.green} />
              <Text style={styles.pillText}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <Text style={styles.sectionLabel}>How it works</Text>

        {HOW_IT_WORKS.map((item) => (
          <View key={item.step} style={styles.stepCard}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{item.step}</Text>
            </View>
            <View style={styles.stepIconWrap}>
              <Ionicons name={item.icon} size={22} color={COLORS.premium} />
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{item.title}</Text>
              <Text style={styles.stepDesc}>{item.body}</Text>
            </View>
          </View>
        ))}

        {/* Privacy note */}
        <View style={styles.privacyCard}>
          <Ionicons name="lock-closed-outline" size={18} color={COLORS.green} />
          <Text style={styles.privacyText}>
            <Text style={{ color: COLORS.green, fontWeight: "700" }}>Privacy guarantee · </Text>
            Location sharing is opt-in only. You can go invisible instantly. Approximate position only — no street-level accuracy is ever shared or stored.
          </Text>
        </View>

        {/* CTA locked */}
        <View style={styles.ctaCard}>
          <Ionicons name="time-outline" size={28} color={COLORS.premium} style={{ marginBottom: 10 }} />
          <Text style={styles.ctaTitle}>Available with Premium</Text>
          <Text style={styles.ctaSub}>
            Riders Near Me is in final development and will launch exclusively for Premium members. Upgrade now and be first in line when it goes live.
          </Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.push("/premium")}>
            <Ionicons name="sparkles-outline" size={16} color="#0B0B0F" />
            <Text style={styles.ctaBtnText}>Get Premium</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: COLORS.text, fontWeight: "900", fontSize: 18 },
  scroll: { paddingHorizontal: 18, paddingBottom: 40 },

  // Hero
  hero: { alignItems: "center", paddingTop: 24, paddingBottom: 20 },
  heroEmoji: { fontSize: 52, lineHeight: 60, marginBottom: 14 },
  comingSoonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.premiumBg,
    borderWidth: 1,
    borderColor: COLORS.premiumBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  comingSoonText: { color: COLORS.premium, fontWeight: "700", fontSize: 12 },
  heroTitle: { color: COLORS.text, fontWeight: "900", fontSize: 26, textAlign: "center", marginBottom: 10 },
  heroSub: { color: COLORS.muted, fontSize: 14, textAlign: "center", lineHeight: 21, maxWidth: 310 },

  // Pills
  pillRow: { gap: 8, marginBottom: 28 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: { color: COLORS.text, fontSize: 13, fontWeight: "600", flexShrink: 1 },

  // Section label
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 12,
  },

  // Steps
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.premiumBg,
    borderWidth: 1,
    borderColor: COLORS.premiumBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepBadgeText: { color: COLORS.premium, fontSize: 11, fontWeight: "900" },
  stepIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.premiumBg,
    borderWidth: 1,
    borderColor: COLORS.premiumBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: { flex: 1 },
  stepTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15, marginBottom: 4 },
  stepDesc: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },

  // Privacy note
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 20,
  },
  privacyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, flex: 1 },

  // CTA
  ctaCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.premiumBorder,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  ctaTitle: { color: COLORS.text, fontWeight: "900", fontSize: 20, marginBottom: 8 },
  ctaSub: { color: COLORS.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 20 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.premium,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  ctaBtnText: { color: "#0B0B0F", fontWeight: "900", fontSize: 15 },
});
