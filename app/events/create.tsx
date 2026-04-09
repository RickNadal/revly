import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EventTopNav from "../../components/navigation/EventTopNav";
import { supabase } from "../../lib/supabase";
import { uploadMediaToSupabase } from "../../lib/uploadMedia";

type Picked = { uri: string; type?: "image" | "video" };
type EventVisibility = "open" | "invite_only";

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

export default function CreateEventScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const formatDateDutch = (date: Date) =>
    new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

  const formatTimeDutch = (date: Date) =>
    new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

  const toIsoDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const toDbTime = (date: Date) => {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  const [title, setTitle] = useState("");
  const [info, setInfo] = useState("");
  const [priceText, setPriceText] = useState("");
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState(new Date());
  const [eventType, setEventType] = useState("rideout");
  const [locationText, setLocationText] = useState("");
  const [visibility, setVisibility] = useState<EventVisibility>("open");
  const [inviteCode, setInviteCode] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!eventType.trim()) return false;
    if (visibility === "invite_only" && inviteCode.trim().length < 4) return false;
    return true;
  }, [title, eventType, visibility, inviteCode]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("events.permission_needed_title", { defaultValue: "Permission needed" }),
        t("events.permission_needed_body", { defaultValue: "Allow photo access." })
      );
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 8,
    });

    if (res.canceled) return;

    setPhotos(
      res.assets.map((a) => ({
        uri: a.uri,
        type: a.type === "video" ? "video" : "image",
      }))
    );
  };

  const uploadImage = async (userId: string, photo: Picked) => {
    const clean = String(photo.uri).split("?")[0].split("#")[0];
    const dotExt = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
    const storagePath = `events/${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${dotExt}`;
    return uploadMediaToSupabase(photo.uri, "post-images", storagePath, "image");
  };

  const createEvent = async () => {
    if (!canSubmit) {
      Alert.alert(
        t("events.missing_fields_title", { defaultValue: "Missing fields" }),
        t("events.missing_fields_body", { defaultValue: "Please fill title, date, time, type and invite code when needed." })
      );
      return;
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;

    const { data: createdEventId, error: eventErr } = await supabase.rpc("create_event", {
      p_title: title.trim(),
      p_info: info.trim() || null,
      p_event_type: eventType.trim(),
      p_event_date: toIsoDate(eventDate),
      p_event_time: toDbTime(eventTime),
      p_price_text: priceText.trim() || null,
      p_location_text: locationText.trim() || null,
      p_visibility: visibility,
      p_invite_code: visibility === "invite_only" ? inviteCode.trim() : null,
    });

    if (eventErr || !createdEventId) {
      setLoading(false);
      Alert.alert(t("events.create_failed_title", { defaultValue: "Create failed" }), eventErr?.message ?? "Unknown error");
      return;
    }

    try {
      for (let i = 0; i < photos.length; i++) {
        const url = await uploadImage(uid, photos[i]);
        const { error } = await supabase.from("event_media").insert({
          event_id: createdEventId,
          url,
          sort_order: i,
        } as any);
        if (error) throw error;
      }

      setLoading(false);
      Alert.alert(
        t("events.created_title", { defaultValue: "Event created" }),
        t("events.created_body", { defaultValue: "Your event is now live." })
      );
      router.replace("/events/browse");
    } catch (e: any) {
      setLoading(false);
      Alert.alert(t("events.upload_failed_title", { defaultValue: "Upload failed" }), e?.message ?? "Unknown error");
    }
  };

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
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: Math.max(insets.bottom + 30, 44) }}>
        <EventTopNav onBack={handleBack} onHome={handleHome} title={t("events.create_title", { defaultValue: "Create Event" })} />
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("events.create_title", { defaultValue: "Create Event" })}
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("events.title_placeholder", { defaultValue: "Event title" })}
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={info}
          onChangeText={setInfo}
          placeholder={t("events.info_placeholder", { defaultValue: "Information / description" })}
          placeholderTextColor={COLORS.muted}
          multiline
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text, minHeight: 90, textAlignVertical: "top" }}
        />

        <TextInput
          value={priceText}
          onChangeText={setPriceText}
          placeholder={t("events.price_placeholder", { defaultValue: "Price (e.g. Free / 15 EUR)" })}
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setDatePickerOpen(true)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.inputBorder,
              padding: 12,
              borderRadius: 12,
              backgroundColor: COLORS.inputBg,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: COLORS.text }}>
              {formatDateDutch(eventDate)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTimePickerOpen(true)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.inputBorder,
              padding: 12,
              borderRadius: 12,
              backgroundColor: COLORS.inputBg,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: COLORS.text }}>
              {formatTimeDutch(eventTime)}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={eventType}
          onChangeText={setEventType}
          placeholder={t("events.type_placeholder", { defaultValue: "Type (rideout, meeting, etc)" })}
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={locationText}
          onChangeText={setLocationText}
          placeholder={t("events.location_placeholder", { defaultValue: "Location (optional)" })}
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setVisibility("open")}
            style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: visibility === "open" ? COLORS.button : COLORS.chip }}
          >
            <Text style={{ color: visibility === "open" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("events.visibility_open", { defaultValue: "Open" })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setVisibility("invite_only")}
            style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: visibility === "invite_only" ? COLORS.button : COLORS.chip }}
          >
            <Text style={{ color: visibility === "invite_only" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("events.visibility_invite_only", { defaultValue: "Invite only" })}
            </Text>
          </Pressable>
        </View>

        {visibility === "invite_only" ? (
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder={t("events.invite_code_placeholder", { defaultValue: "Invite code" })}
            placeholderTextColor={COLORS.muted}
            style={{ borderWidth: 1, borderColor: COLORS.inputBorder, padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
          />
        ) : null}

        <Pressable
          onPress={pickPhotos}
          disabled={loading}
          style={{ backgroundColor: loading ? "#777" : COLORS.button, paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("events.pick_photos", { defaultValue: "Add pictures (max 8)" })}
          </Text>
        </Pressable>

        {photos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ width: 90, height: 90, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={createEvent}
          disabled={loading || !canSubmit}
          style={{ backgroundColor: loading || !canSubmit ? "#777" : COLORS.button, paddingVertical: 16, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading ? t("events.creating", { defaultValue: "Creating..." }) : t("events.create_event", { defaultValue: "Create event" })}
          </Text>
        </Pressable>

        <Modal
          transparent
          visible={datePickerOpen}
          animationType="fade"
          onRequestClose={() => setDatePickerOpen(false)}
        >
          <Pressable
            onPress={() => setDatePickerOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 18 }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, marginBottom: 8 }}>
                {t("events.date_picker_title", { defaultValue: "Select date" })}
              </Text>

              <DateTimePicker
                value={eventDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "calendar"}
                locale="nl-NL"
                minimumDate={new Date()}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setEventDate(selectedDate);
                  if (Platform.OS === "android") setDatePickerOpen(false);
                }}
              />

              {Platform.OS === "ios" ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={() => setDatePickerOpen(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.chip,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {t("common.done", { defaultValue: "Done" })}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          transparent
          visible={timePickerOpen}
          animationType="fade"
          onRequestClose={() => setTimePickerOpen(false)}
        >
          <Pressable
            onPress={() => setTimePickerOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 18 }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, marginBottom: 8 }}>
                {t("events.time_picker_title", { defaultValue: "Select time" })}
              </Text>

              <DateTimePicker
                value={eventTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "clock"}
                is24Hour
                locale="nl-NL"
                onChange={(_, selectedTime) => {
                  if (selectedTime) setEventTime(selectedTime);
                  if (Platform.OS === "android") setTimePickerOpen(false);
                }}
              />

              {Platform.OS === "ios" ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={() => setTimePickerOpen(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.chip,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {t("common.done", { defaultValue: "Done" })}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
