import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { uploadMediaToSupabase } from "../lib/uploadMedia";

type Cycle = { id: string; month_start: string; status: "open" | "closed" };
type SubmissionRow = {
  submission_id: string;
  cycle_id: string;
  user_id: string;
  bike_name: string;
  bike_photo_url: string;
  description: string | null;
  regular_vote_count: number;
  boost_points: number;
  total_points: number;
  profile_name?: string;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
};

export default function BikeOfMonthScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"user" | "moderator" | "admin">("user");
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingOwn, setDeletingOwn] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [bikeName, setBikeName] = useState("");
  const [bikePhotoUrl, setBikePhotoUrl] = useState("");
  const [description, setDescription] = useState("");

  const [mySubmissionId, setMySubmissionId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  const top3 = useMemo(() => items.slice(0, 3), [items]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    const uid = session.user.id;
    setMe(uid);

    const { data: roleData } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    setMyRole((((roleData as any)?.role ?? "user") as "user" | "moderator" | "admin"));

    const { data: cycles } = await supabase
      .from("bike_of_month_cycles")
      .select("id, month_start, status")
      .order("month_start", { ascending: false })
      .limit(1);

    const current = (cycles ?? [])[0] as Cycle | undefined;
    if (!current) {
      setCycle(null);
      setItems([]);
      setLoading(false);
      return;
    }

    setCycle(current);

    const [{ data: scores }, { data: submissions }, { data: votes }] = await Promise.all([
      supabase
        .from("bike_of_month_submission_scores" as any)
        .select("submission_id, cycle_id, user_id, bike_name, bike_photo_url, description, regular_vote_count, boost_points, total_points")
        .eq("cycle_id", current.id)
        .order("total_points", { ascending: false }),
      supabase
        .from("bike_of_month_submissions")
        .select("id, user_id")
        .eq("cycle_id", current.id),
      supabase
        .from("bike_of_month_votes")
        .select("id")
        .eq("cycle_id", current.id)
        .eq("voter_id", uid)
        .limit(1),
    ]);

    const userIds = Array.from(new Set(((scores ?? []) as any[]).map((x) => String(x.user_id))));
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : ({ data: [] } as any);
    const nameById = new Map<string, string>();
    for (const p of (profs ?? []) as any[]) nameById.set(String(p.id), String(p.full_name ?? "Rijder"));

    const list = ((scores ?? []) as any[]).map((x) => ({
      ...x,
      profile_name: nameById.get(String(x.user_id)) ?? "Rijder",
    })) as SubmissionRow[];

    setItems(list);
    setHasVoted((votes ?? []).length > 0);

    const mine = ((submissions ?? []) as any[]).find((s) => String(s.user_id) === uid);
    setMySubmissionId(mine?.id ? String(mine.id) : null);

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickBikePhoto = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      router.replace("/sign-in");
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toestemming nodig", "Geef fototoegang om je BOTM-inzending te uploaden.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    try {
      setUploadingImage(true);
      setUploadProgress(0);
      const uri = picked.assets[0].uri;
      const clean = String(uri).split("?")[0].split("#")[0];
      const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
      const path = `bike-of-month/${uid}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const publicUrl = await uploadMediaToSupabase(uri, "post-images", path, "image", setUploadProgress);
      setBikePhotoUrl(publicUrl);
    } catch (e: any) {
      Alert.alert("Upload mislukt", e?.message ?? "Kon de motorfoto niet uploaden.");
    } finally {
      setUploadingImage(false);
    }
  };

  const submitBike = async () => {
    if (!cycle || !me) return;
    if (mySubmissionId) return Alert.alert("Al ingezonden", "Je kunt maar een keer per maand inzenden.");
    if (!bikeName.trim() || !bikePhotoUrl.trim()) return Alert.alert("Informatie ontbreekt", "Voeg een naam toe en upload een foto.");
    if (uploadingImage) return Alert.alert("Upload bezig", "Wacht tot je foto-upload klaar is.");

    setSubmitting(true);
    const { error } = await supabase.from("bike_of_month_submissions").insert({
      cycle_id: cycle.id,
      user_id: me,
      bike_name: bikeName.trim(),
      bike_photo_url: bikePhotoUrl.trim(),
      description: description.trim() || null,
    } as any);
    setSubmitting(false);

    if (error) return Alert.alert("Inzenden mislukt", error.message);
    setBikeName("");
    setBikePhotoUrl("");
    setDescription("");
    setUploadProgress(0);
    await load();
  };

  const voteFor = async (row: SubmissionRow) => {
    if (!cycle || !me) return;
    if (hasVoted) return Alert.alert("Al gestemd", "Je kunt een keer per maand stemmen.");
    if (row.user_id === me) return Alert.alert("Niet toegestaan", "Je kunt niet op je eigen motor stemmen.");

    const { error, status } = await supabase.from("bike_of_month_votes").insert({
      cycle_id: cycle.id,
      submission_id: row.submission_id,
      voter_id: me,
    } as any);

    if (error) {
      console.error("Vote insert error:", error);
      return Alert.alert("Stemmen mislukt", error.message || `Status: ${status}`);
    }
    await load();
  };

  const removeVote = async () => {
    if (!cycle || !me) return;
    
    const { error } = await supabase
      .from("bike_of_month_votes")
      .delete()
      .eq("cycle_id", cycle.id)
      .eq("voter_id", me);

    if (error) {
      console.error("Remove vote error:", error);
      return Alert.alert("Stem verwijderen mislukt", error.message);
    }
    await load();
  };

  const openBoost = (row: SubmissionRow) => {
    if (!cycle) return;
    router.push({
      pathname: "/bike-boost",
      params: {
        cycleId: cycle.id,
        submissionId: row.submission_id,
        bikeName: row.bike_name,
      },
    });
  };

  const finalizeCycle = async () => {
    if (myRole !== "admin") return;
    const { error } = await supabase.rpc("finalize_bike_of_month_cycle", { p_cycle_id: cycle?.id ?? null } as any);
    if (error) return Alert.alert("Afronden mislukt", error.message);
    Alert.alert("Maand afgerond", "Beloningen zijn toegepast en de volgende maand is geopend.");
    await load();
  };

  const openAdminPanel = () => {
    if (myRole !== "admin") return;
    router.push("/botm-admin");
  };

  const deleteMyEntry = () => {
    if (!mySubmissionId || !me) return;
    Alert.alert("Inzending verwijderen", "Weet je zeker dat je jouw BOTM-inzending wilt verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          setDeletingOwn(true);
          const { error } = await supabase
            .from("bike_of_month_submissions")
            .delete()
            .eq("id", mySubmissionId)
            .eq("user_id", me);

          setDeletingOwn(false);

          if (error) {
            Alert.alert("Verwijderen mislukt", error.message);
            return;
          }

          Alert.alert("Verwijderd", "Jouw inzending is verwijderd.");
          setBikeName("");
          setBikePhotoUrl("");
          setDescription("");
          setUploadProgress(0);
          await load();
        },
      },
    ]);
  };

  const PodiumCard = ({ row, rank }: { row: SubmissionRow; rank: number }) => {
    const rankStyle = rank === 1 ? "#FFD36A" : rank === 2 ? "#D0D3DB" : "#D79669";
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";

    return (
      <View style={{ flex: 1, minWidth: 110, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
        <Image source={{ uri: row.bike_photo_url }} style={{ width: "100%", height: rank === 1 ? 128 : 112 }} resizeMode="cover" />
        <View style={{ padding: 10 }}>
          <Text style={{ fontSize: 20 }}>{medal}</Text>
          <Text style={{ color: rankStyle, fontWeight: "900", fontSize: 12 }}>PLAATS #{rank}</Text>
          <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{row.bike_name}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12 }} numberOfLines={1}>{row.profile_name}</Text>
          <Text style={{ color: rankStyle, fontWeight: "900", marginTop: 4 }}>{row.total_points} ptn</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.submission_id}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 24 }}>Motor van de Maand</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable onPress={() => router.push("/bike-hall-of-fame")}>
                  <Ionicons name="medal-outline" size={22} color="#FFD67A" />
                </Pressable>
                <Pressable onPress={() => router.back()}><Ionicons name="close" size={24} color={COLORS.text} /></Pressable>
              </View>
            </View>

            {myRole === "admin" ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={openAdminPanel}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(200,155,255,0.45)",
                    backgroundColor: "rgba(200,155,255,0.12)",
                    alignItems: "center",
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: "#D9B8FF", fontWeight: "900" }}>Open BOTM Admin Panel</Text>
                </Pressable>
                <Pressable
                  onPress={finalizeCycle}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(255,214,122,0.45)",
                    backgroundColor: "rgba(255,214,122,0.12)",
                    alignItems: "center",
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: "#FFD67A", fontWeight: "900" }}>Finalize Month + Apply Rewards</Text>
                </Pressable>
              </View>
            ) : null}

            <LinearGradient
              colors={["#221806", "#161313", "#12121A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,214,122,0.35)", padding: 12, gap: 8 }}
            >
              <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }}>BELONING VOORBEELD</Text>

              <View style={{ borderWidth: 1, borderColor: "rgba(255,214,122,0.35)", borderRadius: 12, backgroundColor: "rgba(255,214,122,0.08)", padding: 10 }}>
                <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 13 }}>#1 PLAATS</Text>
                <Text style={{ color: COLORS.text, marginTop: 4, lineHeight: 18 }}>
                  1 maand Premium + BOTM CHAMP Spotlight-badge in feed/profiel voor 1 maand.
                </Text>
              </View>

              <View style={{ borderWidth: 1, borderColor: "rgba(255,214,122,0.35)", borderRadius: 12, backgroundColor: "rgba(255,214,122,0.08)", padding: 10 }}>
                <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 13 }}>WINNAARSTATUS (PERMANENT)</Text>
                <Text style={{ color: COLORS.text, marginTop: 4, lineHeight: 18 }}>
                  Eregalerij-vermelding + permanente BOTM WINNER teller-badge op profiel.
                </Text>
              </View>
            </LinearGradient>

            <LinearGradient
              colors={["#2a1c07", "#1a1a14", "#111116"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,214,122,0.35)", padding: 12 }}
            >
              <Text style={{ color: "#FFD67A", fontWeight: "900", fontSize: 12 }}>HUIDIG PODIUM</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {top3.length === 0 ? <Text style={{ color: COLORS.muted }}>Nog geen inzendingen.</Text> : null}
                {top3[1] ? <PodiumCard row={top3[1]} rank={2} /> : null}
                {top3[0] ? <PodiumCard row={top3[0]} rank={1} /> : null}
                {top3[2] ? <PodiumCard row={top3[2]} rank={3} /> : null}
              </View>
            </LinearGradient>

            <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.card, padding: 12, gap: 8 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Dien je motor in (1x per maand)</Text>
              <TextInput value={bikeName} onChangeText={setBikeName} placeholder="Naam van de motor" placeholderTextColor={COLORS.muted} style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, color: COLORS.text }} />
              <Pressable
                onPress={pickBikePhoto}
                disabled={uploadingImage}
                style={{
                  borderWidth: 1,
                  borderColor: bikePhotoUrl ? "rgba(124,255,178,0.45)" : COLORS.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: bikePhotoUrl ? "rgba(124,255,178,0.08)" : "transparent",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {bikePhotoUrl ? "Motorfoto geupload" : "Kies en bewerk motorfoto"}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, fontSize: 12 }}>
                      {uploadingImage
                        ? `Uploaden... ${Math.max(1, Math.round(uploadProgress * 100))}%`
                        : bikePhotoUrl
                          ? "Tik om foto te vervangen"
                          : "Kies een foto uit je galerij, snijd bij en upload"}
                    </Text>
                  </View>
                  {uploadingImage ? (
                    <ActivityIndicator color="#FFD67A" />
                  ) : (
                    <Ionicons name={bikePhotoUrl ? "image" : "cloud-upload-outline"} size={22} color={bikePhotoUrl ? "#7CFFB2" : "#FFD67A"} />
                  )}
                </View>
              </Pressable>
              {bikePhotoUrl ? (
                <View style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                  <Image source={{ uri: bikePhotoUrl }} style={{ width: "100%", height: 180, backgroundColor: "#0F0F16" }} resizeMode="cover" />
                </View>
              ) : null}
              <TextInput value={description} onChangeText={setDescription} placeholder="Build-details (optioneel)" placeholderTextColor={COLORS.muted} multiline style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, color: COLORS.text, minHeight: 62 }} />
              <Pressable
                onPress={submitBike}
                disabled={submitting || deletingOwn || uploadingImage || !!mySubmissionId}
                style={{
                  borderRadius: 12,
                  backgroundColor: mySubmissionId ? "#2b2b35" : "#FFD67A",
                  alignItems: "center",
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: mySubmissionId ? COLORS.muted : "#0B0B0F", fontWeight: "900" }}>
                  {mySubmissionId ? "Already submitted this month" : uploadingImage ? "Uploading photo..." : submitting ? "Submitting..." : "Submit Bike"}
                </Text>
              </Pressable>

              {mySubmissionId ? (
                <Pressable
                  onPress={deleteMyEntry}
                  disabled={deletingOwn || submitting || uploadingImage}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(255,107,107,0.45)",
                    backgroundColor: "rgba(255,107,107,0.10)",
                    alignItems: "center",
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: "#FF6B6B", fontWeight: "900" }}>
                    {deletingOwn ? "Verwijderen..." : "Verwijder mijn inzending"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 16 }}><Text style={{ color: COLORS.muted }}>Laden...</Text></View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const rank = index + 1;
          return (
            <View style={{ marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
              <Image source={{ uri: item.bike_photo_url }} style={{ width: "100%", height: 190 }} resizeMode="cover" />
              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17 }}>{item.bike_name}</Text>
                  <Text style={{ color: "#FFD67A", fontWeight: "900" }}>#{rank}</Text>
                </View>
                <Text style={{ color: COLORS.muted, marginTop: 2 }}>{item.profile_name}</Text>
                {item.description ? <Text style={{ color: COLORS.text, marginTop: 8 }}>{item.description}</Text> : null}
                <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                  <Text style={{ color: COLORS.muted }}>Stemmen: {item.regular_vote_count}</Text>
                  <Text style={{ color: "#D9B8FF" }}>Boost: +{item.boost_points}</Text>
                  <Text style={{ color: "#FFD67A", fontWeight: "900" }}>Totaal: {item.total_points}</Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Pressable
                    onPress={() => (hasVoted ? removeVote() : voteFor(item))}
                    disabled={item.user_id === me}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: item.user_id === me ? "#2b2b35" : (hasVoted ? "#FF6B6B" : "#7CFFB2") }}
                  >
                    <Text style={{ color: item.user_id === me ? COLORS.muted : "#0B0B0F", fontWeight: "900" }}>
                      {hasVoted ? "Remove Vote" : item.user_id === me ? "Your bike" : "Vote"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openBoost(item)}
                    disabled={item.user_id === me}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: item.user_id === me ? "#2b2b35" : "#C89BFF" }}
                  >
                    <Text style={{ color: item.user_id === me ? COLORS.muted : "#0B0B0F", fontWeight: "900" }}>Boost ✨</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
