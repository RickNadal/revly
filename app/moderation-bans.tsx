import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";

type BannedUserRow = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  is_banned: boolean;
  banned_at?: string | null;
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
  danger: "#FF5A5F",
  ok: "#7CFFB2",
};

export default function ModerationBansScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [meRole, setMeRole] = useState<ProfileRole>("user");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BannedUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const ensureModOrAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setLoading(false);
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
      setLoading(false);
      Alert.alert(
        t("moderation.access_denied_title", { defaultValue: "Access denied" }),
        t("moderation.could_not_verify_body", { defaultValue: "Could not verify moderator status." })
      );
      router.back();
      return false;
    }

    const role = ((prof as any)?.role ?? "user") as ProfileRole;
    setMeRole(role);

    if (role !== "moderator" && role !== "admin") {
      setLoading(false);
      Alert.alert(
        t("moderation.access_denied_title", { defaultValue: "Access denied" }),
        t("moderation.mods_only_body", { defaultValue: "This screen is moderators/admins only." })
      );
      router.back();
      return false;
    }

    return true;
  };

  const load = async () => {
    setLoading(true);
    const ok = await ensureModOrAdmin();
    if (!ok) return;

    const primary = await supabase
      .from("profiles")
      .select("id, full_name, role, is_banned, banned_at")
      .eq("is_banned", true)
      .order("banned_at", { ascending: false })
      .limit(300);

    let data = primary.data;
    let error = primary.error;

    if (error && String(error.message ?? "").toLowerCase().includes("banned_at")) {
      const fallback = await supabase
        .from("profiles")
        .select("id, full_name, role, is_banned")
        .eq("is_banned", true)
        .limit(300);
      data = fallback.data as any;
      error = fallback.error as any;
    }

    if (error) {
      setLoading(false);
      Alert.alert(t("moderation.load_failed_title", { defaultValue: "Load failed" }), error.message);
      return;
    }

    setRows((data ?? []) as BannedUserRow[]);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onUnban = (user: BannedUserRow) => {
    Alert.alert(
      t("moderation.unban_user_title", { defaultValue: "Unban user?" }),
      t("moderation.unban_user_body", { defaultValue: "This will remove the ban for this account." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("moderation.unban", { defaultValue: "Unban" }),
          style: "default",
          onPress: async () => {
            setBusyUserId(user.id);
            try {
              const rpc = await supabase.rpc("mod_unban_user", { target_user: user.id } as any);

              if (rpc.error) {
                const upd = await supabase
                  .from("profiles")
                  .update({ is_banned: false, banned_at: null } as any)
                  .eq("id", user.id);
                if (upd.error) throw upd.error;
              }

              setRows((prev) => prev.filter((x) => x.id !== user.id));
              Alert.alert(
                t("moderation.unbanned_title", { defaultValue: "User unbanned" }),
                t("moderation.unbanned_body", { defaultValue: "The account ban has been removed." })
              );
            } catch (e: any) {
              Alert.alert(t("moderation.update_failed_title", { defaultValue: "Update failed" }), e?.message ?? "Unknown error");
            } finally {
              setBusyUserId(null);
            }
          },
        },
      ]
    );
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const name = String(u.full_name ?? "").toLowerCase();
      const id = String(u.id ?? "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [query, rows]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("moderation.banned_users_title", { defaultValue: "Banned users" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("moderation.role_prefix", { defaultValue: "Role:" })} {meRole}
        </Text>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              backgroundColor: COLORS.card,
              paddingHorizontal: 12,
            }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("moderation.search_users", { defaultValue: "Search name or user ID" })}
              placeholderTextColor={COLORS.muted}
              style={{ color: COLORS.text, paddingVertical: 12, fontWeight: "700" }}
            />
          </View>

          <Pressable
            onPress={load}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: COLORS.button,
              borderWidth: 1,
              borderColor: COLORS.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name={loading ? "time-outline" : "refresh-outline"} size={18} color={COLORS.buttonText} />
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
              {loading ? t("common.loading", { defaultValue: "Loading…" }) : t("moderation.refresh", { defaultValue: "Refresh" })}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom + 24, 30),
        }}
        ListEmptyComponent={
          <View style={{ paddingTop: 18 }}>
            <Text style={{ color: COLORS.muted }}>
              {loading
                ? t("common.loading", { defaultValue: "Loading…" })
                : t("moderation.no_banned_users", { defaultValue: "No banned users found." })}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const roleTone = item.role === "admin" ? "#F5C451" : item.role === "moderator" ? "#7CFFB2" : COLORS.text;
          return (
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
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                {item.full_name?.trim() || t("feed.rider_fallback", { defaultValue: "Rider" })}
              </Text>

              <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 6 }} numberOfLines={1}>
                {item.id}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: roleTone, fontWeight: "900", fontSize: 12 }}>{String(item.role).toUpperCase()}</Text>
                </View>

                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,90,95,0.12)",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 12 }}>
                    {t("moderation.status_banned", { defaultValue: "BANNED" })}
                  </Text>
                </View>

                {item.banned_at ? (
                  <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                    {t("moderation.banned_at", {
                      defaultValue: "Banned: {{date}}",
                      date: new Date(item.banned_at).toLocaleString(),
                    })}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => router.push({ pathname: "/rider", params: { id: item.id } })}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.bg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {t("feed.view_profile", { defaultValue: "View profile" })}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => onUnban(item)}
                  disabled={busyUserId === item.id}
                  style={{
                    marginLeft: "auto",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: "rgba(124,255,178,0.14)",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    opacity: busyUserId === item.id ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: COLORS.ok, fontWeight: "900" }}>
                    {busyUserId === item.id
                      ? t("common.loading", { defaultValue: "Loading…" })
                      : t("moderation.unban", { defaultValue: "Unban" })}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
