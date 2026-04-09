import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { uploadMediaToSupabase } from "../lib/uploadMedia";

type Placement = "discover" | "following";

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

export default function HouseSponsorRequestScreen() {
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("Meer info");
  const [ctaUrl, setCtaUrl] = useState("");
  const [placement, setPlacement] = useState<Placement>("discover");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const trimmedBusinessName = useMemo(() => businessName.trim(), [businessName]);
  const trimmedContactEmail = useMemo(() => contactEmail.trim(), [contactEmail]);
  const trimmedSponsorName = useMemo(() => sponsorName.trim(), [sponsorName]);
  const trimmedTitle = useMemo(() => title.trim(), [title]);
  const trimmedBody = useMemo(() => body.trim(), [body]);

  const getValidationErrors = () => {
    const errors: string[] = [];

    if (!trimmedBusinessName) errors.push("Bedrijfsnaam is verplicht.");
    if (!trimmedContactEmail) errors.push("Contact e-mail is verplicht.");
    if (trimmedContactEmail && !/^\S+@\S+\.\S+$/.test(trimmedContactEmail)) {
      errors.push("Contact e-mail lijkt ongeldig.");
    }
    if (!trimmedSponsorName) errors.push("Sponsornaam is verplicht.");
    if (!trimmedTitle) errors.push("Campagnetitel is verplicht.");
    if (!trimmedBody) errors.push("Advertentietekst is verplicht.");

    return errors;
  };

  const valid = useMemo(() => getValidationErrors().length === 0, [trimmedBusinessName, trimmedContactEmail, trimmedSponsorName, trimmedTitle, trimmedBody]);

  const pickImage = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      router.replace("/sign-in");
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toegang nodig", "Geef fototoegang om een sponsorafbeelding te uploaden.");
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
      const uri = picked.assets[0].uri;
      const clean = String(uri).split("?")[0].split("#")[0];
      const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
      const path = `house-sponsor-submissions/${uid}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const publicUrl = await uploadMediaToSupabase(uri, "post-images", path, "image");
      setImageUrl(publicUrl);
    } catch (e: any) {
      Alert.alert("Upload mislukt", e?.message ?? "Afbeelding uploaden mislukt.");
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async () => {
    const errors = getValidationErrors();
    if (errors.length > 0) {
      Alert.alert("Ontbrekende info", errors.join("\n"));
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

    const { error } = await supabase.from("house_sponsor_submissions").insert({
      user_id: session.user.id,
      business_name: trimmedBusinessName,
      contact_email: trimmedContactEmail,
      sponsor_name: trimmedSponsorName,
      title: trimmedTitle,
      body: trimmedBody,
      cta_text: ctaText.trim() || null,
      cta_url: ctaUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      placement,
      status: "pending",
    } as any);

    setLoading(false);

    if (error) {
      Alert.alert("Verzenden mislukt", error.message);
      return;
    }

    Alert.alert("Verzonden", "Je House Sponsor-verzoek is verstuurd voor admin review.");
    router.back();
  };

  const PlacementChip = ({ label, value }: { label: string; value: Placement }) => {
    const active = placement === value;
    return (
      <Pressable
        onPress={() => setPlacement(value)}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? COLORS.button : COLORS.chip,
          borderWidth: 1,
          borderColor: active ? "#7CFFB2" : COLORS.border,
        }}
      >
        <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 36 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Terug</Text>
        </Pressable>

        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900" }}>House Sponsor-aanvraag</Text>
        <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
          Stuur je sponsorgegevens en afbeelding in. Admin kan dit beoordelen en handmatig publiceren.
        </Text>

        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Bedrijfsnaam"
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={contactEmail}
          onChangeText={setContactEmail}
          placeholder="Contact e-mail"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={sponsorName}
          onChangeText={setSponsorName}
          placeholder="Sponsornaam op de kaart"
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Campagnetitel"
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Advertentietekst"
          placeholderTextColor={COLORS.muted}
          multiline
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, minHeight: 120, textAlignVertical: "top", backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={ctaText}
          onChangeText={setCtaText}
          placeholder="CTA-tekst (optioneel)"
          placeholderTextColor={COLORS.muted}
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <TextInput
          value={ctaUrl}
          onChangeText={setCtaUrl}
          placeholder="CTA-URL (optioneel)"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 14, padding: 12, backgroundColor: COLORS.inputBg, color: COLORS.text }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <PlacementChip label="Ontdek" value="discover" />
          <PlacementChip label="Volgend" value="following" />
        </View>

        <Pressable
          onPress={pickImage}
          disabled={uploadingImage || loading}
          style={{
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 14,
            paddingVertical: 12,
            alignItems: "center",
            opacity: uploadingImage || loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {uploadingImage ? "Afbeelding uploaden..." : "Afbeelding uploaden"}
          </Text>
        </Pressable>

        {imageUrl ? (
          <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
            <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={loading || uploadingImage}
          style={{
            backgroundColor: loading || uploadingImage ? "#6A6A73" : COLORS.button,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{loading ? "Versturen..." : "Verzoek versturen"}</Text>
        </Pressable>

        {!valid ? (
          <Text style={{ color: COLORS.muted, fontSize: 12 }}>
            Vul bedrijfsnaam, e-mail, sponsornaam, titel en tekst in om te versturen.
          </Text>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
