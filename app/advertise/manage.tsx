import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getBusinessAccessSummary, type BusinessAccessSummary, type BusinessTier } from "../../lib/ads/businessAccess";
import { supabase } from "../../lib/supabase";
import { uploadMediaToSupabase } from "../../lib/uploadMedia";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
};

type Placement = "discover" | "following";
type CampaignStatus = "draft" | "pending_review" | "active" | "paused" | "rejected" | "ended";

type CampaignRow = {
  id: string;
  title: string | null;
  sponsor_name: string | null;
  body: string;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string | null;
  placement: Placement;
  status: CampaignStatus;
  is_active: boolean;
  moderation_note: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  weight: number | null;
  min_posts_between: number | null;
  monthly_impression_cap: number | null;
  created_at: string;
  updated_at: string;
};

type CampaignMetrics = {
  impressions: number;
  clicks: number;
  hides: number;
};

const emptyForm = {
  title: "",
  sponsorName: "",
  body: "",
  ctaText: "",
  ctaUrl: "",
  imageUrl: "",
  placement: "discover" as Placement,
};

function allowedPlacementsForTier(tier: BusinessTier | null): Placement[] {
  if (!tier) return ["discover"];
  return tier.following_enabled ? ["discover", "following"] : ["discover"];
}

function statusTone(status: CampaignStatus) {
  if (status === "active") return "#7CFFB2";
  if (status === "pending_review") return "#F5C451";
  if (status === "paused") return "#A7A7B5";
  if (status === "rejected") return "#FF7C7C";
  return "#D8A733";
}

export default function AdvertiseManageScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [access, setAccess] = useState<BusinessAccessSummary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [metricsByCampaign, setMetricsByCampaign] = useState<Record<string, CampaignMetrics>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);

    const summary = await getBusinessAccessSummary();
    setAccess(summary);

    if (!summary.userId) {
      setCampaigns([]);
      setMetricsByCampaign({});
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("ad_campaigns")
      .select(
        "id, title, sponsor_name, body, cta_text, cta_url, image_url, placement, status, is_active, moderation_note, rejection_reason, reviewed_at, weight, min_posts_between, monthly_impression_cap, created_at, updated_at"
      )
      .eq("owner_user_id", summary.userId)
      .order("updated_at", { ascending: false });

    if (error) {
      Alert.alert(t("advertise_manage.load_failed_title", { defaultValue: "Load failed" }), error.message);
      setCampaigns([]);
      setMetricsByCampaign({});
      setLoading(false);
      return;
    }

    const nextCampaigns = (data ?? []) as CampaignRow[];
    setCampaigns(nextCampaigns);

    const ids = nextCampaigns.map((row) => row.id);
    if (ids.length === 0) {
      setMetricsByCampaign({});
    } else {
      const { data: events } = await supabase.from("ad_events").select("campaign_id, event_type").in("campaign_id", ids);
      const nextMetrics: Record<string, CampaignMetrics> = {};

      for (const event of events ?? []) {
        const campaignId = String((event as any).campaign_id ?? "");
        const eventType = String((event as any).event_type ?? "");
        if (!campaignId) continue;
        if (!nextMetrics[campaignId]) nextMetrics[campaignId] = { impressions: 0, clicks: 0, hides: 0 };
        if (eventType === "impression") nextMetrics[campaignId].impressions += 1;
        if (eventType === "click") nextMetrics[campaignId].clicks += 1;
        if (eventType === "hide") nextMetrics[campaignId].hides += 1;
      }

      setMetricsByCampaign(nextMetrics);
    }

    setLoading(false);
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const allowedPlacements = useMemo(() => allowedPlacementsForTier(access?.tier ?? null), [access?.tier]);
  const slotsUsed = access?.activeCampaignCount ?? 0;
  const maxCampaigns = access?.tier?.max_active_campaigns ?? 0;
  const hasCapacity = editingId !== null || slotsUsed < maxCampaigns;
  const canManage = access?.canAdvertise === true;
  const formValid = useMemo(() => {
    return form.title.trim().length >= 3 && form.sponsorName.trim().length >= 2 && form.body.trim().length >= 12;
  }, [form.body, form.sponsorName, form.title]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setUploadProgress(null);
  };

  const startEditing = (row: CampaignRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title ?? "",
      sponsorName: row.sponsor_name ?? "",
      body: row.body ?? "",
      ctaText: row.cta_text ?? "",
      ctaUrl: row.cta_url ?? "",
      imageUrl: row.image_url ?? "",
      placement: row.placement,
    });
  };

  const pickCampaignImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert(
        t("advertise_manage.permission_title", { defaultValue: "Permission needed" }),
        t("advertise_manage.permission_body", { defaultValue: "Allow photo access to upload a campaign image." })
      );
    }

    if (!access?.userId) {
      router.replace("/sign-in");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    try {
      setUploadingImage(true);
      setUploadProgress(0);
      const uri = picked.assets[0].uri;
      const clean = String(uri).split("?")[0].split("#")[0];
      const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
      const path = `campaigns/${access.userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const publicUrl = await uploadMediaToSupabase(uri, "post-images", path, "image", (progress) => setUploadProgress(progress));
      setForm((prev) => ({ ...prev, imageUrl: publicUrl }));
    } catch (error: any) {
      Alert.alert(t("advertise_manage.upload_failed_title", { defaultValue: "Upload failed" }), error?.message ?? "Upload failed");
    } finally {
      setUploadingImage(false);
      setUploadProgress(null);
    }
  };

  const saveCampaign = async (nextStatus: CampaignStatus) => {
    if (!access?.userId) {
      router.replace("/sign-in");
      return;
    }

    if (!canManage) {
      Alert.alert(
        t("advertise_manage.access_required_title", { defaultValue: "Business access required" }),
        t("advertise_manage.access_required_body", { defaultValue: "Your dealer account needs to be active before you can manage campaigns." })
      );
      return;
    }

    if (!formValid) {
      Alert.alert(
        t("advertise_manage.invalid_title", { defaultValue: "Missing info" }),
        t("advertise_manage.invalid_body", { defaultValue: "Add a title, sponsor name, and enough body copy to review the campaign." })
      );
      return;
    }

    if (!allowedPlacements.includes(form.placement)) {
      Alert.alert(
        t("advertise_manage.placement_locked_title", { defaultValue: "Placement not allowed" }),
        t("advertise_manage.placement_locked_body", { defaultValue: "Your current tier does not include that placement." })
      );
      return;
    }

    if (!hasCapacity) {
      Alert.alert(
        t("advertise_manage.limit_title", { defaultValue: "Campaign limit reached" }),
        t("advertise_manage.limit_body", {
          defaultValue: "Your current tier allows up to {{max}} active or queued campaigns.",
          max: maxCampaigns,
        })
      );
      return;
    }

    setSaving(true);

    const payload = {
      owner_user_id: access.userId,
      title: form.title.trim(),
      sponsor_name: form.sponsorName.trim(),
      sponsor_type: "business",
      badge_text: "Sponsored",
      body: form.body.trim(),
      cta_text: form.ctaText.trim() || null,
      cta_url: form.ctaUrl.trim() || null,
      image_url: form.imageUrl.trim() || null,
      placement: form.placement,
      status: nextStatus,
      is_active: false,
      weight: 1,
      min_posts_between: 10,
      monthly_impression_cap: null,
    } as const;

    const query = editingId
      ? supabase.from("ad_campaigns").update(payload as any).eq("id", editingId).eq("owner_user_id", access.userId)
      : supabase.from("ad_campaigns").insert(payload as any);

    const { error } = await query;
    setSaving(false);

    if (error) {
      return Alert.alert(t("advertise_manage.save_failed_title", { defaultValue: "Save failed" }), error.message);
    }

    Alert.alert(
      t("advertise_manage.saved_title", { defaultValue: "Saved" }),
      nextStatus === "pending_review"
        ? t("advertise_manage.saved_review_body", { defaultValue: "Campaign saved and sent for review." })
        : t("advertise_manage.saved_draft_body", { defaultValue: "Campaign draft saved." })
    );

    resetForm();
    await load();
  };

  const updateExistingStatus = async (row: CampaignRow, nextStatus: CampaignStatus, active: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("ad_campaigns")
      .update({ 
        status: nextStatus, 
        is_active: active,
        disabled_at: !active ? new Date().toISOString() : null,
      } as any)
      .eq("id", row.id)
      .eq("owner_user_id", access?.userId ?? "");
    setSaving(false);

    if (error) {
      return Alert.alert(t("advertise_manage.update_failed_title", { defaultValue: "Update failed" }), error.message);
    }

    await load();
  };

  const PlacementChip = ({ label, value }: { label: string; value: Placement }) => {
    const active = form.placement === value;
    const disabled = !allowedPlacements.includes(value);

    return (
      <Pressable
        onPress={() => !disabled && setForm((prev) => ({ ...prev, placement: value }))}
        disabled={disabled || saving || uploadingImage}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: active ? "#7CFFB2" : COLORS.border,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
          {t("advertise_manage.title", { defaultValue: "Campaign manager" })}
        </Text>

        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>
          {t("advertise_manage.subtitle", {
            defaultValue: "Build dealer campaigns, keep drafts in one place, and send placements to moderation review when they are ready.",
          })}
        </Text>

        <View style={{ marginTop: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {t("advertise_manage.access_title", { defaultValue: "Dealer capacity" })}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            {access?.tier
              ? t("advertise_manage.access_body", {
                  defaultValue: "Tier: {{tier}}. Used slots: {{used}} / {{max}}.",
                  tier: access.tier.name,
                  used: slotsUsed,
                  max: maxCampaigns,
                })
              : t("advertise_manage.access_missing", { defaultValue: "No active dealer tier found yet." })}
          </Text>

          {!canManage && !loading ? (
            <Pressable onPress={() => router.push("/advertise/request")} style={{ marginTop: 12, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                {t("advertise_manage.complete_access", { defaultValue: "Complete business access first" })}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ marginTop: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {editingId
                ? t("advertise_manage.edit_title", { defaultValue: "Edit campaign" })
                : t("advertise_manage.new_title", { defaultValue: "New campaign" })}
            </Text>
            {editingId ? (
              <Pressable onPress={resetForm} disabled={saving || uploadingImage}>
                <Text style={{ color: COLORS.muted, fontWeight: "900" }}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </Pressable>
            ) : null}
          </View>

          <TextInput value={form.title} onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))} placeholder={t("advertise_manage.title_placeholder", { defaultValue: "Campaign title" })} placeholderTextColor={COLORS.muted} style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text, fontWeight: "800" }} />

          <TextInput value={form.sponsorName} onChangeText={(value) => setForm((prev) => ({ ...prev, sponsorName: value }))} placeholder={t("advertise_manage.sponsor_placeholder", { defaultValue: "Sponsor / dealership name" })} placeholderTextColor={COLORS.muted} style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text, fontWeight: "800" }} />

          <Text style={{ color: COLORS.muted, fontWeight: "900", marginTop: 12 }}>{t("advertise_manage.placement_title", { defaultValue: "Placement" })}</Text>

          <View style={{ marginTop: 10, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <PlacementChip label={t("feed.discover", { defaultValue: "Discover" })} value="discover" />
            <PlacementChip label={t("feed.following", { defaultValue: "Following" })} value="following" />
          </View>

          <TextInput value={form.body} onChangeText={(value) => setForm((prev) => ({ ...prev, body: value }))} placeholder={t("advertise_manage.body_placeholder", { defaultValue: "Body copy for the sponsored post" })} placeholderTextColor={COLORS.muted} multiline style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text, minHeight: 120, textAlignVertical: "top" }} />

          <TextInput value={form.ctaText} onChangeText={(value) => setForm((prev) => ({ ...prev, ctaText: value }))} placeholder={t("advertise_manage.cta_text_placeholder", { defaultValue: "CTA text (optional)" })} placeholderTextColor={COLORS.muted} style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }} />

          <TextInput value={form.ctaUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, ctaUrl: value }))} placeholder={t("advertise_manage.cta_url_placeholder", { defaultValue: "CTA URL or in-app route (optional)" })} placeholderTextColor={COLORS.muted} autoCapitalize="none" style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }} />

          <TextInput value={form.imageUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, imageUrl: value }))} placeholder={t("advertise_manage.image_placeholder", { defaultValue: "Image URL (optional)" })} placeholderTextColor={COLORS.muted} autoCapitalize="none" style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }} />

          {form.imageUrl.trim() ? (
            <View style={{ marginTop: 10, overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
              <Image source={{ uri: form.imageUrl.trim() }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
            </View>
          ) : null}

          <Pressable onPress={() => void pickCampaignImage()} disabled={uploadingImage || saving} style={{ marginTop: 10, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 12, alignItems: "center", opacity: uploadingImage || saving ? 0.6 : 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {uploadingImage
                ? t("advertise_manage.uploading_image", { defaultValue: "Uploading image..." })
                : t("advertise_manage.upload_image", { defaultValue: "Upload campaign image" })}
            </Text>
          </Pressable>

          {uploadProgress !== null ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>{t("advertise_manage.uploading_image", { defaultValue: "Uploading image..." })}</Text>
                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "900" }}>{Math.round(uploadProgress * 100)}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: COLORS.card, overflow: "hidden" }}>
                <View style={{ height: "100%", borderRadius: 999, backgroundColor: COLORS.button, width: `${Math.round(uploadProgress * 100)}%` }} />
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable onPress={() => void saveCampaign("draft")} disabled={saving || uploadingImage || !formValid || !hasCapacity} style={{ flex: 1, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 13, alignItems: "center", opacity: saving || uploadingImage || !formValid || !hasCapacity ? 0.5 : 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("advertise_manage.save_draft", { defaultValue: "Save draft" })}</Text>
            </Pressable>

            <Pressable onPress={() => void saveCampaign("pending_review")} disabled={saving || uploadingImage || !formValid || !hasCapacity} style={{ flex: 1, backgroundColor: COLORS.button, borderRadius: 14, paddingVertical: 13, alignItems: "center", opacity: saving || uploadingImage || !formValid || !hasCapacity ? 0.5 : 1 }}>
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                {saving ? t("advertise_manage.saving", { defaultValue: "Saving..." }) : t("advertise_manage.submit_review", { defaultValue: "Submit for review" })}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{t("advertise_manage.existing_title", { defaultValue: "Your campaigns" })}</Text>

          {loading ? (
            <Text style={{ color: COLORS.muted, marginTop: 10 }}>{t("common.loading", { defaultValue: "Loading..." })}</Text>
          ) : campaigns.length === 0 ? (
            <Text style={{ color: COLORS.muted, marginTop: 10 }}>{t("advertise_manage.empty", { defaultValue: "No campaigns yet. Create your first dealer campaign above." })}</Text>
          ) : (
            campaigns.map((row) => {
              const metrics = metricsByCampaign[row.id] ?? { impressions: 0, clicks: 0, hides: 0 };

              return (
                <View key={row.id} style={{ marginTop: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14 }}>
                  {row.image_url ? (
                    <View style={{ marginBottom: 12, overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                      <Image source={{ uri: row.image_url }} style={{ width: "100%", height: 160 }} resizeMode="cover" />
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }}>{row.title?.trim() || t("advertise_manage.untitled", { defaultValue: "Untitled campaign" })}</Text>
                    <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: statusTone(row.status), fontWeight: "900", fontSize: 12 }}>{row.status}</Text>
                    </View>
                  </View>

                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>{row.sponsor_name || t("ads.sponsor_fallback", { defaultValue: "Sponsor" })} · {row.placement}</Text>
                  <Text style={{ color: COLORS.text, marginTop: 10, lineHeight: 20 }}>{row.body}</Text>

                  {row.moderation_note || row.rejection_reason ? (
                    <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                      {row.rejection_reason ? (
                        <>
                          <Text style={{ color: "#FF7C7C", fontWeight: "900", fontSize: 12 }}>
                            {t("advertise_manage.rejection_reason_label", { defaultValue: "Rejection reason" })}
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 4, lineHeight: 19 }}>{row.rejection_reason}</Text>
                        </>
                      ) : null}

                      {row.moderation_note ? (
                        <>
                          <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 12, marginTop: row.rejection_reason ? 10 : 0 }}>
                            {t("advertise_manage.moderation_note_label", { defaultValue: "Moderator note" })}
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 4, lineHeight: 19 }}>{row.moderation_note}</Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{t("advertise_manage.metric_impressions", { defaultValue: "Impressions" })}: {metrics.impressions}</Text>
                    </View>
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{t("advertise_manage.metric_clicks", { defaultValue: "Clicks" })}: {metrics.clicks}</Text>
                    </View>
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{t("advertise_manage.metric_hides", { defaultValue: "Hides" })}: {metrics.hides}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <Pressable onPress={() => startEditing(row)} style={{ backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.edit", { defaultValue: "Edit" })}</Text>
                    </Pressable>

                    {row.status === "active" ? (
                      <Pressable onPress={() => void updateExistingStatus(row, "paused", false)} style={{ backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("advertise_manage.pause", { defaultValue: "Pause" })}</Text>
                      </Pressable>
                    ) : row.status === "paused" || row.status === "rejected" ? (
                      <Pressable onPress={() => void updateExistingStatus(row, "pending_review", false)} style={{ backgroundColor: COLORS.button, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                        <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{t("advertise_manage.resubmit", { defaultValue: "Resubmit" })}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Pressable onPress={() => router.back()} style={{ marginTop: 18, alignItems: "center", padding: 10 }}>
          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>{t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}