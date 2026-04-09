import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EventTopNav from "../../components/navigation/EventTopNav";
import { supabase } from "../../lib/supabase";
import { showSuccess } from "../../lib/toast";

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

export default function EventDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [creatorName, setCreatorName] = useState<string>("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = async () => {
    if (!eventId) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const { data: e, error: eErr } = await supabase
      .from("events")
      .select("id, creator_id, title, info, event_type, event_date, event_time, price_text, location_text, visibility, created_at")
      .eq("id", eventId)
      .maybeSingle();

    if (eErr || !e) {
      setLoading(false);
      Alert.alert(t("events.load_failed_title", { defaultValue: "Load failed" }), eErr?.message ?? "Event not found");
      return;
    }

    setEvent(e as EventRow);

    const [{ data: media }, { data: attendees }, { data: myAttendance }] = await Promise.all([
      supabase.from("event_media").select("url, sort_order").eq("event_id", eventId).order("sort_order", { ascending: true }),
      supabase.from("event_attendees").select("user_id").eq("event_id", eventId),
      supabase.from("event_attendees").select("event_id").eq("event_id", eventId).eq("user_id", me).limit(1),
    ]);

    setMediaUrls(((media ?? []) as any[]).map((m) => String(m.url ?? "")).filter(Boolean));
    setJoined(((myAttendance ?? []) as any[]).length > 0);

    const userIds = Array.from(new Set(((attendees ?? []) as any[]).map((x) => String((x as any).user_id ?? "")).filter(Boolean)));
    const plusCreator = Array.from(new Set([String((e as any).creator_id), ...userIds].filter(Boolean)));

    if (plusCreator.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", plusCreator);
      const nameById: Record<string, string> = {};
      for (const p of profs ?? []) {
        nameById[String((p as any).id)] = String((p as any).full_name ?? "").trim() || t("feed.rider_fallback", { defaultValue: "Rider" });
      }
      setCreatorName(nameById[String((e as any).creator_id)] ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
      setParticipantNames(userIds.map((uid) => nameById[uid] ?? t("feed.rider_fallback", { defaultValue: "Rider" })));
    } else {
      setCreatorName(t("feed.rider_fallback", { defaultValue: "Rider" }));
      setParticipantNames([]);
    }

    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [eventId])
  );

  const joinOpenEvent = async () => {
    if (!eventId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) return router.replace("/sign-in");

    const { error } = await supabase.from("event_attendees").insert({ event_id: eventId, user_id: me } as any);
    if (error) {
      Alert.alert(t("events.join_failed_title", { defaultValue: "Join failed" }), error.message);
      return;
    }

    await load();
  };

  const submitInviteJoin = async () => {
    if (!eventId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id;
    if (!me) return router.replace("/sign-in");

    setJoining(true);
    const { error } = await supabase
      .from("event_attendees")
      .insert({ event_id: eventId, user_id: me, invite_code: inviteCode.trim() } as any);
    setJoining(false);

    if (error) {
      Alert.alert(t("events.invalid_invite_title", { defaultValue: "Invite code invalid" }), error.message);
      return;
    }

    setInviteModalOpen(false);
    setInviteCode("");
    await load();
  };

  const leaveEvent = async () => {
    if (!eventId) return;

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
            setLeaving(true);
            const { error } = await supabase.from("event_attendees").delete().eq("event_id", eventId).eq("user_id", me);
            setLeaving(false);

            if (error) {
              Alert.alert(t("events.leave_failed_title", { defaultValue: "Could not leave" }), error.message);
              return;
            }

            showSuccess(t("events.left_success", { defaultValue: "You left the event." }));
            await load();
          },
        },
      ]
    );
  };

  const participantCount = participantNames.length;

  const openViewerAt = (index: number) => {
    if (!mediaUrls.length) return;
    router.push({
      pathname: "/viewer",
      params: {
        urls: JSON.stringify(mediaUrls),
        index: String(index),
      },
    });
  };

  const headerTitle = useMemo(() => {
    if (loading) return t("common.loading", { defaultValue: "Loading…" });
    return event?.title ?? t("events.title", { defaultValue: "Event" });
  }, [loading, event?.title, t]);

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
      <FlatList
        data={participantNames}
        keyExtractor={(item, idx) => `${item}:${idx}`}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <EventTopNav onBack={handleBack} onHome={handleHome} title={t("events.title", { defaultValue: "Event" })} />
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>{headerTitle}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              {creatorName} • {event?.event_type ?? ""}
            </Text>

            {mediaUrls.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 10 }}>
                {mediaUrls.map((url, idx) => (
                  <Pressable key={`${url}:${idx}`} onPress={() => openViewerAt(idx)}>
                    <Image source={{ uri: url }} style={{ width: 260, height: 160, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
              <Text style={{ color: COLORS.text }}>{event?.event_date} • {event?.event_time}</Text>
              {event?.price_text ? <Text style={{ color: COLORS.text, marginTop: 6 }}>{event.price_text}</Text> : null}
              {event?.location_text ? <Text style={{ color: COLORS.muted, marginTop: 6 }}>{event.location_text}</Text> : null}
              {event?.info ? <Text style={{ color: COLORS.text, marginTop: 8 }}>{event.info}</Text> : null}
              <Text style={{ color: COLORS.text, marginTop: 10, fontWeight: "900" }}>
                {t("events.participants_count", { count: participantCount, defaultValue: `Participants: ${participantCount}` })}
              </Text>
            </View>

            {joined ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <View style={{ paddingVertical: 11, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("events.joined", { defaultValue: "Joined" })}</Text>
                </View>
                <Pressable
                  onPress={leaveEvent}
                  disabled={leaving}
                  style={{
                    paddingVertical: 11,
                    borderRadius: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#5A2A32",
                    backgroundColor: leaving ? "#4A4A4A" : "#2A1318",
                  }}
                >
                  <Text style={{ color: "#FFB4C0", fontWeight: "900" }}>
                    {leaving ? t("common.loading", { defaultValue: "Loading…" }) : t("events.leave", { defaultValue: "Opt out" })}
                  </Text>
                </Pressable>
              </View>
            ) : event?.visibility === "open" ? (
              <Pressable onPress={joinOpenEvent} style={{ marginTop: 12, paddingVertical: 11, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.button }}>
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{t("events.join_open", { defaultValue: "Participate" })}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setInviteModalOpen(true)} style={{ marginTop: 12, paddingVertical: 11, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.button }}>
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{t("events.join_with_code", { defaultValue: "Join with invite code" })}</Text>
              </Pressable>
            )}

            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 14, marginBottom: 8 }}>
              {t("events.participants_title", { defaultValue: "Riders attending" })}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ paddingHorizontal: 16, color: COLORS.muted, marginTop: 2 }}>
            {t("events.no_participants_yet", { defaultValue: "No participants yet." })}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
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
