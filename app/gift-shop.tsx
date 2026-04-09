// app/gift-shop.tsx
// Bottom-sheet style gift picker. Called via router.push("/gift-shop?recipientId=...&recipientName=...")
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
};

type GiftType = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price_cents: number;
  score_value: number;
  sort_order: number;
};

export default function GiftShop() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ recipientId?: string; recipientName?: string }>();
  const recipientId = String(params.recipientId ?? "").trim();
  const recipientName = String(params.recipientName ?? t("common.this_rider", { defaultValue: "this rider" })).trim();

  const [gifts, setGifts] = useState<GiftType[]>([]);
  const [loadingGifts, setLoadingGifts] = useState(true);
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [message, setMessage] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myCredits, setMyCredits] = useState(0);
  const [lastClaimedAt, setLastClaimedAt] = useState<Date | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [sendingFree, setSendingFree] = useState(false);

  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }, []);

  useEffect(() => {
    const load = async () => {
      const [{ data: giftData }, sessionRes] = await Promise.all([
        supabase
          .from("gift_types" as any)
          .select("id, name, emoji, description, price_cents, score_value, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase.auth.getSession(),
      ]);
      setGifts((giftData as GiftType[]) ?? []);
      setLoadingGifts(false);

      const me = sessionRes.data.session?.user?.id;
      if (me) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("gift_credits, last_gift_credit_claimed_at")
          .eq("id", me)
          .single();
        setMyCredits((profile as any)?.gift_credits ?? 0);
        const raw = (profile as any)?.last_gift_credit_claimed_at;
        setLastClaimedAt(raw ? new Date(raw) : null);
      }
    };
    load();
  }, []);

  const dismiss = () => router.back();

  const parseFunctionError = async (error: any) => {
    const context = error?.context;
    if (context) {
      try {
        const body = await context.json();
        if (typeof body?.error === "string" && body.error.trim()) return body.error;
      } catch {}

      try {
        const text = await context.text();
        if (typeof text === "string" && text.trim()) return text;
      } catch {}

      const status = Number(context?.status ?? 0);
      if (status) {
        return t("gifts.checkout_failed", {
          defaultValue: "Checkout failed ({{status}}). Please try again.",
          status,
        });
      }
    }

    if (typeof error?.message === "string" && error.message.trim()) return error.message;
    return t("common.unknown_error", { defaultValue: "Something went wrong." });
  };

  const postGiftCheckoutDirect = async (token: string, payload: { gift_type_id: string; recipient_id: string; message?: string }) => {
    const supabaseUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? String((supabase as any).supabaseUrl ?? "").trim();
    if (!supabaseUrl) {
      return {
        ok: false,
        error: t("gifts.missing_config", {
          defaultValue: "Checkout is not configured in this build. Please update app config.",
        }),
      };
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/create-gift-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : t("gifts.checkout_failed", {
                defaultValue: "Checkout failed ({{status}}). Please try again.",
                status: res.status,
              }),
      };
    }

    if (!body?.url) {
      return {
        ok: false,
        error: t("gifts.checkout_invalid_response", {
          defaultValue: "Checkout failed: invalid response from server.",
        }),
      };
    }

    return { ok: true, url: String(body.url) };
  };

  const purchase = async () => {
    if (!selected || !recipientId) return;
    setError(null);
    setPurchasing(true);
    Keyboard.dismiss();

    try {
      let { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token ?? null;

      if (!accessToken) {
        const refreshed = await supabase.auth.refreshSession();
        accessToken = refreshed.data.session?.access_token ?? null;
      }

      if (!accessToken) {
        setError(t("common.not_logged_in", { defaultValue: "You must be logged in." }));
        return;
      }

      const payload = {
        gift_type_id: selected.id,
        recipient_id: recipientId,
        message: message.trim() || undefined,
      };

      let { data, error } = await supabase.functions.invoke("create-gift-checkout", {
        body: payload,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const status = Number((error as any)?.context?.status ?? (error as any)?.status ?? 0);
      if (error && status === 401) {
        const refreshed = await supabase.auth.refreshSession();
        const retryToken = refreshed.data.session?.access_token ?? accessToken;
        const retried = await supabase.functions.invoke("create-gift-checkout", {
          body: payload,
          headers: {
            Authorization: `Bearer ${retryToken}`,
          },
        });
        data = retried.data;
        error = retried.error;

        const retryStatus = Number((error as any)?.context?.status ?? (error as any)?.status ?? 0);
        if (error && retryStatus === 401 && retryToken) {
          const direct = await postGiftCheckoutDirect(retryToken, payload);
          if (direct.ok && direct.url) {
            await Linking.openURL(direct.url);
            dismiss();
            return;
          }
          if (!direct.ok) {
            setError(direct.error);
            return;
          }
        }
      }

      if (error) {
        setError(await parseFunctionError(error));
        return;
      }

      if (!data?.url) {
        setError(
          t("gifts.checkout_invalid_response", {
            defaultValue: "Checkout failed: invalid response from server.",
          })
        );
        return;
      }

      await Linking.openURL(data.url);
      dismiss();
    } catch (e: any) {
      setError(e?.message ?? t("common.unknown_error", { defaultValue: "Something went wrong." }));
    } finally {
      setPurchasing(false);
    }
  };

  const canClaimToday = !lastClaimedAt || Date.now() - lastClaimedAt.getTime() > 24 * 60 * 60 * 1000;

  const claimDailyCredit = async () => {
    setClaiming(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("claim_daily_gift_credit" as any);
      if (rpcErr || !(data as any)?.ok) {
        Alert.alert("Claim failed", (data as any)?.error ?? rpcErr?.message ?? "Try again later.");
        return;
      }
      setMyCredits((data as any).credits);
      setLastClaimedAt(new Date());
    } finally {
      setClaiming(false);
    }
  };

  const sendFreeGift = async () => {
    if (myCredits < 1 || !recipientId || sendingFree) return;
    setSendingFree(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const { data, error: rpcErr } = await supabase.rpc("spend_gift_credit" as any, {
        p_recipient_id: recipientId,
        p_message: message.trim() || null,
      });
      if (rpcErr || !(data as any)?.ok) {
        setError((data as any)?.error ?? rpcErr?.message ?? "Could not send free gift.");
        return;
      }
      setMyCredits((data as any).credits_remaining);
      Alert.alert("Cadeau verstuurd! 🔥", `Je hebt een gratis Fire cadeau gestuurd naar ${recipientName}.`);
      dismiss();
    } finally {
      setSendingFree(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)" }} edges={["top", "left", "right"]}>
      {/* Dim backdrop */}
      <Pressable style={{ flex: 1 }} onPress={dismiss} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
          <LinearGradient
            colors={["#16121e", "#12121A", "#0B0B0F"]}
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              paddingBottom: Math.max(insets.bottom + 8, 24),
            }}
          >
            {/* Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 }}>
              <View>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                  {t("gifts.title", { defaultValue: "Send a Gift" })}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>
                  {t("gifts.subtitle", { defaultValue: "to {{name}}", name: recipientName })}
                </Text>
              </View>
              <Pressable onPress={dismiss} hitSlop={10}>
                <Ionicons name="close-circle" size={26} color={COLORS.muted} />
              </Pressable>
            </View>

            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(200,155,255,0.28)",
                backgroundColor: "rgba(200,155,255,0.08)",
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(200,155,255,0.16)",
                }}
              >
                <Ionicons name="heart-circle" size={22} color="#D8B4FE" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13, marginBottom: 4 }}>
                  {t("gifts.support_title", { defaultValue: "Elk cadeau helpt Oranga verder bouwen" })}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
                  {t("gifts.support_body", {
                    defaultValue:
                      "Elke aankoop ondersteunt de verdere ontwikkeling van de app en geeft deze rijder een zichtbare boost op het klassement.",
                  })}
                </Text>
              </View>
            </View>

            {/* Daily gift credits card */}
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,210,100,0.28)",
                backgroundColor: "rgba(255,210,100,0.07)",
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,210,100,0.16)",
                }}
              >
                <Text style={{ fontSize: 20 }}>🎁</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                  Gratis cadeau credits
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                  {myCredits === 0
                    ? canClaimToday
                      ? "Claim jouw dagelijkse gratis 🔥 credit"
                      : "Morgen weer een nieuwe credit beschikbaar"
                    : `Je hebt ${myCredits} gratis credit${myCredits !== 1 ? "s" : ""}`}
                </Text>
              </View>
              {canClaimToday ? (
                <Pressable
                  onPress={claimDailyCredit}
                  disabled={claiming}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: claiming ? "rgba(255,210,100,0.12)" : "rgba(255,210,100,0.22)",
                    borderWidth: 1,
                    borderColor: "rgba(255,210,100,0.45)",
                  }}
                >
                  <Text style={{ color: "#FFD264", fontWeight: "900", fontSize: 13 }}>
                    {claiming ? "…" : "Claim"}
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: "700" }}>Morgen</Text>
                </View>
              )}
            </View>

            {/* Gift grid */}
            {loadingGifts ? (
              <ActivityIndicator color={COLORS.muted} style={{ marginVertical: 32 }} />
            ) : (
              <FlatList
                data={gifts}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(g) => g.id}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                renderItem={({ item }) => {
                  const isSelected = selected?.id === item.id;
                  return (
                    <Pressable
                      onPress={() => setSelected(item)}
                      style={{
                        width: 90,
                        borderRadius: 16,
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: isSelected ? "#B57BFF" : COLORS.border,
                        backgroundColor: isSelected ? "rgba(181,123,255,0.10)" : COLORS.card,
                      }}
                    >
                      <View style={{ alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, gap: 6 }}>
                        <Text style={{ fontSize: 34 }}>{item.emoji}</Text>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13, textAlign: "center" }}>{item.name}</Text>
                        <Text style={{ color: "#B57BFF", fontWeight: "800", fontSize: 12 }}>{formatPrice(item.price_cents)}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons name="trophy-outline" size={11} color={COLORS.muted} />
                          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: "700" }}>+{item.score_value} pts</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}

            {/* Optional message */}
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={t("gifts.message_placeholder", { defaultValue: "Add a message (optional)" })}
                placeholderTextColor={COLORS.muted}
                maxLength={200}
                multiline
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  color: COLORS.text,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 14,
                  minHeight: 52,
                  maxHeight: 100,
                }}
              />
            </View>

            {/* Error */}
            {error ? (
              <Text style={{ color: "#FF6B6B", fontSize: 13, marginHorizontal: 20, marginTop: 10, fontWeight: "700" }}>
                {error}
              </Text>
            ) : null}

            {/* CTA */}
            <Pressable
              onPress={purchase}
              disabled={!selected || purchasing}
              style={{ marginHorizontal: 16, marginTop: 16 }}
            >
              <LinearGradient
                colors={selected && !purchasing ? ["#C89BFF", "#8B5CF6", "#6D28D9"] : ["#2a2a3a", "#1e1e2e"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: selected && !purchasing ? "rgba(181,123,255,0.5)" : COLORS.border,
                }}
              >
                {purchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: selected ? "#fff" : COLORS.muted, fontWeight: "900", fontSize: 16 }}>
                    {selected
                      ? t("gifts.send_cta", { defaultValue: "Send {{emoji}} {{name}} · {{price}}", emoji: selected.emoji, name: selected.name, price: formatPrice(selected.price_cents) })
                      : t("gifts.select_prompt", { defaultValue: "Pick a gift above" })}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {myCredits > 0 ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />
                  <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>of</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />
                </View>
                <Pressable
                  onPress={sendFreeGift}
                  disabled={sendingFree}
                  style={{
                    marginHorizontal: 16,
                    marginTop: 10,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,210,100,0.45)",
                    backgroundColor: sendingFree ? "rgba(255,210,100,0.06)" : "rgba(255,210,100,0.14)",
                  }}
                >
                  <Text style={{ color: "#FFD264", fontWeight: "900", fontSize: 15 }}>
                    {sendingFree ? "…" : `Stuur gratis 🔥 Fire (${myCredits} credit${myCredits !== 1 ? "s" : ""})`}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Text style={{ color: COLORS.muted, fontSize: 11, textAlign: "center", marginTop: 10, paddingHorizontal: 24 }}>
              {t("gifts.score_note", { defaultValue: "Gifts boost the rider's leaderboard score. No refunds on digital gifts." })}
            </Text>
          </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
