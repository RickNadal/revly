// app/moderation.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ReportRow = {
  id: string;
  created_at: string;
  post_id: string;
  reporter_id: string;
  reason: string | null;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
};

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  user_id: string;
  visibility: "public" | "private";
  post_media: { url: string; sort_order: number }[];
};

type ProfileRole = "user" | "moderator" | "admin";

type ModerationItem = {
  report: ReportRow;
  post: PostRow | null;
  author_name: string;
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

export default function ModerationScreen() {
  const { t } = useTranslation();

  const [meRole, setMeRole] = useState<ProfileRole>("user");
  const [tab, setTab] = useState<"open" | "resolved">("open");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ModerationItem[]>([]);

  const [onlyTwoPlus, setOnlyTwoPlus] = useState(false);
  const [includeDismissed, setIncludeDismissed] = useState(false);

  const mountedRef = useRef(true);
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

    const uid = session.user.id;

    const { data: prof, error } = await supabase.from("profiles").select("id, role").eq("id", uid).single();

    if (error) {
      console.log("MOD CHECK ERROR:", error);
      if (mountedRef.current) setLoading(false);
      Alert.alert(
        t("moderation.access_denied_title", { defaultValue: "Access denied" }),
        t("moderation.could_not_verify_body", { defaultValue: "Could not verify moderator status." })
      );
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

  const load = async () => {
    if (mountedRef.current) setLoading(true);

    const ok = await ensureModOrAdmin();
    if (!ok) return;

    const statuses: ("open" | "resolved" | "dismissed")[] =
      tab === "open" ? ["open"] : includeDismissed ? ["resolved", "dismissed"] : ["resolved"];

    const { data: reports, error: repErr } = await supabase
      .from("post_reports")
      .select("id, created_at, post_id, reporter_id, reason, details, status")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(200);

    if (repErr) {
      if (mountedRef.current) setLoading(false);
      Alert.alert(t("moderation.load_failed_title", { defaultValue: "Load failed" }), repErr.message);
      return;
    }

    const reportList = (reports ?? []) as ReportRow[];
    const postIds = Array.from(new Set(reportList.map((r) => r.post_id)));

    const postsById = new Map<string, PostRow>();
    const authorIds: string[] = [];

    if (postIds.length > 0) {
      const { data: posts, error: postErr } = await supabase
        .from("posts")
        .select("id, caption, created_at, user_id, visibility, post_media(url, sort_order)")
        .in("id", postIds);

      if (postErr) console.log("POST LOAD ERROR:", postErr);

      for (const p of (posts ?? []) as any[]) {
        const sorted = (p.post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        postsById.set(p.id, { ...p, post_media: sorted });
        authorIds.push(p.user_id);
      }
    }

    const uniqueAuthorIds = Array.from(new Set(authorIds));
    const nameById = new Map<string, string>();

    if (uniqueAuthorIds.length > 0) {
      const { data: profs, error: profErr } = await supabase.from("profiles").select("id, full_name").in("id", uniqueAuthorIds);

      if (profErr) console.log("AUTHOR PROFILES ERROR:", profErr);
      for (const pr of profs ?? []) {
        nameById.set((pr as any).id, (pr as any).full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
      }
    }

    const combined: ModerationItem[] = reportList.map((r) => {
      const post = postsById.get(r.post_id) ?? null;
      const authorName = post ? nameById.get(post.user_id) ?? t("feed.rider_fallback", { defaultValue: "Rider" }) : t("moderation.unknown", { defaultValue: "Unknown" });
      return { report: r, post, author_name: authorName };
    });

    if (mountedRef.current) {
      setRows(combined);
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, includeDismissed])
  );

  const resolveReport = async (reportId: string) => {
    const { error } = await supabase.from("post_reports").update({ status: "resolved" }).eq("id", reportId);

    if (error) return Alert.alert(t("moderation.update_failed_title", { defaultValue: "Update failed" }), error.message);
    setRows((prev) => prev.filter((x) => x.report.id !== reportId));
  };

  const dismissReport = async (reportId: string) => {
    const { error } = await supabase.from("post_reports").update({ status: "dismissed" }).eq("id", reportId);

    if (error) return Alert.alert(t("moderation.update_failed_title", { defaultValue: "Update failed" }), error.message);
    setRows((prev) => prev.filter((x) => x.report.id !== reportId));
  };

  const deletePostAsMod = async (postId: string, reportId?: string) => {
    Alert.alert(
      t("moderation.remove_post_title", { defaultValue: "Remove post?" }),
      t("moderation.remove_post_body", { defaultValue: "This will delete the post. This cannot be undone." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("moderation.delete_post", { defaultValue: "Delete post" }),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("mod_delete_post", { target_post: postId });
            if (error) return Alert.alert(t("moderation.delete_failed_title", { defaultValue: "Delete failed" }), error.message);

            if (reportId) {
              await supabase.from("post_reports").update({ status: "resolved" }).eq("id", reportId);
            }

            setRows((prev) => prev.filter((x) => x.report.post_id !== postId));
          },
        },
      ]
    );
  };

  const reportCountByPostId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of rows) {
      const pid = item.report.post_id;
      map.set(pid, (map.get(pid) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!onlyTwoPlus) return rows;
    return rows.filter((x) => (reportCountByPostId.get(x.report.post_id) ?? 0) >= 2);
  }, [onlyTwoPlus, rows, reportCountByPostId]);

  const emptyText = useMemo(() => {
    if (loading) return t("common.loading", { defaultValue: "Loading…" });
    if (onlyTwoPlus) return t("moderation.empty_two_plus", { defaultValue: "No posts with 2+ reports right now." });
    return tab === "open"
      ? t("moderation.empty_open", { defaultValue: "No reported posts right now." })
      : includeDismissed
      ? t("moderation.empty_resolved_or_dismissed", { defaultValue: "No resolved or dismissed reports." })
      : t("moderation.empty_resolved", { defaultValue: "No resolved reports." });
  }, [loading, tab, onlyTwoPlus, includeDismissed, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← {t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("moderation.title", { defaultValue: "Moderation" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("moderation.role_prefix", { defaultValue: "Role:" })} {meRole}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => setTab("open")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: tab === "open" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: tab === "open" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("moderation.open_tab", { defaultValue: "Open" })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("resolved")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: tab === "resolved" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: tab === "resolved" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("moderation.resolved_tab", { defaultValue: "Resolved" })}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => setOnlyTwoPlus((p) => !p)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: onlyTwoPlus ? "rgba(245,196,81,0.16)" : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="filter-outline" size={18} color={COLORS.text} />
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("moderation.two_plus_reports", { defaultValue: "2+ reports" })}</Text>
          </Pressable>

          {tab !== "open" ? (
            <Pressable
              onPress={() => setIncludeDismissed((p) => !p)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: includeDismissed ? "rgba(255,255,255,0.10)" : COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons name="eye-outline" size={18} color={COLORS.text} />
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("moderation.show_dismissed", { defaultValue: "Show dismissed" })}{" "}
                {includeDismissed ? t("moderation.on", { defaultValue: "(ON)" }) : t("moderation.off", { defaultValue: "(OFF)" })}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={load}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: COLORS.button,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              marginLeft: "auto",
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
        keyExtractor={(x) => x.report.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 18 }}>
            <Text style={{ color: COLORS.muted }}>{emptyText}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const r = item.report;
          const p = item.post;

          const thumb = p?.post_media?.[0]?.url ?? null;
          const reportCount = reportCountByPostId.get(r.post_id) ?? 1;

          const statusBg =
            r.status === "open"
              ? "rgba(245,196,81,0.16)"
              : r.status === "resolved"
              ? "rgba(124,255,178,0.12)"
              : "rgba(255,255,255,0.08)";

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
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {p
                      ? t("moderation.post_by", { defaultValue: "Post by {{name}}", name: item.author_name })
                      : t("moderation.post_not_found", { defaultValue: "Post not found" })}
                  </Text>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        backgroundColor: "rgba(245,196,81,0.16)",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                        {t("moderation.report_count", {
                          defaultValue: "{{count}} report{{plural}}",
                          count: reportCount,
                          plural: reportCount === 1 ? "" : "s",
                        })}
                      </Text>
                    </View>

                    <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                      {t("moderation.reported_at", { defaultValue: "Reported: {{date}}", date: new Date(r.created_at).toLocaleString() })}
                    </Text>
                  </View>

                  <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                    {t("moderation.reason_prefix", { defaultValue: "Reason:" })} {r.reason ?? t("moderation.not_specified", { defaultValue: "Not specified" })}
                  </Text>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: statusBg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {String(r.status).toUpperCase()}
                  </Text>
                </View>
              </View>

              {r.details ? <Text style={{ color: COLORS.text, marginTop: 10, lineHeight: 20 }}>{r.details}</Text> : null}

              {thumb ? (
                <Pressable
                  onPress={() => router.push({ pathname: "/post", params: { id: p!.id } })}
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#0F0F16",
                  }}
                >
                  <View style={{ height: 160 }}>
                    <Image source={{ uri: thumb }} resizeMode="cover" style={{ width: "100%", height: "100%" }} onError={() => {}} />
                    <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.10)" }} />
                  </View>

                  <View style={{ padding: 10 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }} numberOfLines={2}>
                      {p?.caption ?? t("moderation.no_caption", { defaultValue: "(no caption)" })}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                      {t("moderation.tap_to_open_post", { defaultValue: "Tap to open post" })}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                {p ? (
                  <Pressable
                    onPress={() => router.push({ pathname: "/post", params: { id: p.id } })}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: COLORS.bg,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="open-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("moderation.open", { defaultValue: "Open" })}</Text>
                  </Pressable>
                ) : null}

                {p ? (
                  <Pressable
                    onPress={() => deletePostAsMod(p.id, r.id)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: "#2A1114",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("moderation.delete_post", { defaultValue: "Delete post" })}</Text>
                  </Pressable>
                ) : null}

                {tab === "open" ? (
                  <>
                    <Pressable
                      onPress={() => resolveReport(r.id)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: "rgba(124,255,178,0.12)",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("moderation.resolve", { defaultValue: "Resolve" })}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => dismissReport(r.id)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: COLORS.chip,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("moderation.dismiss", { defaultValue: "Dismiss" })}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 12, fontSize: 12 }}>
                {t("moderation.ids_line", { defaultValue: "Report ID: {{rid}} • Post: {{pid}}", rid: r.id, pid: r.post_id })}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}