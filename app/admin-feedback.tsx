// app/admin-feedback.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AnimatedSelectableButton from "../components/ui/AnimatedSelectableButton";
import { supabase } from "../lib/supabase";

type FeedbackRow = {
  id: string;
  created_at: string;
  user_id: string;
  category: string | null;
  rating: number | null;
  message: string;
  app_version: string | null;
  platform: string | null;
};

type ProfileRole = "user" | "moderator" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  is_premium: boolean;
  is_legacy: boolean;
};

type UserBusinessAccess = {
  tierId: string;
  accountStatus: string;
  subscriptionStatus: string;
  dealerType: string;
  dealerBypass: boolean;
  storeBypass: boolean;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  danger: "#FF5A5F",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  warn: "#F5C451",
  ok: "#7CFFB2",
};

const ADMIN_REQ_TIMEOUT_MS = 15000;
const ADMIN_BYPASS_REQ_TIMEOUT_MS = 20000;
const ADMIN_AUTH_REFRESH_TIMEOUT_MS = 60000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
  function decodeJwtExpMs(token: string): number | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const decoded = atob(padded);
      const parsed = JSON.parse(decoded);
      const exp = Number(parsed?.exp ?? 0);
      if (!Number.isFinite(exp) || exp <= 0) return null;
      return exp * 1000;
    } catch {
      return null;
    }
  }

export default function AdminFeedbackScreen() {
  const [tab, setTab] = useState<"feedback" | "users">("feedback");

  // --- admin guard ---
  const [checked, setChecked] = useState(false);
  const [meRole, setMeRole] = useState<ProfileRole>("user");

  // --- feedback ---
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  // --- users ---
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [businessAccess, setBusinessAccess] = useState<UserBusinessAccess | null>(null);
  const [loadingBusinessAccess, setLoadingBusinessAccess] = useState(false);
  const [savingBypass, setSavingBypass] = useState<"dealer" | "store" | null>(null);

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.replace("/sign-in");
      return false;
    }

    const uid = session.user.id;

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", uid)
      .single();

    if (error) {
      console.log("ADMIN CHECK ERROR:", error);
      Alert.alert("Access denied", "Could not verify admin status.");
      router.back();
      return false;
    }

    const role = ((prof as any)?.role ?? "user") as ProfileRole;
    setMeRole(role);

    if (role !== "admin") {
      Alert.alert("Access denied", "This screen is admin-only.");
      router.back();
      return false;
    }

    return true;
  };

  const loadFeedback = async () => {
    setLoading(true);

    const ok = await ensureAdmin();
    setChecked(true);
    if (!ok) return;

    const { data, error } = await supabase
      .from("feedback")
      .select("id, created_at, user_id, category, rating, message, app_version, platform")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    setItems((data ?? []) as FeedbackRow[]);
    setLoading(false);
  };

  const loadUsers = async () => {
    setUsersLoading(true);

    const ok = await ensureAdmin();
    setChecked(true);
    if (!ok) return setUsersLoading(false);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_premium, is_legacy")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.log("USERS LOAD ERROR:", error);
      setUsersLoading(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    setUsers((data ?? []) as any);
    setUsersLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (tab === "feedback") loadFeedback();
      else loadUsers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab])
  );

  const deleteFeedback = async (id: string) => {
    Alert.alert("Delete feedback?", "This will remove it permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("feedback").delete().eq("id", id);
          if (error) return Alert.alert("Delete failed", error.message);
          setItems((prev) => prev.filter((x) => x.id !== id));
        },
      },
    ]);
  };

  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const id = (u.id ?? "").toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [users, q]);

  // ✅ Save via RPC (secure) — role limited to user/moderator ONLY.
  const saveSelectedUser = async (next: ProfileRow) => {
    setSavingUser(true);
    try {
      // HARD guard in UI: never send admin as new role
      if (next.role === "admin") {
        Alert.alert("Not allowed", "Admin role cannot be granted from the app.");
        return;
      }

      const rpcResult = await withTimeout(
        Promise.resolve(
          supabase.rpc("admin_set_user_flags", {
            target_user: next.id,
            new_role: next.role, // only 'user' | 'moderator'
            new_is_premium: next.is_premium,
            new_is_legacy: next.is_legacy,
          }) as any
        ),
        ADMIN_REQ_TIMEOUT_MS,
        "save user"
      );
      const error = (rpcResult as any)?.error;

      if (error) {
        console.log("RPC ERROR:", error);
        Alert.alert("Save failed", error.message);
        return;
      }

      setUsers((prev) => prev.map((u) => (u.id === next.id ? next : u)));
      setSelected(next);
      Alert.alert("Saved", "User updated.");
    } finally {
      setSavingUser(false);
    }
  };

  const callAdminBypassApi = useCallback(async (body: Record<string, any>) => {
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (!supabaseUrl || !anonKey) {
        return {
          ok: false as const,
          status: 0,
          payload: { error: "Missing Supabase configuration in this build." },
        };
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        return {
          ok: false as const,
          status: 401,
          payload: { error: "Sign in required. Please sign in again." },
        };
      }

      // If token is close to expiry, refresh once (with a generous timeout) before calling Edge Function.
      const expMs = decodeJwtExpMs(accessToken);
      const nearExpiry = expMs !== null && expMs - Date.now() < 2 * 60 * 1000;
      if (nearExpiry) {
        try {
          const { data: refreshed, error: refreshError } = await withTimeout(
            supabase.auth.refreshSession(),
            ADMIN_AUTH_REFRESH_TIMEOUT_MS,
            "refresh session for bypass"
          );
          const refreshedToken = refreshed.session?.access_token;
          if (!refreshError && refreshedToken) accessToken = refreshedToken;
        } catch {
          // Keep current token as fallback; request below will return precise server status if it fails.
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ADMIN_BYPASS_REQ_TIMEOUT_MS);
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-grant-business-bypass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await response.text();
      let payload: any = null;
      try { payload = JSON.parse(raw); } catch { payload = raw; }
      return { ok: response.ok as boolean, status: response.status, payload };
    } catch (err: any) {
      return {
        ok: false as const,
        status: 0,
        payload: { error: String(err?.message ?? "Bypass request failed") },
      };
    }
  }, []);

  const loadSelectedBusinessAccess = useCallback(async (userId: string) => {
    setLoadingBusinessAccess(true);
    try {
      const res = await callAdminBypassApi({
        action: "status",
        targetUserId: userId,
      });

      if (!res.ok || !(res.payload as any)?.ok) {
        setBusinessAccess(null);
        return;
      }

      const accountStatus = String((res.payload as any)?.accountStatus ?? "none");
      const subscriptionStatus = String((res.payload as any)?.subscriptionStatus ?? "none");
      const dealerType = String((res.payload as any)?.dealerType ?? "");
      const tierId = String((res.payload as any)?.tierId ?? "dealer_basic");
      const dealerBypass = !!(res.payload as any)?.dealerBypass;
      const storeBypass = !!(res.payload as any)?.storeBypass;

      setBusinessAccess({
        tierId,
        accountStatus,
        subscriptionStatus,
        dealerType,
        dealerBypass,
        storeBypass,
      });
    } catch {
      setBusinessAccess(null);
    } finally {
      setLoadingBusinessAccess(false);
    }
  }, [callAdminBypassApi]);

  const grantBypass = useCallback(async (mode: "dealer" | "store") => {
    if (!selected) return;
    setSavingBypass(mode);
    const watchdog = setTimeout(() => {
      setSavingBypass(null);
    }, ADMIN_BYPASS_REQ_TIMEOUT_MS + 3000);
    try {
      const tierId = businessAccess?.tierId || "dealer_basic";
      const res = await callAdminBypassApi({
        action: "grant",
        targetUserId: selected.id,
        mode,
        tierId,
        businessName: (selected.full_name ?? "Business account").trim() || "Business account",
      });

      if (!res.ok) {
        const message =
          (res.payload && typeof res.payload === "object" && (res.payload as any).error ? String((res.payload as any).error) : null) ??
          (typeof res.payload === "string" && res.payload ? res.payload : null) ??
          `HTTP ${res.status}`;
        Alert.alert("Bypass failed", message);
        return;
      }

      if (!(res.payload as any)?.ok) {
        Alert.alert("Bypass failed", String((res.payload as any)?.error ?? "Unknown server error"));
        return;
      }

      setBusinessAccess((prev) => {
        const base = prev ?? {
          tierId,
          accountStatus: "none",
          subscriptionStatus: "none",
          dealerType: "",
          dealerBypass: false,
          storeBypass: false,
        };
        const nextDealerType = mode === "store"
          ? (base.dealerType && /^store\|/i.test(base.dealerType) ? base.dealerType : "store|general")
          : base.dealerType;
        return {
          ...base,
          tierId,
          accountStatus: "active",
          subscriptionStatus: "active",
          dealerType: nextDealerType,
          dealerBypass: true,
          storeBypass: mode === "store" ? true : !!base.storeBypass,
        };
      });

      Alert.alert("Saved", mode === "store" ? "Store bypass granted." : "Dealer bypass granted.");
      void loadSelectedBusinessAccess(selected.id);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("timed out") || msg.includes("aborted")) {
        Alert.alert("Bypass failed", "Request timed out. Please try again.");
      } else {
        Alert.alert("Bypass failed", err?.message ?? "Unknown error");
      }
    } finally {
      clearTimeout(watchdog);
      setSavingBypass(null);
    }
  }, [businessAccess?.tierId, callAdminBypassApi, loadSelectedBusinessAccess, selected]);

  useEffect(() => {
    if (!selected?.id) {
      setBusinessAccess(null);
      return;
    }
    void loadSelectedBusinessAccess(selected.id);
  }, [loadSelectedBusinessAccess, selected?.id]);

  const RoleChip = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => {
    return (
      <AnimatedSelectableButton
        label={label}
        active={active}
        onPress={onPress}
        containerStyle={{ borderRadius: 999 }}
        pressableStyle={{ borderRadius: 999, paddingHorizontal: 12 }}
      />
    );
  };

  const ToggleRow = ({
    label,
    value,
    onToggle,
    hint,
  }: {
    label: string;
    value: boolean;
    onToggle: () => void;
    hint?: string;
  }) => {
    return (
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.bg,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
          {hint ? (
            <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>{hint}</Text>
          ) : null}
        </View>

        <View
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            backgroundColor: value ? "rgba(124,255,178,0.18)" : "rgba(255,255,255,0.10)",
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 3,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              backgroundColor: value ? COLORS.ok : "rgba(255,255,255,0.55)",
              alignSelf: value ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>Admin Panel</Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          Role: {meRole}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center", paddingRight: 8 }}
        >
          <AnimatedSelectableButton
            label="Feedback"
            active={tab === "feedback"}
            onPress={() => setTab("feedback")}
            borderRadius={999}
            containerStyle={{ minWidth: 104 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label="Users"
            active={tab === "users"}
            onPress={() => setTab("users")}
            borderRadius={999}
            containerStyle={{ minWidth: 90 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label={tab === "feedback" ? (loading ? "Loading..." : "Refresh feedback") : usersLoading ? "Loading..." : "Refresh users"}
            active={false}
            onPress={() => (tab === "feedback" ? loadFeedback() : loadUsers())}
            borderRadius={999}
            containerStyle={{ minWidth: 148 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label="Make account house sponsor"
            active={false}
            onPress={() => {
              if (selected) {
                router.push({
                  pathname: "/admin-house-sponsor",
                  params: { userId: selected.id, userName: selected.full_name ?? "" },
                });
                return;
              }
              router.push("/admin-house-sponsor");
            }}
            borderRadius={999}
            containerStyle={{ minWidth: 228 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label="Review house sponsor requests"
            active={false}
            onPress={() => router.push("/admin-house-sponsor-submissions")}
            borderRadius={999}
            containerStyle={{ minWidth: 236 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label="Dealer requests"
            active={false}
            onPress={() => router.push("/admin-dealer-applications")}
            borderRadius={999}
            containerStyle={{ minWidth: 140 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />

          <AnimatedSelectableButton
            label="Store approvals"
            active={false}
            onPress={() => router.push("/admin-store-applications")}
            borderRadius={999}
            containerStyle={{ minWidth: 140 }}
            pressableStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13, fontWeight: "900" }}
          />
        </ScrollView>
      </View>

      {tab === "feedback" ? (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          ListEmptyComponent={
            <View style={{ paddingTop: 20 }}>
              <Text style={{ color: COLORS.muted }}>
                {loading ? "Loading…" : "No feedback yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 16,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {item.category ?? "Other"} {item.rating ? `· ${item.rating}/5` : ""}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                    {new Date(item.created_at).toLocaleString()} · {item.platform ?? "?"} · v{item.app_version ?? "?"}
                  </Text>
                </View>

                <Pressable onPress={() => deleteFeedback(item.id)}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900" }}>Delete</Text>
                </Pressable>
              </View>

              <Text style={{ color: COLORS.text, marginTop: 10, lineHeight: 20 }}>
                {item.message}
              </Text>

              <Text style={{ color: COLORS.muted, marginTop: 10, fontSize: 12 }}>
                User: {item.user_id}
              </Text>
            </View>
          )}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search users (name or uuid)…"
              placeholderTextColor={COLORS.muted}
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                color: COLORS.text,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />

            {selected ? (
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                  {selected.full_name ?? "Unnamed"}
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                  {selected.id}
                </Text>

                <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>Role</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <RoleChip
                    label="User"
                    active={selected.role === "user"}
                    onPress={() => setSelected({ ...selected, role: "user" })}
                  />
                  <RoleChip
                    label="Moderator"
                    active={selected.role === "moderator"}
                    onPress={() => setSelected({ ...selected, role: "moderator" })}
                  />
                </View>

                <View style={{ marginTop: 12, gap: 10 }}>
                  <ToggleRow
                    label="Premium"
                    value={selected.is_premium}
                    onToggle={() => setSelected({ ...selected, is_premium: !selected.is_premium })}
                    hint="Premium removes ads and unlocks perks."
                  />
                  <ToggleRow
                    label="Legacy"
                    value={selected.is_legacy}
                    onToggle={() => setSelected({ ...selected, is_legacy: !selected.is_legacy })}
                    hint="Legacy badge for founders/early supporters."
                  />
                </View>

                <View style={{ marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>Business access bypass</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                    {loadingBusinessAccess
                      ? "Loading access status..."
                      : `Account: ${businessAccess?.accountStatus ?? "none"} • Subscription: ${businessAccess?.subscriptionStatus ?? "none"}`}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                    {`Dealer type: ${businessAccess?.dealerType || "none"} • Tier: ${businessAccess?.tierId ?? "dealer_basic"}`}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <RoleChip
                      label={savingBypass === "dealer" ? "Saving..." : businessAccess?.dealerBypass ? "Dealer bypass active" : "Grant dealer bypass"}
                      active={!!businessAccess?.dealerBypass}
                      onPress={() => {
                        if (!savingBypass) void grantBypass("dealer");
                      }}
                    />
                    <RoleChip
                      label={savingBypass === "store" ? "Saving..." : businessAccess?.storeBypass ? "Store bypass active" : "Grant store bypass"}
                      active={!!businessAccess?.storeBypass}
                      onPress={() => {
                        if (!savingBypass) void grantBypass("store");
                      }}
                    />
                  </View>
                </View>

                <Pressable
                  disabled={savingUser || !!savingBypass}
                  onPress={() => selected && saveSelectedUser(selected)}
                  style={{
                    marginTop: 12,
                    backgroundColor: savingUser ? "#777" : COLORS.button,
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                    {savingUser ? "Saving…" : "Save changes"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSelected(null)}
                  style={{ marginTop: 10, alignItems: "center", padding: 10 }}
                >
                  <Text style={{ color: COLORS.muted, fontWeight: "900" }}>Close editor</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            ListEmptyComponent={
              <View style={{ paddingTop: 20 }}>
                <Text style={{ color: COLORS.muted }}>
                  {usersLoading ? "Loading…" : "No users loaded."}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const roleLabel = item.role === "admin" ? "ADMIN" : item.role === "moderator" ? "MOD" : "USER";
              return (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={{
                    marginBottom: 10,
                    padding: 12,
                    borderRadius: 16,
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900" }} numberOfLines={1}>
                        {item.full_name ?? "Unnamed"}
                      </Text>
                      <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>
                        {item.id}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 999,
                            backgroundColor: "rgba(255,255,255,0.10)",
                            borderWidth: 1,
                            borderColor: COLORS.border,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                            {roleLabel}
                          </Text>
                        </View>

                        {item.is_legacy ? (
                          <View
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 999,
                              backgroundColor: "rgba(245,196,81,0.15)",
                              borderWidth: 1,
                              borderColor: COLORS.border,
                            }}
                          >
                            <Text style={{ color: COLORS.warn, fontWeight: "900", fontSize: 12 }}>
                              LEGACY
                            </Text>
                          </View>
                        ) : null}

                        {item.is_premium ? (
                          <View
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 999,
                              backgroundColor: "rgba(124,255,178,0.12)",
                              borderWidth: 1,
                              borderColor: COLORS.border,
                            }}
                          >
                            <Text style={{ color: COLORS.ok, fontWeight: "900", fontSize: 12 }}>
                              PREMIUM
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Text style={{ color: COLORS.muted, fontWeight: "900" }}>Edit</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}