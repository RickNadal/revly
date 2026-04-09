import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";
type Placement = "discover" | "following";

type Submission = {
  id: string;
  user_id: string;
  business_name: string;
  contact_email: string;
  sponsor_name: string;
  title: string;
  body: string;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string | null;
  placement: Placement;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
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

export default function AdminHouseSponsorSubmissionsScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const pendingItems = useMemo(() => items.filter((x) => x.status === "pending"), [items]);

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.replace("/sign-in");
      return false;
    }

    const { data: prof, error } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (error) {
      Alert.alert("Access denied", error.message);
      router.back();
      return false;
    }

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

    const { data, error } = await supabase
      .from("house_sponsor_submissions")
      .select("id, user_id, business_name, contact_email, sponsor_name, title, body, cta_text, cta_url, image_url, placement, status, admin_note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      Alert.alert("Load failed", error.message);
      return;
    }

    const rows = (data ?? []) as Submission[];
    setItems(rows);
    setNoteById(Object.fromEntries(rows.map((r) => [r.id, r.admin_note ?? ""])));
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const approve = async (row: Submission) => {
    setSavingId(row.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminId = sessionData.session?.user?.id ?? null;

      const note = (noteById[row.id] ?? "").trim() || null;

      const { data: existing } = await supabase
        .from("ad_campaigns")
        .select("id")
        .eq("owner_user_id", row.user_id)
        .eq("sponsor_type", "house")
        .eq("placement", row.placement)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload = {
        owner_user_id: row.user_id,
        title: row.title,
        sponsor_name: row.sponsor_name,
        sponsor_type: "house",
        badge_text: "House Sponsor",
        body: row.body,
        cta_text: row.cta_text?.trim() || "Learn more",
        cta_url: row.cta_url?.trim() || "/advertise",
        image_url: row.image_url?.trim() || null,
        weight: 10,
        placement: row.placement,
        status: "active",
        is_active: true,
        start_at: null,
        end_at: null,
        min_posts_between: 10,
      } as const;

      const query = existing?.id
        ? supabase.from("ad_campaigns").update(payload as any).eq("id", existing.id)
        : supabase.from("ad_campaigns").insert(payload as any);

      const upsertResult = await query;
      if (upsertResult.error) {
        Alert.alert("Approve failed", upsertResult.error.message);
        return;
      }

      const { error: subErr } = await supabase
        .from("house_sponsor_submissions")
        .update({
          status: "approved",
          admin_note: note,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
        } as any)
        .eq("id", row.id);

      if (subErr) {
        Alert.alert("Approve failed", subErr.message);
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: "approved", admin_note: note } : x)));
      Alert.alert("Approved", "Submission is now live as a House Sponsor campaign.");
    } finally {
      setSavingId(null);
    }
  };

  const reject = async (row: Submission) => {
    const note = (noteById[row.id] ?? "").trim();
    if (!note) {
      Alert.alert("Note required", "Add a short reason before rejecting.");
      return;
    }

    setSavingId(row.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminId = sessionData.session?.user?.id ?? null;

      const { error } = await supabase
        .from("house_sponsor_submissions")
        .update({
          status: "rejected",
          admin_note: note,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
        } as any)
        .eq("id", row.id);

      if (error) {
        Alert.alert("Reject failed", error.message);
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: "rejected", admin_note: note } : x)));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900" }}>House Sponsor Requests</Text>
        <Text style={{ color: COLORS.muted, marginTop: 4 }}>
          Pending: {pendingItems.length}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted }}>{loading ? "Loading..." : "No requests yet."}</Text>}
        renderItem={({ item }) => {
          const busy = savingId === item.id;
          const pending = item.status === "pending";
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {item.sponsor_name}
                </Text>
                <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                  <Text style={{ color: item.status === "approved" ? COLORS.ok : item.status === "rejected" ? COLORS.danger : COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 18 }}>{item.business_name} · {item.contact_email}</Text>
              <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>Placement: {item.placement}</Text>
              <Text style={{ color: COLORS.text, marginTop: 8, fontWeight: "900" }}>{item.title}</Text>
              <Text style={{ color: COLORS.text, marginTop: 6, lineHeight: 20 }}>{item.body}</Text>

              {item.image_url ? (
                <View style={{ marginTop: 10, overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
                  <Image source={{ uri: item.image_url }} style={{ width: "100%", height: 170 }} resizeMode="cover" />
                </View>
              ) : null}

              <TextInput
                value={noteById[item.id] ?? ""}
                onChangeText={(value) => setNoteById((prev) => ({ ...prev, [item.id]: value }))}
                placeholder={pending ? "Admin note (required for reject)" : "Admin note"}
                placeholderTextColor={COLORS.muted}
                multiline
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 74,
                  color: COLORS.text,
                  backgroundColor: COLORS.chip,
                  textAlignVertical: "top",
                }}
              />

              {pending ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={() => approve(item)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: "center",
                      backgroundColor: busy ? "#6A6A73" : COLORS.button,
                    }}
                  >
                    <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{busy ? "Saving..." : "Approve & Publish"}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => reject(item)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: "center",
                      backgroundColor: COLORS.chip,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: "900" }}>Reject</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
