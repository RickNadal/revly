import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";
type Placement = "discover" | "following";
type ProfileSearchRow = { id: string; full_name: string | null };

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

export default function AdminHouseSponsorScreen() {
  const params = useLocalSearchParams<{ userId?: string; userName?: string }>();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(String(params.userName ?? ""));
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProfileSearchRow[]>([]);

  const [targetUserId, setTargetUserId] = useState(String(params.userId ?? ""));
  const [targetUserName, setTargetUserName] = useState(String(params.userName ?? ""));

  const [sponsorName, setSponsorName] = useState(String(params.userName ?? "").trim() || "House Sponsor");
  const [title, setTitle] = useState("Official House Sponsor");
  const [body, setBody] = useState("Supporting the platform and rider community.");
  const [ctaText, setCtaText] = useState("Learn more");
  const [ctaUrl, setCtaUrl] = useState("https://decazi.com/en-nl");
  const [imageUrl, setImageUrl] = useState("");
  const [placement, setPlacement] = useState<Placement>("discover");

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${query}%`)
        .order("full_name", { ascending: true })
        .limit(12);

      if (!alive) return;

      if (error) {
        setSearching(false);
        setSearchResults([]);
        return;
      }

      setSearchResults((data ?? []) as ProfileSearchRow[]);
      setSearching(false);
    }, 220);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const ensureAdmin = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.replace("/sign-in");
      return false;
    }

    const { data: prof, error } = await supabase.from("profiles").select("id, role").eq("id", session.user.id).single();

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

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setChecking(true);
        const ok = await ensureAdmin();
        if (alive && ok) {
          setChecking(false);
        }
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  const fillNameFromUuid = async () => {
    const uuid = targetUserId.trim();
    if (uuid.length !== 36) {
      Alert.alert("Invalid UUID", "Enter a full user UUID first.");
      return;
    }

    const { data: prof, error } = await supabase.from("profiles").select("full_name").eq("id", uuid).maybeSingle();
    if (error) {
      Alert.alert("Lookup failed", error.message);
      return;
    }

    const fullName = String((prof as any)?.full_name ?? "").trim();
    if (!fullName) {
      Alert.alert("Not found", "No profile name found for this UUID.");
      return;
    }

    setTargetUserName(fullName);
    if (!sponsorName.trim()) setSponsorName(fullName);
  };

  const valid = useMemo(() => {
    return targetUserId.trim().length === 36 && sponsorName.trim().length >= 2 && body.trim().length >= 6;
  }, [targetUserId, sponsorName, body]);

  const saveHouseSponsor = async () => {
    if (!valid) {
      Alert.alert("Missing info", "Add a valid user UUID, sponsor name, and body text.");
      return;
    }

    setSaving(true);
    try {
      const ownerUserId = targetUserId.trim();

      const { data: existing } = await supabase
        .from("ad_campaigns")
        .select("id")
        .eq("owner_user_id", ownerUserId)
        .eq("sponsor_type", "house")
        .eq("placement", placement)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload = {
        owner_user_id: ownerUserId,
        title: title.trim() || sponsorName.trim(),
        sponsor_name: sponsorName.trim(),
        sponsor_type: "house",
        badge_text: "House Sponsor",
        body: body.trim(),
        cta_text: ctaText.trim() || "Learn more",
        cta_url: ctaUrl.trim() || "/advertise",
        image_url: imageUrl.trim() || null,
        weight: 10,
        placement,
        status: "active",
        is_active: true,
        start_at: null,
        end_at: null,
        min_posts_between: 10,
      } as const;

      const query = existing?.id
        ? supabase.from("ad_campaigns").update(payload as any).eq("id", existing.id)
        : supabase.from("ad_campaigns").insert(payload as any);

      const { error } = await query;
      if (error) {
        Alert.alert("Save failed", error.message);
        return;
      }

      Alert.alert("Saved", "House Sponsor campaign is now active for this account.");
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.muted }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 4 }}>House Sponsor Tools</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
          Promote an account as House Sponsor without dealer subscription requirements.
        </Text>

        <View style={{ marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.muted, fontWeight: "900", marginBottom: 8 }}>Target account</Text>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search rider name (min 2 letters)..."
            placeholderTextColor={COLORS.muted}
            style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />

          {searching ? <Text style={{ color: COLORS.muted, marginTop: 8 }}>Searching...</Text> : null}

          {searchResults.length > 0 ? (
            <View style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, overflow: "hidden", backgroundColor: COLORS.bg }}>
              {searchResults.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    const fullName = String(row.full_name ?? "").trim();
                    setTargetUserId(row.id);
                    setTargetUserName(fullName);
                    setSearchQuery(fullName || row.id);
                    setSearchResults([]);
                    if (!sponsorName.trim()) setSponsorName(fullName || "House Sponsor");
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                    backgroundColor: COLORS.card,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }} numberOfLines={1}>
                    {row.full_name?.trim() || "Unnamed"}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 2 }} numberOfLines={1}>
                    {row.id}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <TextInput
            value={targetUserId}
            onChangeText={setTargetUserId}
            placeholder="User UUID"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <TextInput
            value={targetUserName}
            onChangeText={setTargetUserName}
            placeholder="Account name (optional)"
            placeholderTextColor={COLORS.muted}
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <Pressable
            onPress={fillNameFromUuid}
            style={{
              marginTop: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.chip,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>Fetch name from UUID</Text>
          </Pressable>

          <Text style={{ color: COLORS.muted, fontWeight: "900", marginTop: 14 }}>Sponsor creative</Text>
          <TextInput
            value={sponsorName}
            onChangeText={setSponsorName}
            placeholder="Sponsor name"
            placeholderTextColor={COLORS.muted}
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={COLORS.muted}
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Body"
            placeholderTextColor={COLORS.muted}
            multiline
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, minHeight: 100, backgroundColor: COLORS.bg, color: COLORS.text, textAlignVertical: "top" }}
          />
          <TextInput
            value={ctaText}
            onChangeText={setCtaText}
            placeholder="CTA text"
            placeholderTextColor={COLORS.muted}
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <TextInput
            value={ctaUrl}
            onChangeText={setCtaUrl}
            placeholder="CTA URL or route"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="Image URL (optional)"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            style={{ marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, backgroundColor: COLORS.bg, color: COLORS.text }}
          />

          <Text style={{ color: COLORS.muted, fontWeight: "900", marginTop: 12 }}>Placement</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={() => setPlacement("discover")}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: placement === "discover" ? COLORS.button : COLORS.chip,
              }}
            >
              <Text style={{ color: placement === "discover" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>Discover</Text>
            </Pressable>
            <Pressable
              onPress={() => setPlacement("following")}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: placement === "following" ? COLORS.button : COLORS.chip,
              }}
            >
              <Text style={{ color: placement === "following" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>Following</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!valid || saving}
            onPress={saveHouseSponsor}
            style={{
              marginTop: 16,
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
              backgroundColor: !valid || saving ? "#6A6A73" : COLORS.button,
            }}
          >
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
              {saving ? "Saving..." : "Make House Sponsor"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}