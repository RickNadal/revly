// app/communities.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  privacy: "open" | "private" | string;
  invite_code: string | null;
  created_at: string;
  owner_id: string;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
};

export default function CommunitiesScreen() {
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [meId, setMeId] = useState<string | null>(null);
  const [appRole, setAppRole] = useState<string>("user");
  const [isLegacy, setIsLegacy] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMe = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;
    setMeId(uid);

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("role, is_legacy")
      .eq("id", uid)
      .single();

    if (pErr) console.log("COMMUNITIES PROFILE LOAD ERROR:", pErr);

    setAppRole(String((prof as any)?.role ?? "user"));
    setIsLegacy(!!(prof as any)?.is_legacy);
  };

  const canDeleteAny = useMemo(() => {
    const admin = appRole === "admin";
    const legacyMod = appRole === "moderator" && isLegacy === true;
    return admin || legacyMod;
  }, [appRole, isLegacy]);

  const load = useCallback(async () => {
    if (mountedRef.current) setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      if (mountedRef.current) setLoading(false);
      router.replace("/sign-in");
      return;
    }

    await loadMe();

    const { data, error } = await supabase
      .from("groups")
      .select("id, name, description, privacy, invite_code, created_at, owner_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (mountedRef.current) setLoading(false);

      const msg = error.message ?? t("communities.load_failed_title", { defaultValue: "Load failed" });
      if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation")) {
        Alert.alert(
          t("communities.not_setup_title", { defaultValue: "Communities not set up yet" }),
          t("communities.not_setup_body", {
            defaultValue: "The database tables for Communities (groups/group_members) do not exist yet.",
          })
        );
        if (mountedRef.current) setRows([]);
        return;
      }

      Alert.alert(t("communities.load_failed_title", { defaultValue: "Load failed" }), msg);
      if (mountedRef.current) setRows([]);
      return;
    }

    if (mountedRef.current) {
      setRows((data ?? []) as any);
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (g) => (g.name ?? "").toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const emptyText = useMemo(() => {
    if (loading) return t("communities.loading", { defaultValue: "Loading…" });
    if (query.trim()) return t("communities.empty_search", { defaultValue: "No communities match your search." });
    return t("communities.empty_none", { defaultValue: "No communities yet. Create the first one." });
  }, [loading, query, t]);

  const confirmDelete = (groupId: string, groupName: string) => {
    Alert.alert(
      t("communities.delete_confirm_title", { defaultValue: "Delete community?" }),
      t("communities.delete_confirm_body", {
        defaultValue: "This will permanently delete “{{name}}” and all posts/memberships. This cannot be undone.",
        name: groupName,
      }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("communities.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("delete_group", { target_group: groupId });
            if (error) {
              return Alert.alert(t("communities.delete_failed_title", { defaultValue: "Delete failed" }), error.message);
            }
            Alert.alert(
              t("communities.deleted_title", { defaultValue: "Deleted" }),
              t("communities.deleted_body", { defaultValue: "Community removed." })
            );
            await load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
          {t("communities.title", { defaultValue: "Communities" })}
        </Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          {t("communities.subtitle", { defaultValue: "Groups for riders — open or private with invites." })}
        </Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("communities.search_placeholder", { defaultValue: "Search communities…" })}
          placeholderTextColor={COLORS.muted}
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            color: COLORS.text,
            borderRadius: 14,
            padding: 12,
            fontWeight: "800",
          }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => router.push("/communities/create")}
            style={{
              flex: 1,
              backgroundColor: COLORS.button,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
              {t("communities.create_button", { defaultValue: "Create community" })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: COLORS.chip,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {t("communities.back", { defaultValue: "Back" })}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
          {t("communities.tip_delete", {
            defaultValue: "Tip: Long-press a community to delete (if you have permission).",
          })}
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ paddingTop: 18 }}>
            <Text style={{ color: COLORS.muted }}>{emptyText}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPrivate = item.privacy === "private";
          const canDeleteThis = (!!meId && meId === item.owner_id) || canDeleteAny;

          return (
            <Pressable
              onPress={() => router.push({ pathname: "/communities/[id]", params: { id: item.id } })}
              onLongPress={() => {
                if (!canDeleteThis) return;
                confirmDelete(item.id, item.name);
              }}
              delayLongPress={450}
              style={({ pressed }) => ({
                marginBottom: 12,
                padding: 12,
                borderRadius: 16,
                backgroundColor: pressed ? "rgba(255,255,255,0.04)" : COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text style={{ color: COLORS.muted, marginTop: 6 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: isPrivate ? "rgba(245,196,81,0.16)" : "rgba(255,255,255,0.10)",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {isPrivate
                      ? t("communities.private", { defaultValue: "PRIVATE" })
                      : t("communities.open", { defaultValue: "OPEN" })}
                  </Text>
                </View>
              </View>

              <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
                {t("communities.tap_to_open", { defaultValue: "Tap to open" })}
                {canDeleteThis ? ` • ${t("communities.long_press_to_delete", { defaultValue: "Long-press to delete" })}` : ""}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}