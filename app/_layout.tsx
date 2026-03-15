import * as Linking from "expo-linking";
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

function getTokensFromUrl(url: string) {
  if (!url) {
    return null;
  }

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  let rawParams = "";

  if (hashIndex >= 0) {
    rawParams = url.slice(hashIndex + 1);
  } else if (queryIndex >= 0) {
    rawParams = url.slice(queryIndex + 1);
  } else {
    return null;
  }

  const params = new URLSearchParams(rawParams);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const type = params.get("type");

  if (!access_token || !refresh_token) {
    return null;
  }

  return {
    access_token,
    refresh_token,
    type,
  };
}

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

      if (alive) {
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    let mounted = true;

    const handleUrl = async (url: string) => {
      try {
        const tokens = getTokensFromUrl(url);

        if (tokens?.access_token && tokens?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });

          if (error) {
            Alert.alert("Recovery link error", error.message);
            return;
          }

          if (!mounted) return;

          if (tokens.type === "recovery") {
            router.replace("/reset-password");
            return;
          }
        }

        if (url.includes("reset-password")) {
          router.replace("/reset-password");
        }
      } catch (error: any) {
        Alert.alert("Link error", error?.message ?? "Could not open recovery link.");
      }
    };

    (async () => {
      const initialUrl = await Linking.getInitialURL();

      if (initialUrl) {
        await handleUrl(initialUrl);
      }
    })();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!ready) return;

      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (!session) return;

        const userId = session.user.id;

        const { data: prof, error } = await supabase
          .from("profiles")
          .select("is_banned")
          .eq("id", userId)
          .single();

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
              <Stack.Screen name="reset-password" />

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