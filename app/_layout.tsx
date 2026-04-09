import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { Alert, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MenuProvider } from "../components/navigation/MenuProvider";
import { NotificationBadgeProvider } from "../components/navigation/NotificationBadge";
import { TabBarVisibilityProvider } from "../components/navigation/TabBarVisibility";
import i18n, { initI18n } from "../lib/i18n";
import { registerPushTokenForUser } from "../lib/push";
import { disposeSupabaseAuthLifecycle, initSupabaseAuthLifecycle, signOutSafely, supabase } from "../lib/supabase";

const NEW_USER_WELCOME_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

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
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [dontShowWelcomeAgain, setDontShowWelcomeAgain] = useState(false);

  const maybeShowWelcome = async (userId?: string | null, createdAt?: string | null) => {
    const nextUserId = String(userId ?? "").trim();
    if (!nextUserId) {
      setWelcomeVisible(false);
      return;
    }

    try {
      const seenRaw = await AsyncStorage.getItem(`welcome_modal_seen:${nextUserId}`);
      const raw = await AsyncStorage.getItem(`welcome_modal_hidden:${nextUserId}`);
      if (raw === "1" || seenRaw === "1") {
        setWelcomeVisible(false);
        return;
      }

      const createdAtMs = Date.parse(String(createdAt ?? ""));
      const isCreatedAtValid = Number.isFinite(createdAtMs);
      const isNewUser = isCreatedAtValid && Date.now() - createdAtMs <= NEW_USER_WELCOME_WINDOW_MS;

      if (!isNewUser) {
        await AsyncStorage.setItem(`welcome_modal_seen:${nextUserId}`, "1");
        setWelcomeVisible(false);
        return;
      }
    } catch {}

    setDontShowWelcomeAgain(false);
    setWelcomeVisible(true);
  };

  const closeWelcome = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        await AsyncStorage.setItem(`welcome_modal_seen:${userId}`, "1");
      }
      if (dontShowWelcomeAgain && userId) {
        await AsyncStorage.setItem(`welcome_modal_hidden:${userId}`, "1");
      }
    } catch {}

    setWelcomeVisible(false);
  };

  useEffect(() => {
    if (Platform.OS === "android") {
      SystemUI.setBackgroundColorAsync("#0B0B0F").catch(() => {});
    }
  }, []);

  useEffect(() => {
    initSupabaseAuthLifecycle();

    return () => {
      disposeSupabaseAuthLifecycle();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      let initTimedOut = false;
      const timeout = setTimeout(() => {
        initTimedOut = true;
        if (alive) setReady(true);
      }, 4000);

      try {
        await initI18n();
      } catch {}
      finally {
        clearTimeout(timeout);
      }

      if (alive && !initTimedOut) {
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
    if (!ready) return;

    let alive = true;

    (async () => {
      try {
        await Promise.race([
          supabase.auth.getSession(),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);
      } catch {
        // fail open — a slow or failed session read is not a reason to sign out
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    if (Platform.OS === "web") return;
    if (isExpoGoRuntime()) return;

    let alive = true;
    let sub: { remove: () => void } | null = null;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (!alive) return;
        if (typeof Notifications.addNotificationResponseReceivedListener !== "function") return;

        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const payload = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
          const postId = String(payload.postId ?? "").trim();
          const type = String(payload.type ?? "").trim();

          if ((type === "like" || type === "comment") && postId) {
            router.push({ pathname: "/post", params: { id: postId } });
            return;
          }

          if (type === "follow") {
            router.push("/notifications");
          }
        });
      } catch (e: any) {
        console.log("PUSH LISTENER INIT ERROR:", e?.message ?? String(e));
      }
    })();

    return () => {
      alive = false;
      sub?.remove();
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
          await signOutSafely();
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

  useEffect(() => {
    if (!ready) return;

    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      const userId = user?.id;
      if (alive && userId) {
        registerPushTokenForUser(userId).catch(() => {});
        maybeShowWelcome(userId, user?.created_at ?? null).catch(() => {});
      }
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setWelcomeVisible(false);
        router.replace("/sign-in");
        return;
      }

      const userId = session?.user?.id;
      if (alive && userId) {
        registerPushTokenForUser(userId).catch(() => {});
        maybeShowWelcome(userId, session?.user?.created_at ?? null).catch(() => {});
      }
    });

    return () => {
      alive = false;
      authSub.subscription.unsubscribe();
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
            <NotificationBadgeProvider>
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
              <Stack.Screen name="payment-success" />
              <Stack.Screen name="payment-cancel" />

              <Stack.Screen name="new-post" />
              <Stack.Screen name="new-clip" />
              <Stack.Screen name="post" />
              <Stack.Screen name="rider" />
              <Stack.Screen name="followers" />
              <Stack.Screen name="following" />

              <Stack.Screen name="messages" />
              <Stack.Screen name="riders-near-me" />
              <Stack.Screen name="rider-requests" />
              <Stack.Screen name="moderation" />
              <Stack.Screen name="moderation-bans" />
              <Stack.Screen name="advertise" />
              <Stack.Screen name="sell" />
              <Stack.Screen name="events" />
              <Stack.Screen name="events/create" />
              <Stack.Screen name="events/browse" />
              <Stack.Screen name="events/[id]" />
              <Stack.Screen name="rent" />
              <Stack.Screen name="communities" />

              <Stack.Screen name="language" />
              <Stack.Screen name="feedback" />

              <Stack.Screen name="admin-feedback" />
              <Stack.Screen name="admin-house-sponsor" />
              <Stack.Screen name="admin-store-applications" />

              <Stack.Screen name="store-dashboard" />

              <Stack.Screen
                name="viewer"
                options={{
                  presentation: "fullScreenModal",
                  animation: "none",
                  contentStyle: { backgroundColor: "#000" },
                }}
              />
            </Stack>

            <Modal transparent visible={welcomeVisible} animationType="fade" onRequestClose={() => void closeWelcome()}>
              <Pressable onPress={() => void closeWelcome()} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 18 }}>
                <Pressable
                  onPress={() => {}}
                  style={{
                    maxHeight: "82%",
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "#12121A",
                    padding: 18,
                    gap: 14,
                  }}
                >
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>Welcome to Oranga</Text>
                    <Text style={{ color: "#A7A7B5", fontWeight: "700", lineHeight: 20 }}>
                      This app is still being built by one person, one careful release at a time. That means some parts are already strong, and some parts will still bump into the road while they grow.
                    </Text>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>A small story behind it</Text>
                      <Text style={{ color: "#D7D7E2", lineHeight: 21 }}>
                        Oranga started as a simple idea: build a place that feels like the motorcycle world itself, closer, warmer, less disposable, and more human. Every screen, fix, payment flow, clip feed, and bug hunt has been carried by a solo developer trying to keep the app moving forward without losing that feeling.
                      </Text>
                      <Text style={{ color: "#D7D7E2", lineHeight: 21 }}>
                        So if something feels rough, thank you for staying with it. That kind of patience matters more than most people realize.
                      </Text>
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>If you spot bugs</Text>
                      <Text style={{ color: "#D7D7E2", lineHeight: 21 }}>
                        You can send bugs or ideas through the Feedback button in the side menu. That is the fastest way to help shape what gets fixed next.
                      </Text>
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>How support quietly helps</Text>
                      <Text style={{ color: "#D7D7E2", lineHeight: 21 }}>
                        House sponsors, donations, and dealer accounts help keep the lights on: Apple and Google developer accounts, storage, databases, push services, maps, media handling, and the monthly cost of just keeping the platform online.
                      </Text>
                      <Text style={{ color: "#A7A7B5", lineHeight: 20 }}>
                        Nothing is expected from you. But every bit of support gives the app more time, more polish, and more room to grow.
                      </Text>
                    </View>
                  </ScrollView>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Switch value={dontShowWelcomeAgain} onValueChange={setDontShowWelcomeAgain} trackColor={{ false: "#343447", true: "#7CFFB2" }} thumbColor={dontShowWelcomeAgain ? "#0B0B0F" : "#F2F2F2"} />
                    <Text style={{ color: "#FFFFFF", fontWeight: "700", flex: 1 }}>Don’t show again</Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => {
                        void (async () => {
                          await closeWelcome();
                          router.push("/feedback");
                        })();
                      }}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "#2A2A3A",
                        backgroundColor: "#1D1D2A",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Open Feedback</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void closeWelcome()}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        borderRadius: 14,
                        backgroundColor: "#FFFFFF",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#0B0B0F", fontWeight: "900" }}>Continue</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
            </NotificationBadgeProvider>
          </TabBarVisibilityProvider>
        </MenuProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

function isExpoGoRuntime(): boolean {
  const ownership = String((Constants as any)?.appOwnership ?? "").toLowerCase();
  const env = String((Constants as any)?.executionEnvironment ?? "").toLowerCase();
  return ownership === "expo" || env === "storeclient";
}