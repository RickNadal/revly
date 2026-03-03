// app/_layout.tsx
import { router, Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { Alert, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MenuProvider } from "../components/navigation/MenuProvider";
import { TabBarVisibilityProvider } from "../components/navigation/TabBarVisibility";
import i18n, { initI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === "android") {
      SystemUI.setBackgroundColorAsync("#0B0B0F").catch(() => {});
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initI18n();
      } catch {}
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Ban enforcement: if session exists and profile is banned, force sign out
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ready) return;

      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;

        const userId = session.user.id;
        const { data: prof, error } = await supabase.from("profiles").select("is_banned").eq("id", userId).single();
        if (cancelled) return;

        if (!error && (prof as any)?.is_banned) {
          await supabase.auth.signOut();
          Alert.alert("Account banned", "This account has been banned.");
          router.replace("/sign-in");
        }
      } catch {
        // fail open
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0B0B0F" }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <MenuProvider>
          <TabBarVisibilityProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#0B0B0F" },
              }}
            >
              <Stack.Screen name="(tabs)" />

              <Stack.Screen name="sign-in" />
              <Stack.Screen name="sign-up" />

              <Stack.Screen name="new-post" />
              <Stack.Screen name="post" />
              <Stack.Screen name="rider" />
              <Stack.Screen name="followers" />
              <Stack.Screen name="following" />

              <Stack.Screen name="messages" />
              <Stack.Screen name="moderation" />
              <Stack.Screen name="advertise" />
              <Stack.Screen name="sell" />
              <Stack.Screen name="rent" />
              <Stack.Screen name="communities" />

              <Stack.Screen name="language" />

              <Stack.Screen name="admin-feedback" />

              <Stack.Screen
                name="viewer"
                options={{
                  presentation: "modal",
                  animation: "none",
                  contentStyle: { backgroundColor: "#000" },
                }}
              />
            </Stack>
          </TabBarVisibilityProvider>
        </MenuProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}