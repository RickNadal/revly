import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useMenu } from "./navigation/MenuProvider";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type ProfileRole = "user" | "moderator" | "admin";

const { width: W } = Dimensions.get("window");
const PANEL_W = Math.min(320, Math.round(W * 0.82));

const COLORS = {
  bg: "#0B0B0F",
  panel: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  money: "#2A2311",
};

export default function SlideInMenu() {
  const { t } = useTranslation();
  const { isOpen, closeMenu } = useMenu();
  const insets = useSafeAreaInsets();

  const [myRole, setMyRole] = useState<ProfileRole>("user");

  const translateX = useRef(new Animated.Value(-PANEL_W)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -PANEL_W, duration: 160, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen, translateX, backdrop]);

  const loadRole = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        if (isMountedRef.current) setMyRole("user");
        return;
      }

      const uid = session.user.id;
      const { data, error } = await supabase.from("profiles").select("role").eq("id", uid).single();

      if (error) {
        if (isMountedRef.current) setMyRole("user");
        return;
      }

      if (isMountedRef.current) setMyRole(((data as any)?.role ?? "user") as ProfileRole);
    } catch {
      if (isMountedRef.current) setMyRole("user");
    }
  };

  useEffect(() => {
    if (isOpen) loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isModOrAdmin = myRole === "moderator" || myRole === "admin";
  const isAdmin = myRole === "admin";

  const menuItems = useMemo<
    { key: string; fallback: string; icon: IoniconName; onPress: () => void; section?: "money" | "staff" }[]
  >(
    () => {
      const base = [
        { key: "menu.home", fallback: "Home", icon: "home-outline" as const, onPress: () => router.replace("/") },
        { key: "menu.new_post", fallback: "New Post", icon: "add-circle-outline" as const, onPress: () => router.push("/new-post") },
        { key: "menu.search", fallback: "Search", icon: "search-outline" as const, onPress: () => router.push("/search") },
        { key: "menu.notifications", fallback: "Notifications", icon: "notifications-outline" as const, onPress: () => router.push("/notifications") },
        { key: "menu.messages", fallback: "Messages", icon: "chatbubble-ellipses-outline" as const, onPress: () => router.push("/messages") },
        { key: "menu.my_profile", fallback: "My Profile", icon: "person-outline" as const, onPress: () => router.push("/profile") },
        { key: "menu.language", fallback: "Language", icon: "language-outline" as const, onPress: () => router.push("/language") },

        { key: "menu.marketplace", fallback: "Marketplace", icon: "pricetag-outline" as const, onPress: () => router.push("/sell"), section: "money" as const },
        { key: "menu.advertise", fallback: "Advertise", icon: "megaphone-outline" as const, onPress: () => router.push("/advertise"), section: "money" as const },
      ];

      if (isModOrAdmin) {
        base.push({
          key: "menu.moderation",
          fallback: "Moderation",
          icon: "shield-checkmark-outline" as const,
          onPress: () => router.push("/moderation"),
          section: "staff" as const,
        });
      }

      if (isAdmin) {
        base.push({
          key: "menu.admin_panel",
          fallback: "Admin Panel",
          icon: "settings-outline" as const,
          onPress: () => router.push("/admin-feedback"),
          section: "staff" as const,
        });
      }

      return base;
    },
    [isModOrAdmin, isAdmin]
  );

  const topPad = insets.top + 14;
  const bottomPad = Math.max(insets.bottom, 12);

  const mainItems = menuItems.filter((x) => !x.section);
  const moneyItems = menuItems.filter((x) => x.section === "money");
  const staffItems = menuItems.filter((x) => x.section === "staff");

  return (
    <View pointerEvents={isOpen ? "auto" : "none"} style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }), backgroundColor: "#000" },
        ]}
      />

      <Pressable onPress={closeMenu} style={StyleSheet.absoluteFill} />

      <Animated.View
        style={[
          styles.panel,
          { width: PANEL_W, paddingTop: topPad, paddingBottom: bottomPad, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Image source={require("../assets/icon.png")} style={{ width: 88, height: 88 }} resizeMode="contain" />
            <Text style={styles.subtitle}>{t("common.for_motorcycle_riders", { defaultValue: "For motorcycle riders" })}</Text>
          </View>

          <Pressable onPress={closeMenu} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </Pressable>
        </View>

        <ScrollView style={{ marginTop: 14, flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>{t("menu.main", { defaultValue: "Main" })}</Text>

          {mainItems.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                closeMenu();
                it.onPress();
              }}
              style={styles.row}
            >
              <View style={styles.iconBox}>
                <Ionicons name={it.icon} size={18} color={COLORS.text} />
              </View>
              <Text style={styles.rowText}>{t(it.key, { defaultValue: it.fallback })}</Text>
            </Pressable>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 10 }]}>{t("menu.earn", { defaultValue: "Earn" })}</Text>

          {moneyItems.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                closeMenu();
                it.onPress();
              }}
              style={[styles.row, { backgroundColor: COLORS.money }]}
            >
              <View style={styles.iconBox}>
                <Ionicons name={it.icon} size={18} color={COLORS.text} />
              </View>
              <Text style={styles.rowText}>{t(it.key, { defaultValue: it.fallback })}</Text>
            </Pressable>
          ))}

          <View style={[styles.row, { backgroundColor: COLORS.money, opacity: 0.45 }]}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
              <Ionicons name="key-outline" size={18} color={"rgba(255,255,255,0.55)"} />
            </View>
            <Text style={[styles.rowText, { color: "rgba(255,255,255,0.65)" }]}>
              {t("menu.rent_coming_soon", { defaultValue: "Rent bikes (coming soon)" })}
            </Text>
          </View>

          {staffItems.length ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 10 }]}>{t("menu.staff", { defaultValue: "Staff" })}</Text>

              {staffItems.map((it) => (
                <Pressable
                  key={it.key}
                  onPress={() => {
                    closeMenu();
                    it.onPress();
                  }}
                  style={styles.row}
                >
                  <View style={styles.iconBox}>
                    <Ionicons name={it.icon} size={18} color={COLORS.text} />
                  </View>
                  <Text style={styles.rowText}>{t(it.key, { defaultValue: it.fallback })}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </ScrollView>

        <View>
          <Pressable
            onPress={async () => {
              closeMenu();
              await supabase.auth.signOut();
              router.replace("/sign-in");
            }}
            style={[styles.row, { marginBottom: 8, backgroundColor: "#2A1114" }]}
          >
            <View style={styles.iconBox}>
              <Ionicons name="log-out-outline" size={18} color={COLORS.text} />
            </View>
            <Text style={styles.rowText}>{t("menu.log_out", { defaultValue: "Log out" })}</Text>
          </Pressable>

          <Text style={styles.footer}>v1.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 9999, elevation: 9999 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.panel,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  subtitle: { color: COLORS.muted, fontWeight: "800", marginTop: 6 },
  sectionLabel: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginBottom: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { color: COLORS.text, fontWeight: "900", fontSize: 15 },
  footer: { color: "rgba(255,255,255,0.45)", fontWeight: "800", fontSize: 12, marginTop: 6, textAlign: "center" },
});