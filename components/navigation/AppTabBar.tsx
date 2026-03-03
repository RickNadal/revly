// components/navigation/AppTabBar.tsx
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarVisibility } from "./TabBarVisibility";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  active: "#FFFFFF",
  inactive: "rgba(255,255,255,0.55)",
};

function iconForRoute(name: string): keyof typeof Ionicons.glyphMap {
  if (name.endsWith("index")) return "home-outline";
  if (name.endsWith("search")) return "search-outline";
  if (name.endsWith("communities")) return "people-outline";
  if (name.endsWith("new-post")) return "add-circle-outline";
  if (name.endsWith("notifications")) return "notifications-outline";
  if (name.endsWith("profile")) return "person-outline";
  return "ellipse-outline";
}

export default function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { visible } = useTabBarVisibility();
  const insets = useSafeAreaInsets();
  const routes = useMemo(() => state.routes, [state.routes]);

  if (!visible) return null;

  // Sits above gesture/nav area
  const bottomPad = Math.max(insets.bottom, 10);

  const labelForRoute = (name: string) => {
    if (name.endsWith("index")) return t("tabs.home", { defaultValue: "Home" });
    if (name.endsWith("search")) return t("tabs.search", { defaultValue: "Search" });

    // Use a SHORT label so it never wraps in the tab bar.
    if (name.endsWith("communities")) return t("tabs.communities", { defaultValue: "Groups" });

    if (name.endsWith("new-post")) return t("tabs.post", { defaultValue: "Post" });
    if (name.endsWith("notifications")) return t("tabs.notifications", { defaultValue: "Alerts" });
    if (name.endsWith("profile")) return t("tabs.profile", { defaultValue: "Me" });

    return t("tabs.tab", { defaultValue: "Tab" });
  };

  return (
    <View
      style={{
        backgroundColor: COLORS.bg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        paddingTop: 10,
        paddingHorizontal: 12,
        paddingBottom: bottomPad,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 18,
          paddingVertical: 10,
          paddingHorizontal: 10,
        }}
      >
        {routes.map((route, index) => {
          const isFocused = state.index === index;

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={{
                flex: 1,
                minWidth: 0, // IMPORTANT: allows label to shrink instead of wrapping
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: isFocused ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              <Ionicons name={iconForRoute(route.name)} size={22} color={isFocused ? COLORS.active : COLORS.inactive} />

              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                allowFontScaling={false}
                style={{
                  fontSize: 11, // slightly smaller to prevent wrapping
                  fontWeight: "900",
                  color: isFocused ? COLORS.active : COLORS.inactive,
                }}
              >
                {labelForRoute(route.name)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}