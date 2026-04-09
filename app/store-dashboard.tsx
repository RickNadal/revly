import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { uploadMediaToSupabase } from "../lib/uploadMedia";

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
  accent: "#7CFFB2",
  accentBg: "rgba(124,255,178,0.12)",
  danger: "#FF6B6B",
  dangerBg: "rgba(255,107,107,0.12)",
  pending: "#F5C451",
};

type Product = {
  id: string;
  title: string;
  body: string;
  cta_url: string;
  image_url: string | null;
  status: string;
  is_active: boolean;
  price_label: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: COLORS.accent,
  pending_review: COLORS.pending,
  rejected: COLORS.danger,
  suspended: COLORS.danger,
};

function statusLabel(s: string) {
  if (s === "active") return "Live";
  if (s === "pending_review") return "In review";
  if (s === "rejected") return "Afgewezen";
  if (s === "suspended") return "Gepauzeerd";
  return s;
}

export default function StoreDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const me = sessionData.session?.user?.id ?? null;
    setUserId(me);

    if (!me) {
      setLoading(false);
      return;
    }

    const { data: account } = await supabase
      .from("business_accounts")
      .select("business_name, status")
      .eq("user_id", me)
      .maybeSingle();

    setBusinessName(String((account as any)?.business_name ?? ""));
    setAccountStatus(String((account as any)?.status ?? ""));

    const status = String((account as any)?.status ?? "");
    if (status !== "active" && status !== "approved") {
      router.replace("/stores");
      return;
    }

    const { data: camps } = await supabase
      .from("ad_campaigns")
      .select("id, title, body, cta_url, image_url, status, is_active, price_label, created_at")
      .eq("owner_user_id", me)
      .eq("badge_text", "Store")
      .order("created_at", { ascending: false });

    setProducts((camps ?? []) as Product[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPrice("");
    setLink("");
    setImageUrl("");
    setEditingId(null);
    setShowForm(false);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toegang nodig", "Geef fototoegang om productafbeeldingen te uploaden.");
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
      const path = `stores/${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const publicUrl = await uploadMediaToSupabase(uri, "post-images", path, "image");
      setImageUrl(publicUrl);
    } catch (e: any) {
      Alert.alert("Afbeelding uploaden mislukt", e?.message ?? "Onbekende fout");
    } finally {
      setUploadingImage(false);
    }
  };

  const saveProduct = async () => {
    if (!userId) return;
    if (title.trim().length < 2) {
      Alert.alert("Titel ontbreekt", "Vul een producttitel in.");
      return;
    }
    if (description.trim().length < 8) {
      Alert.alert("Beschrijving ontbreekt", "Vul een korte productbeschrijving in.");
      return;
    }
    if (!link.trim()) {
      Alert.alert("Link ontbreekt", "Vul een product- of store-link in.");
      return;
    }

    // Auto-prepend https:// if user didn't type a protocol
    const rawLink = link.trim();
    const normalizedLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;

    setSaving(true);

    const payload: any = {
      title: title.trim(),
      body: description.trim(),
      cta_url: normalizedLink,
      price_label: price.trim() || null,
      image_url: imageUrl.trim() || null,
      status: "active",
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("ad_campaigns")
        .update(payload)
        .eq("id", editingId)
        .eq("owner_user_id", userId);

      setSaving(false);
      if (error) {
        Alert.alert("Product bijwerken mislukt", error.message);
        return;
      }
      Alert.alert("Product bijgewerkt", "Je wijzigingen staan nu live.");
    } else {
      const { error } = await supabase.from("ad_campaigns").insert({
        ...payload,
        owner_user_id: userId,
        sponsor_name: businessName || "Store",
        sponsor_type: "business",
        badge_text: "Store",
        cta_text: "View product",
        weight: 1,
        placement: "discover",
        min_posts_between: 10,
      });

      setSaving(false);
      if (error) {
        Alert.alert("Product plaatsen mislukt", error.message);
        return;
      }
      Alert.alert("Product live", "Je product is nu zichtbaar in de Shop.");
    }

    resetForm();
    void load();
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setTitle(p.title);
    setDescription(p.body);
    setPrice(p.price_label ?? "");
    setLink(p.cta_url);
    setImageUrl(p.image_url ?? "");
    setShowForm(true);
  };

  const deleteProduct = (p: Product) => {
    Alert.alert("Product verwijderen", `"${p.title}" verwijderen?`, [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          await supabase
            .from("ad_campaigns")
            .delete()
            .eq("id", p.id)
            .eq("owner_user_id", userId!);
          void load();
        },
      },
    ]);
  };

  if (!userId && !loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22 }}>Inloggen vereist</Text>
          <Pressable
            onPress={() => router.replace("/sign-in")}
            style={{ marginTop: 14, backgroundColor: COLORS.button, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 }}
          >
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>Inloggen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Terug</Text>
        </Pressable>

        <View style={{ padding: 18, borderRadius: 22, backgroundColor: COLORS.accentBg, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.accent, fontWeight: "900", letterSpacing: 0.6 }}>STORE DASHBOARD</Text>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900", marginTop: 6 }}>
            {businessName || "Mijn store"}
          </Text>
          <View style={{ marginTop: 8, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: STATUS_COLORS[accountStatus] ?? COLORS.muted, fontWeight: "900", fontSize: 12 }}>
              {statusLabel(accountStatus)}
            </Text>
          </View>
        </View>

        {/* Product list */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Mijn producten</Text>
            {!showForm && (
              <Pressable
                onPress={() => { resetForm(); setShowForm(true); }}
                style={{ backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>+ Product toevoegen</Text>
              </Pressable>
            )}
          </View>

          {loading ? (
            <Text style={{ color: COLORS.muted }}>Laden...</Text>
          ) : products.length === 0 ? (
            <View style={{ padding: 18, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" }}>
              <Text style={{ color: COLORS.muted, textAlign: "center" }}>Nog geen producten. Tik op &quot;+ Product toevoegen&quot; om je eerste listing te maken.</Text>
            </View>
          ) : (
            products.map((p) => (
              <View key={p.id} style={{ borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
                {p.image_url ? (
                  <Image source={{ uri: p.image_url }} style={{ width: "100%", height: 150 }} resizeMode="cover" />
                ) : null}
                <View style={{ padding: 12, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", flex: 1, marginRight: 8 }}>{p.title}</Text>
                    <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: COLORS.chip }}>
                      <Text style={{ color: STATUS_COLORS[p.status] ?? COLORS.muted, fontWeight: "900", fontSize: 11 }}>
                        {statusLabel(p.status)}
                      </Text>
                    </View>
                  </View>
                  {p.price_label ? (
                    <Text style={{ color: COLORS.accent, fontWeight: "900" }}>{p.price_label}</Text>
                  ) : null}
                  <Text style={{ color: COLORS.muted, lineHeight: 18 }} numberOfLines={3}>{p.body}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12 }} numberOfLines={1}>{p.cta_url}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Pressable
                      onPress={() => startEdit(p)}
                      style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Bewerken</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteProduct(p)}
                      style={{ borderRadius: 10, backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: COLORS.danger, paddingVertical: 8, paddingHorizontal: 18, alignItems: "center" }}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: "900" }}>Verwijderen</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Add / Edit form */}
        {showForm && (
          <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14, gap: 10 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {editingId ? "Product bewerken" : "Nieuw product"}
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Productnaam *"
              placeholderTextColor={COLORS.muted}
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Productbeschrijving *"
              placeholderTextColor={COLORS.muted}
              multiline
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11, minHeight: 90, textAlignVertical: "top" }}
            />

            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="Prijs (bijv. €49,99)"
              placeholderTextColor={COLORS.muted}
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }}
            />

            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="www.yourstore.com/product"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              keyboardType="url"
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.inputBg, color: COLORS.text, borderRadius: 12, padding: 11 }}
            />
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: -4 }}>Link naar de productpagina of je store. (https:// wordt automatisch toegevoegd)</Text>

            <Pressable
              disabled={uploadingImage}
              onPress={pickImage}
              style={{ backgroundColor: uploadingImage ? "#777" : COLORS.chip, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 11, alignItems: "center" }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {uploadingImage ? "Uploaden..." : imageUrl ? "Afbeelding wijzigen" : "Productafbeelding kiezen"}
              </Text>
            </Pressable>

            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 160, borderRadius: 12 }} resizeMode="cover" />
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
              <Pressable
                onPress={resetForm}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: COLORS.muted, fontWeight: "900" }}>Annuleren</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={saveProduct}
                style={{ flex: 2, backgroundColor: saving ? "#777" : COLORS.button, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                  {saving ? "Opslaan..." : editingId ? "Wijzigingen opslaan" : "Product plaatsen"}
                </Text>
              </Pressable>
            </View>

            <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
              Producten gaan direct live. Je kunt ze op elk moment aanpassen of verwijderen.
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
