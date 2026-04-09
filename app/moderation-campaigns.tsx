import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";
type CampaignStatus = "draft" | "pending_review" | "active" | "paused" | "rejected" | "ended";

type CampaignRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  sponsor_name: string | null;
  body: string;
  image_url: string | null;
  placement: "discover" | "following";
  status: CampaignStatus;
  is_active: boolean;
  disabled_at: string | null;
  moderation_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type Metrics = {
  impressions: number;
  clicks: number;
  hides: number;
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
  warn: "#F5C451",
  danger: "#FF7C7C",
};

function statusColor(status: CampaignStatus) {
  if (status === "active") return COLORS.ok;
  if (status === "pending_review") return COLORS.warn;
  if (status === "rejected") return COLORS.danger;
  return COLORS.muted;
}

export default function ModerationCampaignsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const [meRole, setMeRole] = useState<ProfileRole>("user");
  const [meUserId, setMeUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "live">("queue");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [metricsByCampaign, setMetricsByCampaign] = useState<Record<string, Metrics>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureModOrAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      if (mountedRef.current) setLoading(false);
      router.replace("/sign-in");
      return false;
    }

    if (mountedRef.current) setMeUserId(session.user.id);

    const { data: prof, error } = await supabase.from("profiles").select("id, role").eq("id", session.user.id).single();
    if (error) {
      if (mountedRef.current) setLoading(false);
      Alert.alert(t("moderation.access_denied_title", { defaultValue: "Access denied" }), error.message);
      router.back();
      return false;
    }

    const role = ((prof as any)?.role ?? "user") as ProfileRole;
    if (mountedRef.current) setMeRole(role);

    if (role !== "moderator" && role !== "admin") {
      if (mountedRef.current) setLoading(false);
      Alert.alert(
        t("moderation.access_denied_title", { defaultValue: "Access denied" }),
        t("moderation.mods_only_body", { defaultValue: "This screen is moderators/admins only." })
      );
      router.back();
      return false;
    }

    return true;
  };

  const load = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    const ok = await ensureModOrAdmin();
    if (!ok) return;

    const statuses = tab === "queue" ? ["pending_review", "rejected", "draft"] : ["active", "paused", "ended"];
    const { data, error } = await supabase
      .from("ad_campaigns")
      .select("id, owner_user_id, title, sponsor_name, body, image_url, placement, status, is_active, disabled_at, moderation_note, rejection_reason, created_at, updated_at")
      .in("status", statuses)
      .order("updated_at", { ascending: false });

    if (error) {
      if (mountedRef.current) setLoading(false);
      Alert.alert(t("advertise_moderation.load_failed_title", { defaultValue: "Load failed" }), error.message);
      return;
    }

    const campaignRows = (data ?? []) as CampaignRow[];
    const ids = campaignRows.map((row) => row.id);
    const nextMetrics: Record<string, Metrics> = {};

    if (ids.length > 0) {
      const { data: events } = await supabase.from("ad_events").select("campaign_id, event_type").in("campaign_id", ids);
      for (const row of events ?? []) {
        const campaignId = String((row as any).campaign_id ?? "");
        const eventType = String((row as any).event_type ?? "");
        if (!campaignId) continue;
        if (!nextMetrics[campaignId]) nextMetrics[campaignId] = { impressions: 0, clicks: 0, hides: 0 };
        if (eventType === "impression") nextMetrics[campaignId].impressions += 1;
        if (eventType === "click") nextMetrics[campaignId].clicks += 1;
        if (eventType === "hide") nextMetrics[campaignId].hides += 1;
      }
    }

    if (mountedRef.current) {
      setRows(campaignRows);
      setMetricsByCampaign(nextMetrics);
      setNoteDrafts(Object.fromEntries(campaignRows.map((row) => [row.id, row.moderation_note ?? ""])));
      setReasonDrafts(Object.fromEntries(campaignRows.map((row) => [row.id, row.rejection_reason ?? ""])));
      setLoading(false);
    }
  }, [t, tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const updateCampaign = async (row: CampaignRow, nextStatus: CampaignStatus, isActive: boolean) => {
    const moderationNote = noteDrafts[row.id]?.trim() || null;
    const rejectionReason = reasonDrafts[row.id]?.trim() || null;

    if (nextStatus === "rejected" && !rejectionReason) {
      return Alert.alert(
        t("advertise_moderation.reason_required_title", { defaultValue: "Rejection reason required" }),
        t("advertise_moderation.reason_required_body", { defaultValue: "Add a rejection reason before rejecting the campaign." })
      );
    }

    const payload = {
      status: nextStatus,
      is_active: isActive,
      disabled_at: !isActive && row.is_active ? new Date().toISOString() : isActive ? null : row.disabled_at,
      moderation_note: moderationNote,
      rejection_reason: nextStatus === "rejected" ? rejectionReason : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: meUserId,
    } as const;

    const { error } = await supabase.from("ad_campaigns").update(payload as any).eq("id", row.id);
    if (error) {
      return Alert.alert(t("advertise_moderation.update_failed_title", { defaultValue: "Update failed" }), error.message);
    }
    await load();
  };

  const getReEnableTime = (disabledAt: string | null) => {
    if (!disabledAt) return null;
    const disabledTime = new Date(disabledAt).getTime();
    const reEnableTime = disabledTime + 36 * 60 * 60 * 1000; // 36 hours
    const now = new Date().getTime();
    const remainingMs = reEnableTime - now;
    
    if (remainingMs <= 0) return null;
    
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    
    return { hours, minutes, remainingMs };
  };

  const emptyText = useMemo(() => {
    if (loading) return t("common.loading", { defaultValue: "Loading..." });
    return tab === "queue"
      ? t("advertise_moderation.empty_queue", { defaultValue: "No campaigns waiting for review." })
      : t("advertise_moderation.empty_live", { defaultValue: "No active or paused campaigns." });
  }, [loading, t, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("advertise_moderation.title", { defaultValue: "Campaign moderation" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("moderation.role_prefix", { defaultValue: "Role:" })} {meRole}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => setTab("queue")}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: tab === "queue" ? COLORS.button : COLORS.card, borderWidth: 1, borderColor: tab === "queue" ? "#7CFFB2" : COLORS.border, alignItems: "center" }}
          >
            <Text style={{ color: tab === "queue" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("advertise_moderation.queue_tab", { defaultValue: "Review queue" })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("live")}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: tab === "live" ? COLORS.button : COLORS.card, borderWidth: 1, borderColor: tab === "live" ? "#7CFFB2" : COLORS.border, alignItems: "center" }}
          >
            <Text style={{ color: tab === "live" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("advertise_moderation.live_tab", { defaultValue: "Live campaigns" })}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 24, 36) }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, marginTop: 12 }}>{emptyText}</Text>}
        renderItem={({ item }) => {
          const metrics = metricsByCampaign[item.id] ?? { impressions: 0, clicks: 0, hides: 0 };
          return (
            <View style={{ marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
              {item.image_url ? (
                <View style={{ marginBottom: 12, overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                  <Image source={{ uri: item.image_url }} style={{ width: "100%", height: 160 }} resizeMode="cover" />
                </View>
              ) : null}

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {item.title?.trim() || t("advertise_manage.untitled", { defaultValue: "Untitled campaign" })}
                </Text>
                <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: statusColor(item.status), fontWeight: "900", fontSize: 12 }}>{item.status}</Text>
                </View>
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                {(item.sponsor_name?.trim() || t("ads.sponsor_fallback", { defaultValue: "Sponsor" })) + " · " + item.placement}
              </Text>
              <Text style={{ color: COLORS.text, marginTop: 10, lineHeight: 20 }}>{item.body}</Text>

              {!item.is_active && item.disabled_at ? (() => {
                const reEnableInfo = getReEnableTime(item.disabled_at);
                return (
                  <View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: "rgba(255, 123, 123, 0.1)", borderWidth: 1, borderColor: COLORS.danger }}>
                    <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 12 }}>
                      DISABLED • Will re-enable in {reEnableInfo ? `${reEnableInfo.hours}h ${reEnableInfo.minutes}m` : "calculating..."}
                    </Text>
                  </View>
                );
              })() : null}

              <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 12, marginTop: 12 }}>
                {t("advertise_moderation.note_label", { defaultValue: "Moderator note" })}
              </Text>
              <TextInput
                value={noteDrafts[item.id] ?? ""}
                onChangeText={(value) => setNoteDrafts((prev) => ({ ...prev, [item.id]: value }))}
                placeholder={t("advertise_moderation.note_placeholder", { defaultValue: "Optional note visible to the dealer" })}
                placeholderTextColor={COLORS.muted}
                multiline
                style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, minHeight: 78, backgroundColor: COLORS.chip, color: COLORS.text, textAlignVertical: "top" }}
              />

              <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 12, marginTop: 12 }}>
                {t("advertise_moderation.reason_label", { defaultValue: "Rejection reason" })}
              </Text>
              <TextInput
                value={reasonDrafts[item.id] ?? ""}
                onChangeText={(value) => setReasonDrafts((prev) => ({ ...prev, [item.id]: value }))}
                placeholder={t("advertise_moderation.reason_placeholder", { defaultValue: "Required if you reject this campaign" })}
                placeholderTextColor={COLORS.muted}
                multiline
                style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, minHeight: 78, backgroundColor: COLORS.chip, color: COLORS.text, textAlignVertical: "top" }}
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {t("advertise_manage.metric_impressions", { defaultValue: "Impressions" })}: {metrics.impressions}
                  </Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {t("advertise_manage.metric_clicks", { defaultValue: "Clicks" })}: {metrics.clicks}
                  </Text>
                </View>
                <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {t("advertise_manage.metric_hides", { defaultValue: "Hides" })}: {metrics.hides}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                {item.status !== "active" ? (
                  <Pressable onPress={() => void updateCampaign(item, "active", true)} style={{ backgroundColor: COLORS.button, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{t("advertise_moderation.approve", { defaultValue: "Approve + activate" })}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => void updateCampaign(item, "paused", false)} style={{ backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("advertise_manage.pause", { defaultValue: "Pause" })}</Text>
                  </Pressable>
                )}

                <Pressable onPress={() => void updateCampaign(item, "rejected", false)} style={{ backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900" }}>{t("advertise_moderation.reject", { defaultValue: "Reject" })}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
