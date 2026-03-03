// app/communities/[id]/members.tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

type MemberRow = {
  group_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member" | string;
  status: "active" | "pending" | "rejected" | string;
  created_at: string;
};

type ProfileRow = { id: string; full_name: string | null };

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
};

export default function MembersScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const groupId = params.id;

  const [meId, setMeId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("member");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [namesById, setNamesById] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isOwnerOrMod = myRole === "owner" || myRole === "moderator";

  const load = async () => {
    if (!groupId) return;

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;
    setMeId(uid);

    const { data: myMem } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .maybeSingle();

    const role = String((myMem as any)?.role ?? "member");
    const status = String((myMem as any)?.status ?? "");
    setMyRole(role);

    if (status !== "active") {
      setLoading(false);
      Alert.alert("Access denied", "You must be an active member to view the member list.");
      router.back();
      return;
    }

    const { data: mems, error } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, status, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error) {
      setLoading(false);
      return Alert.alert("Load failed", error.message);
    }

    const rows = (mems ?? []) as any as MemberRow[];
    const userIds = Array.from(new Set(rows.map((m) => m.user_id)));

    const { data: profs, error: pErr } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : ({ data: [], error: null } as any);

    if (pErr) console.log("PROFILES ERROR:", pErr);

    const map = new Map<string, string>();
    for (const p of (profs ?? []) as any as ProfileRow[]) {
      map.set(p.id, p.full_name ?? "Rider");
    }

    if (mountedRef.current) {
      setMembers(rows);
      setNamesById(map);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const pending = useMemo(() => members.filter((m) => m.status === "pending"), [members]);
  const active = useMemo(() => members.filter((m) => m.status === "active"), [members]);

  const approve = async (userId: string) => {
    if (!groupId) return;
    if (!isOwnerOrMod) return;

    const { error } = await supabase.from("group_members").update({ status: "active" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) return Alert.alert("Approve failed", error.message);
    load();
  };

  const deny = async (userId: string) => {
    if (!groupId) return;
    if (!isOwnerOrMod) return;

    const { error } = await supabase.from("group_members").update({ status: "rejected" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) return Alert.alert("Deny failed", error.message);
    load();
  };

  const confirmPromoteToMod = (userId: string, name: string) => {
    Alert.alert(
      "Promote to moderator?",
      `${name} will be able to:\n\n• Approve/deny join requests\n• Manage invite settings (lock/unlock + code)\n• Remove bad photos inside this community\n\nContinue?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Promote", style: "default", onPress: () => promoteToMod(userId) },
      ]
    );
  };

  const promoteToMod = async (userId: string) => {
    if (!groupId) return;
    if (!isOwnerOrMod) return;

    const { error } = await supabase.from("group_members").update({ role: "moderator" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) return Alert.alert("Promote failed", error.message);
    load();
  };

  const removeMod = async (userId: string) => {
    if (!groupId) return;
    if (!isOwnerOrMod) return;

    const { error } = await supabase.from("group_members").update({ role: "member" }).eq("group_id", groupId).eq("user_id", userId);
    if (error) return Alert.alert("Update failed", error.message);
    load();
  };

  const listData = useMemo(() => (isOwnerOrMod ? [...pending, ...active] : active), [isOwnerOrMod, pending, active]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 6 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>Members</Text>
        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
          Active: {active.length} • Pending: {pending.length}
          {isOwnerOrMod ? " • Staff tools enabled" : ""}
        </Text>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(m) => `${m.group_id}:${m.user_id}:${m.status}:${m.role}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 18 }}>
            <Text style={{ color: COLORS.muted }}>{loading ? "Loading…" : "No members yet."}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = namesById.get(item.user_id) ?? "Rider";
          const isPendingRow = item.status === "pending";
          const isActiveRow = item.status === "active";
          const isMe = !!meId && item.user_id === meId;

          const isOwnerRow = item.role === "owner";
          const canChangeRole = isOwnerOrMod && isActiveRow && !isOwnerRow && !isMe;

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
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{name}</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "800" }}>
                {String(item.status).toUpperCase()} • {String(item.role).toUpperCase()}
                {isMe ? " • YOU" : ""}
              </Text>

              {isOwnerOrMod && isPendingRow ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => approve(item.user_id)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: "rgba(124,255,178,0.12)",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Approve</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => deny(item.user_id)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: "rgba(255,90,95,0.12)",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Deny</Text>
                  </Pressable>
                </View>
              ) : null}

              {canChangeRole ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  {item.role === "member" ? (
                    <Pressable
                      onPress={() => confirmPromoteToMod(item.user_id, name)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 14,
                        backgroundColor: "rgba(245,196,81,0.16)",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Promote to mod</Text>
                    </Pressable>
                  ) : null}

                  {item.role === "moderator" ? (
                    <Pressable
                      onPress={() => removeMod(item.user_id)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 14,
                        backgroundColor: COLORS.chip,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Remove mod</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}