// app/communities/[id]/invite.tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

type GroupRow = {
  id: string;
  privacy: "open" | "private" | string;
  invite_code: string | null;
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
  dangerBg: "#2A1114",
};

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function InviteSettingsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const groupId = params.id;

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [myRoleInGroup, setMyRoleInGroup] = useState<string>("member");
  const [myStatusInGroup, setMyStatusInGroup] = useState<string>("");

  const [appRole, setAppRole] = useState<string>("user"); // profiles.role
  const [isLegacy, setIsLegacy] = useState(false); // profiles.is_legacy
  const [meId, setMeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [privacy, setPrivacy] = useState<"open" | "private">("open");
  const [inviteCode, setInviteCode] = useState("");

  const isOwnerOrMod = useMemo(
    () => myRoleInGroup === "owner" || myRoleInGroup === "moderator",
    [myRoleInGroup]
  );

  const canDeleteCommunity = useMemo(() => {
    if (!group || !meId) return false;
    const owner = meId === group.owner_id;
    const admin = appRole === "admin";
    const legacyMod = appRole === "moderator" && isLegacy === true;
    return owner || admin || legacyMod;
  }, [group, meId, appRole, isLegacy]);

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

    // Load app-level privileges from profiles
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role, is_legacy")
      .eq("id", uid)
      .single();

    if (profErr) console.log("PROFILE LOAD ERROR:", profErr);
    setAppRole(String((prof as any)?.role ?? "user"));
    setIsLegacy(!!(prof as any)?.is_legacy);

    // Load membership in group (for access to this screen)
    const { data: mem } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .maybeSingle();

    const status = String((mem as any)?.status ?? "");
    const role = String((mem as any)?.role ?? "member");
    setMyRoleInGroup(role);
    setMyStatusInGroup(status);

    if (status !== "active" || (role !== "owner" && role !== "moderator")) {
      setLoading(false);
      Alert.alert("Access denied", "Only community owners/moderators can manage invite settings.");
      router.back();
      return;
    }

    const { data: g, error } = await supabase
      .from("groups")
      .select("id, privacy, invite_code, owner_id")
      .eq("id", groupId)
      .single();

    if (error || !g) {
      setLoading(false);
      return Alert.alert("Load failed", error?.message ?? "Group not found");
    }

    setGroup(g as any);
    setPrivacy((g as any).privacy === "private" ? "private" : "open");
    setInviteCode(String((g as any).invite_code ?? ""));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const save = async () => {
    if (!groupId) return;
    if (!isOwnerOrMod) return;

    setSaving(true);

    const nextCode = privacy === "private" ? (inviteCode.trim().toUpperCase() || makeInviteCode()) : null;

    const { error } = await supabase
      .from("groups")
      .update({ privacy, invite_code: nextCode } as any)
      .eq("id", groupId);

    setSaving(false);

    if (error) return Alert.alert("Save failed", error.message);
    Alert.alert("Saved", "Invite settings updated.");
    router.back();
  };

  const deleteCommunity = async () => {
    if (!groupId) return;

    Alert.alert(
      "Delete community?",
      "This will permanently delete the community and all posts/memberships. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("delete_group", { target_group: groupId });
            if (error) return Alert.alert("Delete failed", error.message);

            Alert.alert("Deleted", "Community removed.");
            router.replace("/communities");
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: COLORS.muted }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16, gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 6 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>Invite settings</Text>
        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
          Switch between Open and Private. Private groups use invite codes + approvals.
        </Text>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 18,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Privacy</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setPrivacy("open")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: privacy === "open" ? COLORS.button : COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: privacy === "open" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>Open</Text>
            </Pressable>

            <Pressable
              onPress={() => setPrivacy("private")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: privacy === "private" ? COLORS.button : COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: privacy === "private" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>Private</Text>
            </Pressable>
          </View>

          {privacy === "private" ? (
            <>
              <Text style={{ color: COLORS.muted, fontWeight: "900", marginTop: 6 }}>Invite code</Text>

              <TextInput
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="INVITE CODE"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.bg,
                  color: COLORS.text,
                  borderRadius: 14,
                  padding: 12,
                  fontWeight: "900",
                  letterSpacing: 2,
                  textAlign: "center",
                }}
              />

              <Pressable
                onPress={() => setInviteCode(makeInviteCode())}
                style={{
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                  backgroundColor: COLORS.chip,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Generate new code</Text>
              </Pressable>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Share the code. Riders can join instantly by entering it on the group page.
              </Text>
            </>
          ) : (
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>Open groups do not require a code. Anyone can join.</Text>
          )}
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={{
            backgroundColor: saving ? "#777" : COLORS.button,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>

        {/* Destructive: Delete community (owner/admin/legacy mod) */}
        {canDeleteCommunity ? (
          <View
            style={{
              marginTop: 4,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 18,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Danger zone</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Deleting a community removes all posts, media records, and memberships. This cannot be undone.
            </Text>

            <Pressable
              onPress={deleteCommunity}
              style={{
                backgroundColor: COLORS.dangerBg,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Delete community</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}