import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AnimatedSelectableButton from "../components/ui/AnimatedSelectableButton";
import { supabase } from "../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";

type StoreAccountRow = {
  user_id: string;
  business_name: string;
  contact_email: string;
  dealer_type: string | null;
  status: string;
  created_at: string;
};

type StoreProductRow = {
  id: string;
  owner_user_id: string;
  sponsor_name: string | null;
  title: string | null;
  body: string | null;
  cta_url: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  ok: "#7CFFB2",
  danger: "#FF7C7C",
};

type Tab = "accounts" | "products";

export default function AdminStoreApplicationsScreen() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<StoreAccountRow[]>([]);
  const [products, setProducts] = useState<StoreProductRow[]>([]);

  const pendingAccounts = useMemo(() => accounts.filter((a) => a.status === "pending_review"), [accounts]);
  const pendingProducts = useMemo(() => products.filter((p) => p.status === "pending_review"), [products]);

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return false;
    }

    const { data: prof } = await supabase.from("profiles").select("role").eq("id", sessionData.session.user.id).single();
    const role = ((prof as any)?.role ?? "user") as ProfileRole;
    if (role !== "admin") {
      Alert.alert("Access denied", "This screen is admin-only.");
      router.back();
      return false;
    }

    return true;
  };

  const load = async () => {
    setLoading(true);
    const ok = await ensureAdmin();
    if (!ok) return;

    const [{ data: accountRows }, { data: productRows }] = await Promise.all([
      supabase
        .from("business_accounts")
        .select("user_id, business_name, contact_email, dealer_type, status, created_at")
        .ilike("dealer_type", "store|%")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("ad_campaigns")
        .select("id, owner_user_id, sponsor_name, title, body, cta_url, image_url, status, created_at")
        .eq("badge_text", "Store")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    setAccounts((accountRows ?? []) as StoreAccountRow[]);
    setProducts((productRows ?? []) as StoreProductRow[]);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const approveAccount = async (row: StoreAccountRow) => {
    setSavingId(`acct:${row.user_id}`);
    const { error } = await supabase.from("business_accounts").update({ status: "active" }).eq("user_id", row.user_id);
    setSavingId(null);
    if (error) return Alert.alert("Approve failed", error.message);
    setAccounts((prev) => prev.map((x) => (x.user_id === row.user_id ? { ...x, status: "active" } : x)));
  };

  const rejectAccount = async (row: StoreAccountRow) => {
    setSavingId(`acct:${row.user_id}`);
    const { error } = await supabase.from("business_accounts").update({ status: "rejected" }).eq("user_id", row.user_id);
    setSavingId(null);
    if (error) return Alert.alert("Reject failed", error.message);
    setAccounts((prev) => prev.map((x) => (x.user_id === row.user_id ? { ...x, status: "rejected" } : x)));
  };

  const approveProduct = async (row: StoreProductRow) => {
    setSavingId(`prod:${row.id}`);
    const { error } = await supabase
      .from("ad_campaigns")
      .update({ status: "active", is_active: true, start_at: null, end_at: null } as any)
      .eq("id", row.id);
    setSavingId(null);
    if (error) return Alert.alert("Approve failed", error.message);
    setProducts((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: "active" } : x)));
  };

  const rejectProduct = async (row: StoreProductRow) => {
    setSavingId(`prod:${row.id}`);
    const { error } = await supabase.from("ad_campaigns").update({ status: "rejected", is_active: false } as any).eq("id", row.id);
    setSavingId(null);
    if (error) return Alert.alert("Reject failed", error.message);
    setProducts((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: "rejected" } : x)));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900" }}>Store Approvals</Text>
        <Text style={{ color: COLORS.muted, marginTop: 4 }}>
          Pending accounts: {pendingAccounts.length} · Pending products: {pendingProducts.length}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}
        >
          <AnimatedSelectableButton
            active={tab === "accounts"}
            onPress={() => setTab("accounts")}
            label="Accounts"
            borderRadius={999}
            containerStyle={{ minWidth: 100 }}
            pressableStyle={{ paddingVertical: 7, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            active={tab === "products"}
            onPress={() => setTab("products")}
            label="Products"
            borderRadius={999}
            containerStyle={{ minWidth: 100 }}
            pressableStyle={{ paddingVertical: 7, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            active={!loading}
            onPress={load}
            label={loading ? "Loading..." : "Refresh"}
            borderRadius={999}
            containerStyle={{ minWidth: 100 }}
            pressableStyle={{ paddingVertical: 7, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />
        </ScrollView>
      </View>

      {tab === "accounts" ? (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={{ color: COLORS.muted }}>{loading ? "Loading..." : "No store account requests."}</Text>}
          renderItem={({ item }) => {
            const busy = savingId === `acct:${item.user_id}`;
            const pending = item.status === "pending_review";
            return (
              <View style={{ marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>{item.business_name}</Text>
                  <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                    <Text style={{ color: pending ? COLORS.text : item.status === "active" ? COLORS.ok : COLORS.danger, fontWeight: "900", fontSize: 12 }}>{item.status}</Text>
                  </View>
                </View>

                <Text style={{ color: COLORS.muted, marginTop: 6 }}>{item.contact_email}</Text>
                <Text style={{ color: COLORS.muted, marginTop: 4 }}>Type: {(item.dealer_type ?? "store").replace(/^store\|/i, "")}</Text>

                {item.status !== "active" ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}
                  >
                    <AnimatedSelectableButton
                      active={!busy}
                      onPress={() => approveAccount(item)}
                      disabled={busy}
                      label={busy ? "Saving..." : pending ? "✓ Approve" : "✓ Grant access"}
                      borderRadius={999}
                      containerStyle={{ minWidth: 126 }}
                      pressableStyle={{ paddingVertical: 6, paddingHorizontal: 14 }}
                      textStyle={{ fontSize: 13, fontWeight: "900" }}
                    />
                    <Pressable
                      onPress={() => rejectAccount(item)}
                      disabled={busy}
                      style={{ minWidth: 96, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: "rgba(255,124,124,0.1)", alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 13 }}>✕ Reject</Text>
                    </Pressable>
                  </ScrollView>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}
                  >
                    <Pressable
                      onPress={() => rejectAccount(item)}
                      disabled={busy}
                      style={{ minWidth: 138, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: "rgba(255,124,124,0.1)", alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 13 }}>{busy ? "Saving..." : "✕ Revoke access"}</Text>
                    </Pressable>
                  </ScrollView>
                )}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={{ color: COLORS.muted }}>{loading ? "Loading..." : "No store products."}</Text>}
          renderItem={({ item }) => {
            const busy = savingId === `prod:${item.id}`;
            const pending = item.status === "pending_review";
            return (
              <View style={{ marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>{item.title ?? "Product"}</Text>
                  <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                    <Text style={{ color: pending ? COLORS.text : item.status === "active" ? COLORS.ok : COLORS.danger, fontWeight: "900", fontSize: 12 }}>{item.status}</Text>
                  </View>
                </View>

                <Text style={{ color: COLORS.muted, marginTop: 4 }} numberOfLines={1}>{item.sponsor_name ?? "Store"}</Text>
                <Text style={{ color: COLORS.text, marginTop: 6 }} numberOfLines={3}>{item.body ?? ""}</Text>

                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={{ width: "100%", height: 170, borderRadius: 12, marginTop: 10 }} resizeMode="cover" />
                ) : null}

                {pending ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}
                  >
                    <AnimatedSelectableButton
                      active={!busy}
                      onPress={() => approveProduct(item)}
                      disabled={busy}
                      label={busy ? "Saving..." : "✓ Approve"}
                      borderRadius={999}
                      containerStyle={{ minWidth: 116 }}
                      pressableStyle={{ paddingVertical: 6, paddingHorizontal: 14 }}
                      textStyle={{ fontSize: 13, fontWeight: "900" }}
                    />
                    <Pressable
                      onPress={() => rejectProduct(item)}
                      disabled={busy}
                      style={{ minWidth: 96, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: "rgba(255,124,124,0.1)", alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 13 }}>✕ Reject</Text>
                    </Pressable>
                  </ScrollView>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
