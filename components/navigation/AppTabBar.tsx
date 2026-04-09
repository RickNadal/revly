// components/navigation/AppTabBar.tsx
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotificationBadge } from "./NotificationBadge";
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
  const { unreadCount } = useNotificationBadge();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const routes = useMemo(() => state.routes, [state.routes]);
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [glowPulse]);

  if (!visible) return null;

  const visibleRoutes = routes.filter((route) => !route.name.endsWith("index"));
  const mapButtonIndex = Math.floor(visibleRoutes.length / 2);
  const mapFocused = pathname === "/riders-near-me";
  const lineScaleX = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1.1],
  });
  const lineOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.95],
  });

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
        {visibleRoutes.map((route, index) => {
          const isHomeProxy = route.name.endsWith("search");
          const isFeedPath = pathname === "/" || pathname === "/index" || pathname === "/(tabs)";
          const isFocused = isHomeProxy ? isFeedPath : state.routes[state.index]?.key === route.key;
          const iconName = isHomeProxy ? "home-outline" : iconForRoute(route.name);
          const label = isHomeProxy ? t("tabs.home", { defaultValue: "Home" }) : labelForRoute(route.name);
          const onPress = () => {
            if (isHomeProxy) {
              navigation.navigate("index");
              return;
            }
            navigation.navigate(route.name);
          };

          return (
            <React.Fragment key={route.key}>
              {index === mapButtonIndex ? (
                <Pressable
                  onPress={() => router.push("/riders-near-me")}
                  style={{
                    flex: 1.15,
                    minWidth: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: mapFocused ? "rgba(184,255,208,0.08)" : "transparent",
                  }}
                >
                  <View style={{ width: 34, height: 24, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 21, lineHeight: 22 }}>{"🗺️"}</Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                    style={{
                      fontSize: 12,
                      fontWeight: "900",
                      color: mapFocused ? "#B8FFD0" : COLORS.active,
                    }}
                  >
                    Map
                  </Text>

                  <Animated.View
                    pointerEvents="none"
                    style={{
                      marginTop: 1,
                      width: 34,
                      height: 3,
                      borderRadius: 999,
                      backgroundColor: "#66E38A",
                      opacity: lineOpacity,
                      transform: [{ scaleX: lineScaleX }],
                      shadowColor: "#66E38A",
                      shadowOpacity: 0.9,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    }}
                  />
                </Pressable>
              ) : null}

              <Pressable
                onPress={onPress}
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
                <Ionicons name={iconName} size={22} color={isFocused ? COLORS.active : COLORS.inactive} />

                {route.name.endsWith("notifications") && unreadCount > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: "#FF4D4D",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900", lineHeight: 12 }}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}

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
                  {label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}