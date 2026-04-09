import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EventTopNav from "../../components/navigation/EventTopNav";
import { supabase } from "../../lib/supabase";
import { showSuccess } from "../../lib/toast";

type ProfileRole = "user" | "moderator" | "admin";

type EventRow = {
  id: string;
  creator_id: string;
  title: string;
  info: string | null;
  event_type: string;
  event_date: string;
  event_time: string;
  price_text: string | null;
  location_text: string | null;
  visibility: "open" | "invite_only";
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
};

export default function EventsBrowseScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<EventRow[]>([]);
  const [namesById, setNamesById] = useState<Record<string, string>>({});
  const [thumbByEventId, setThumbByEventId] = useState<Record<string, string | null>>({});
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [participantCountByEventId, setParticipantCountByEventId] = useState<Record<string, number>>({});
  const [participantNamesByEventId, setParticipantNamesByEventId] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEventId, setInviteEventId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leavingEventId, setLeavingEventId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const me = session.user.id;

    const { data: meProfile } = await supabase.from("profiles").select("role").eq("id", me).maybeSingle();
    const role = ((meProfile as any)?.role ?? "user") as ProfileRole;
    const isStaff = role === "admin" || role === "moderator";

    const [{ data: eventsData, error: eventsErr }, { data: myAttendees, error: attErr }] = await Promise.all([
      supabase.from("events").select("id, creator_id, title, info, event_type, event_date, event_time, price_text, location_text, visibility, created_at").order("created_at", { ascending: false }).limit(120),
      supabase.from("event_attendees").select("event_id").eq("user_id", me),
    ]);

    if (eventsErr) {
      setLoading(false);
      Alert.alert(t("events.load_failed_title", { defaultValue: "Load failed" }), eventsErr.message);
      return;
    }
    if (attErr) console.log("EVENT ATTENDEES ERROR:", attErr);

    const joinedSet = new Set(((myAttendees ?? []) as any[]).map((x) => String((x as any).event_id ?? "")).filter(Boolean));
    setJoinedEventIds(joinedSet);

    const raw = (eventsData ?? []) as EventRow[];

    const visible = isStaff
      ? raw
      : raw.filter((e) => e.visibility === "open" || e.creator_id === me || joinedSet.has(e.id));

    const creatorIds = Array.from(new Set(visible.map((e) => e.creator_id)));
    if (creatorIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
      const map: Record<string, string> = {};
      for (const p of profs ?? []) {
        map[String((p as any).id)] = String((p as any).full_name ?? "Rider");
      }
      setNamesById(map);
    } else {
      setNamesById({});
    }

    const eventIds = visible.map((e) => e.id);
    if (eventIds.length > 0) {
      const { data: media } = await supabase
        .from("event_media")
        .select("event_id, url, sort_order")
        .in("event_id", eventIds)
        .order("sort_order", { ascending: true });

      const thumbMap: Record<string, string | null> = {};
      for (const m of (media ?? []) as any[]) {
        const eid = String(m.event_id ?? "");
        if (!eid) continue;
        if (thumbMap[eid]) continue;
        thumbMap[eid] = String(m.url ?? "") || null;
      }
      setThumbByEventId(thumbMap);

      const { data: attendees, error: attendeesErr } = await supabase
        .from("event_attendees")
        .select("event_id, user_id")
        .in("event_id", eventIds);

      if (attendeesErr) {
        console.log("EVENT ATTENDEES LIST ERROR:", attendeesErr);
      } else {
        const countMap: Record<string, number> = {};
        const userIds = new Set<string>();
        const attendeesByEvent: Record<string, string[]> = {};

        for (const row of (attendees ?? []) as any[]) {
          const eid = String(row.event_id ?? "");
          const uid = String(row.user_id ?? "");
          if (!eid || !uid) continue;

          countMap[eid] = (countMap[eid] ?? 0) + 1;
          if (!attendeesByEvent[eid]) attendeesByEvent[eid] = [];
          attendeesByEvent[eid].push(uid);
          userIds.add(uid);
        }

        const userIdList = Array.from(userIds);
        const nameByUid: Record<string, string> = {};
        if (userIdList.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIdList);
          if (profErr) {
            console.log("EVENT ATTENDEE PROFILES ERROR:", profErr);
          } else {
            for (const p of profs ?? []) {
              nameByUid[String((p as any).id)] = String((p as any).full_name ?? "").trim() || t("feed.rider_fallback", { defaultValue: "Rider" });
            }
          }
        }

        const nameMap: Record<string, string[]> = {};
        for (const [eid, uids] of Object.entries(attendeesByEvent)) {
          nameMap[eid] = uids.map((uid) => nameByUid[uid] ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
        }

        setParticipantCountByEventId(countMap);
        setParticipantNamesByEventId(nameMap);
      }
    } else {
      setThumbByEventId({});
      setParticipantCountByEventId({});
      setParticipantNamesByEventId({});
    }

    setItems(visible);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const openInviteJoin = (eventId: string) => {
    setInviteEventId(eventId);
    setInviteCode("");
    setInviteModalOpen(true);
  };

  const joinOpenEvent = async (eventId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) return router.replace("/sign-in");

    const { error } = await supabase.from("event_attendees").insert({ event_id: eventId, user_id: me } as any);
    if (error) {
      Alert.alert(t("events.join_failed_title", { defaultValue: "Join failed" }), error.message);
      return;
    }

    setJoinedEventIds((prev) => new Set(prev).add(eventId));
    await load();
  };

  const submitInviteJoin = async () => {
    if (!inviteEventId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) return router.replace("/sign-in");

    setJoining(true);
    const { error } = await supabase
      .from("event_attendees")
      .insert({ event_id: inviteEventId, user_id: me, invite_code: inviteCode.trim() } as any);
    setJoining(false);

    if (error) {
      Alert.alert(t("events.invalid_invite_title", { defaultValue: "Invite code invalid" }), error.message);
      return;
    }

    setJoinedEventIds((prev) => new Set(prev).add(inviteEventId));
    setInviteModalOpen(false);
    setInviteEventId(null);
    setInviteCode("");
    await load();
  };

  const leaveEvent = async (eventId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) return router.replace("/sign-in");

    Alert.alert(
      t("events.leave_confirm_title", { defaultValue: "Leave event?" }),
      t("events.leave_confirm_body", { defaultValue: "You will be removed from the participant list." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("events.leave", { defaultValue: "Opt out" }),
          style: "destructive",
          onPress: async () => {
            setLeavingEventId(eventId);
            const { error } = await supabase.from("event_attendees").delete().eq("event_id", eventId).eq("user_id", me);
            setLeavingEventId(null);

            if (error) {
              Alert.alert(t("events.leave_failed_title", { defaultValue: "Could not leave" }), error.message);
              return;
            }

            setJoinedEventIds((prev) => {
              const next = new Set(prev);
              next.delete(eventId);
              return next;
            });
            showSuccess(t("events.left_success", { defaultValue: "You left the event." }));
            await load();
          },
        },
      ]
    );
  };

  const listEmpty = useMemo(() => {
    if (loading) return t("common.loading", { defaultValue: "Loading…" });
    return t("events.empty", { defaultValue: "No events yet." });
  }, [loading, t]);

  const handleBack = () => {
    if ((router as any).canGoBack?.()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  };

  const handleHome = () => {
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <EventTopNav onBack={handleBack} onHome={handleHome} title={t("events.browse_title", { defaultValue: "Browse Events" })} />
        <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900" }}>
          {t("events.browse_title", { defaultValue: "Browse Events" })}
        </Text>
        <Text style={{ color: COLORS.muted, marginTop: 4 }}>
          {t("events.browse_subtitle", { defaultValue: "Open events for everyone. Invite-only events need a code." })}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 16, 28) }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, marginTop: 10 }}>{listEmpty}</Text>}
        renderItem={({ item }) => {
          const thumb = thumbByEventId[item.id] ?? null;
          const joined = joinedEventIds.has(item.id);
          const creatorName = namesById[item.creator_id] ?? t("feed.rider_fallback", { defaultValue: "Rider" });
          const participantCount = participantCountByEventId[item.id] ?? 0;
          const participantNames = participantNamesByEventId[item.id] ?? [];

          return (
            <Pressable
              onPress={() => router.push({ pathname: "/events/[id]", params: { id: item.id } })}
              style={{
                marginTop: 10,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {thumb ? <Image source={{ uri: thumb }} style={{ width: "100%", height: 180 }} resizeMode="cover" /> : null}

              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", flex: 1 }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 11 }}>
                      {item.visibility === "open" ? t("events.visibility_open", { defaultValue: "Open" }) : t("events.visibility_invite_only", { defaultValue: "Invite only" })}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: COLORS.muted, marginTop: 5 }}>
                  {creatorName} • {item.event_type}
                </Text>

                <Text style={{ color: COLORS.text, marginTop: 6 }}>
                  {item.event_date} • {item.event_time}
                </Text>

                {item.price_text ? <Text style={{ color: COLORS.text, marginTop: 4 }}>{item.price_text}</Text> : null}
                {item.location_text ? <Text style={{ color: COLORS.muted, marginTop: 4 }}>{item.location_text}</Text> : null}
                {item.info ? (
                  <Text style={{ color: COLORS.text, marginTop: 8 }} numberOfLines={3}>
                    {item.info}
                  </Text>
                ) : null}

                <Text style={{ color: COLORS.text, marginTop: 8, fontWeight: "900" }}>
                  {t("events.participants_count", {
                    count: participantCount,
                    defaultValue: `Participants: ${participantCount}`,
                  })}
                </Text>

                {participantNames.length > 0 ? (
                  <Text style={{ color: COLORS.muted, marginTop: 4 }} numberOfLines={2}>
                    {participantNames.slice(0, 6).join(", ")}
                    {participantNames.length > 6 ? "…" : ""}
                  </Text>
                ) : null}

                {joined ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                        {t("events.joined", { defaultValue: "Joined" })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => leaveEvent(item.id)}
                      disabled={leavingEventId === item.id}
                      style={{
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "#5A2A32",
                        backgroundColor: leavingEventId === item.id ? "#4A4A4A" : "#2A1318",
                      }}
                    >
                      <Text style={{ color: "#FFB4C0", fontWeight: "900" }}>
                        {leavingEventId === item.id ? t("common.loading", { defaultValue: "Loading…" }) : t("events.leave", { defaultValue: "Opt out" })}
                      </Text>
                    </Pressable>
                  </View>
                ) : item.visibility === "open" ? (
                  <Pressable
                    onPress={() => joinOpenEvent(item.id)}
                    style={{ marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: COLORS.button }}
                  >
                    <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                      {t("events.join_open", { defaultValue: "Participate" })}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => openInviteJoin(item.id)}
                    style={{ marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: COLORS.button }}
                  >
                    <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                      {t("events.join_with_code", { defaultValue: "Join with invite code" })}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => router.push({ pathname: "/events/[id]", params: { id: item.id } })}
                  style={{ marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {t("events.open_details", { defaultValue: "Open details" })}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal transparent visible={inviteModalOpen} animationType="fade" onRequestClose={() => setInviteModalOpen(false)}>
        <Pressable
          onPress={() => setInviteModalOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14 }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {t("events.enter_invite_code", { defaultValue: "Enter invite code" })}
            </Text>

            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={t("events.invite_code_placeholder", { defaultValue: "Invite code" })}
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text, backgroundColor: COLORS.bg }}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => setInviteModalOpen(false)}
                style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: COLORS.chip }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </Pressable>

              <Pressable
                onPress={submitInviteJoin}
                disabled={joining || !inviteCode.trim()}
                style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: joining || !inviteCode.trim() ? "#777" : COLORS.button }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                  {joining ? t("common.loading", { defaultValue: "Loading…" }) : t("events.join", { defaultValue: "Join" })}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
