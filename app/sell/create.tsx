// app/sell/create.tsx
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type Picked = { uri: string; base64?: string | null };

type Condition = "new" | "like_new" | "good" | "fair" | "parts";
type Category = "bike" | "parts" | "gear" | "other";

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

function isDuplicateKeyError(err: any) {
  const code = err?.code ?? err?.error_code ?? err?.statusCode ?? err?.status_code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (String(code) === "23505") return true;
  if (msg.includes("duplicate key") || msg.includes("unique") || msg.includes("already exists")) return true;
  return false;
}

export default function CreateListingScreen() {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [priceText, setPriceText] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");

  const [condition, setCondition] = useState<Condition>("good");
  const [category, setCategory] = useState<Category>("gear");

  const [photos, setPhotos] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);

  const priceCents = useMemo(() => {
    const normalized = priceText.replace(",", ".").trim();
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [priceText]);

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? COLORS.button : COLORS.chip,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("sell_create.permission_needed_title", { defaultValue: "Permission needed" }),
        t("sell_create.permission_needed_body", { defaultValue: "Allow photo access." })
      );
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 8,
      base64: true,
    });

    if (res.canceled) return;

    setPhotos(
      res.assets.map((a) => ({
        uri: a.uri,
        base64: a.base64 ?? null,
      }))
    );
  };

  const uploadImage = async (userId: string, photo: Picked) => {
    let base64 = photo.base64;

    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: "base64" });
    }
    if (!base64) throw new Error(t("sell_create.read_image_failed", { defaultValue: "Could not read image data. Try picking again." }));

    const bytes = base64ToBytes(base64);
    const filePath = `listings/${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;

    const { error } = await supabase.storage.from("post-images").upload(filePath, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });

    if (error) throw error;

    return supabase.storage.from("post-images").getPublicUrl(filePath).data.publicUrl;
  };

  const createListing = async () => {
    const tt = title.trim();
    const desc = description.trim();

    if (!tt) {
      Alert.alert(
        t("sell_create.missing_title_title", { defaultValue: "Missing title" }),
        t("sell_create.missing_title_body", { defaultValue: "Add a short title." })
      );
      return;
    }
    if (!priceCents) {
      Alert.alert(
        t("sell_create.missing_price_title", { defaultValue: "Missing price" }),
        t("sell_create.missing_price_body", { defaultValue: "Add a valid price (e.g. 250 or 250.00)." })
      );
      return;
    }
    if (photos.length === 0) {
      Alert.alert(
        t("sell_create.add_photos_title", { defaultValue: "Add photos" }),
        t("sell_create.add_photos_body", { defaultValue: "Pick at least 1 photo." })
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

    const userId = session.user.id;

    const { data: listing, error: listErr } = await supabase
      .from("listings")
      .insert({
        seller_id: userId,
        title: tt,
        description: desc || null,
        price_cents: priceCents,
        currency,
        condition,
        category,
        location_text: locationText.trim() || null,
        status: "active",
      } as any)
      .select("id")
      .single();

    if (listErr || !listing?.id) {
      setLoading(false);

      const msg = listErr?.message ?? t("sell_create.create_listing_generic_error", { defaultValue: "Could not create listing" });

      if (msg.toLowerCase().includes("relation") || msg.toLowerCase().includes("does not exist")) {
        Alert.alert(
          t("sell_create.marketplace_not_setup_title", { defaultValue: "Marketplace not set up yet" }),
          t("sell_create.marketplace_not_setup_body", {
            defaultValue:
              "The database tables for Marketplace (listings/listing_media) do not exist yet. Next step is adding them in Supabase.",
          })
        );
        return;
      }

      if (isDuplicateKeyError(listErr)) {
        Alert.alert(
          t("sell_create.create_failed_title", { defaultValue: "Create failed" }),
          t("sell_create.create_failed_duplicate", { defaultValue: "This listing already exists." })
        );
        return;
      }

      Alert.alert(t("sell_create.create_failed_title", { defaultValue: "Create failed" }), msg);
      return;
    }

    const listingId = listing.id as string;

    try {
      for (let i = 0; i < photos.length; i++) {
        const url = await uploadImage(userId, photos[i]);

        const { error: mediaErr } = await supabase.from("listing_media").insert({
          listing_id: listingId,
          url,
          sort_order: i,
        } as any);

        if (mediaErr) throw mediaErr;
      }

      setLoading(false);
      Alert.alert(
        t("sell_create.listed_title", { defaultValue: "Listed" }),
        t("sell_create.listed_body", { defaultValue: "Your item is now live in Marketplace." })
      );
      router.replace("/sell/browse");
    } catch (e: any) {
      setLoading(false);
      Alert.alert(t("sell_create.upload_failed_title", { defaultValue: "Upload failed" }), e?.message ?? "Unknown error");
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("sell_create.title", { defaultValue: "Sell an item" })}
        </Text>
        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>
          {t("sell_create.subtitle", { defaultValue: "Create a proper listing with price + photos" })}
        </Text>

        <TextInput
          placeholder={t("sell_create.title_placeholder", { defaultValue: "Title (e.g. Shoei helmet, BMW GS gloves)" })}
          placeholderTextColor={COLORS.muted}
          value={title}
          onChangeText={setTitle}
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
          }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              placeholder={t("sell_create.price_placeholder", { defaultValue: "Price" })}
              placeholderTextColor={COLORS.muted}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                padding: 12,
                borderRadius: 12,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
              }}
            />
          </View>
          <View style={{ width: 90 }}>
            <TextInput
              placeholder={t("sell_create.currency_placeholder", { defaultValue: "EUR" })}
              placeholderTextColor={COLORS.muted}
              value={currency}
              onChangeText={setCurrency}
              autoCapitalize="characters"
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                padding: 12,
                borderRadius: 12,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
              }}
            />
          </View>
        </View>

        <TextInput
          placeholder={t("sell_create.location_placeholder", { defaultValue: "Location (optional) — e.g. Amsterdam" })}
          placeholderTextColor={COLORS.muted}
          value={locationText}
          onChangeText={setLocationText}
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
          }}
        />

        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>{t("sell_create.category_title", { defaultValue: "Category" })}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Chip active={category === "bike"} label={t("sell_create.category_bike", { defaultValue: "Bike" })} onPress={() => setCategory("bike")} />
          <Chip
            active={category === "parts"}
            label={t("sell_create.category_parts", { defaultValue: "Parts" })}
            onPress={() => setCategory("parts")}
          />
          <Chip active={category === "gear"} label={t("sell_create.category_gear", { defaultValue: "Gear" })} onPress={() => setCategory("gear")} />
          <Chip
            active={category === "other"}
            label={t("sell_create.category_other", { defaultValue: "Other" })}
            onPress={() => setCategory("other")}
          />
        </View>

        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>{t("sell_create.condition_title", { defaultValue: "Condition" })}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Chip active={condition === "new"} label={t("sell_create.condition_new", { defaultValue: "New" })} onPress={() => setCondition("new")} />
          <Chip
            active={condition === "like_new"}
            label={t("sell_create.condition_like_new", { defaultValue: "Like new" })}
            onPress={() => setCondition("like_new")}
          />
          <Chip active={condition === "good"} label={t("sell_create.condition_good", { defaultValue: "Good" })} onPress={() => setCondition("good")} />
          <Chip active={condition === "fair"} label={t("sell_create.condition_fair", { defaultValue: "Fair" })} onPress={() => setCondition("fair")} />
          <Chip
            active={condition === "parts"}
            label={t("sell_create.condition_parts", { defaultValue: "Parts" })}
            onPress={() => setCondition("parts")}
          />
        </View>

        <TextInput
          placeholder={t("sell_create.description_placeholder", { defaultValue: "Description (optional) — specs, size, year, notes…" })}
          placeholderTextColor={COLORS.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            minHeight: 90,
          }}
        />

        <Pressable
          onPress={pickPhotos}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#777" : COLORS.button,
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {t("sell_create.pick_photos", { defaultValue: "Pick Photos (max 8)" })}
          </Text>
        </Pressable>

        {photos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ position: "relative" }}>
                <Image
                  source={{ uri: p.uri }}
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#0F0F16",
                  }}
                />
                <Pressable
                  onPress={() => removePhoto(i)}
                  disabled={loading}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "rgba(0,0,0,0.65)",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.15)",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>{t("sell_create.remove_photo", { defaultValue: "✕" })}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={createListing}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#777" : COLORS.button,
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading ? t("sell_create.listing_loading", { defaultValue: "Listing..." }) : t("sell_create.publish", { defaultValue: "Publish listing" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={{
            marginTop: 6,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("common.back", { defaultValue: "Back" })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}