// app/_layout.tsx
import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "android") {
      SystemUI.setBackgroundColorAsync("#0B0B0F").catch(() => {});
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0B0B0F" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="new-post" />
        <Stack.Screen name="search" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="post" />
        <Stack.Screen name="rider" />
        <Stack.Screen name="followers" />
        <Stack.Screen name="following" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />

        {/* NEW: Admin feedback */}
        <Stack.Screen name="admin-feedback" />

        {/* Viewer */}
        <Stack.Screen
          name="viewer"
          options={{
            presentation: "modal",
            animation: "none",
            contentStyle: { backgroundColor: "#000" },
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
