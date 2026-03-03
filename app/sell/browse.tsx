// app/sell/browse.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type ListingMediaRow = {
  id?: string;
  url?: string | null;
  path?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  [key: string]: any;
};

type ListingLike = {
  id: string;
  created_at?: string | null;

  title?: string | null;
  name?: string | null;
  item_name?: string | null;

  description?: string | null;
  details?: string | null;
  caption?: string | null;
  body?: string | null;

  price?: number | string | null;
  amount?: number | string | null;
  cost?: number | string | null;
  currency?: string | null;
  currency_code?: string | null;

  condition?: string | null;
  item_condition?: string | null;
  product_condition?: string | null;
  state?: string | null;
  quality?: string | null;

  location?: string | null;
  pickup_location?: string | null;
  meet_location?: string | null;
  meetup_location?: string | null;
  address?: string | null;
  city?: string | null;
  town?: string | null;
  region?: string | null;
  province?: string | null;
  country?: string | null;
  postcode?: string | null;
  zip?: string | null;

  seller_id?: string | null;

  image_url?: string | null;
  cover_url?: string | null;
  photo_url?: string | null;

  listing_media?: ListingMediaRow[] | null;

  is_sold?: boolean | null;
  sold_at?: string | null;
  auto_delete_at?: string | null;

  [key: string]: any;
};

type ListingView = ListingLike & { _media_urls?: string[] };

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

const { width: SCREEN_W } = Dimensions.get("window");
const SIDE = 16;
const PAD = 12;
const IMAGE_W = Math.floor(SCREEN_W - SIDE * 2 - PAD * 2);
const IMAGE_H = 280;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function normalizeStoragePath(raw: string) {
  let p = raw.trim();
  p = p.replace(/^\/+/, "");

  const m = p.match(/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/i);
  if (m) return { bucket: m[2], path: m[3] };

  const parts = p.split("/");
  if (parts.length >= 2) {
    return { bucket: parts[0], path: parts.slice(1).join("/") };
  }

  return { bucket: null as string | null, path: p };
}

const MEDIA_BUCKET_CANDIDATES = ["listing-images", "listings", "marketplace", "post-images"];

async function resolveMediaUrl(raw: string): Promise<string | null> {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (isHttpUrl(s)) return s;

  const { bucket, path } = normalizeStoragePath(s);
  const tryBuckets = bucket ? [bucket] : MEDIA_BUCKET_CANDIDATES;

  for (const b of tryBuckets) {
    try {
      const pub = supabase.storage.from(b).getPublicUrl(path).data.publicUrl;
      if (pub) return pub;
    } catch {}
  }

  for (const b of tryBuckets) {
    try {
      const { data, error } = await supabase.storage.from(b).createSignedUrl(path, 60 * 60);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {}
  }

  return null;
}

function firstString(...vals: any[]): string | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function extractTitle(item: ListingLike, fallbackTitle: string): string {
  return (firstString(item.title, item.name, item.item_name, item.caption) ?? fallbackTitle) as any;
}

function extractDescription(item: ListingLike): string {
  return (firstString(item.description, item.details, item.body, item.caption) ?? "") as any;
}

function extractCreatedAt(item: ListingLike): string | null {
  const t = firstString(item.created_at, (item as any).createdAt);
  return t ? String(t) : null;
}

function guessCurrency(item: ListingLike): string {
  const c = firstString(item.currency, item.currency_code);
  if (!c) return "€";
  if (c === "EUR") return "€";
  return String(c);
}

function formatMoney(currency: string, value: string) {
  const cur = currency.length <= 2 ? currency : currency === "EUR" ? "€" : currency + " ";
  return `${cur}${value}`;
}

function isFiniteNumber(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n);
}

const PRICE_KEYS = [
  "price",
  "amount",
  "cost",
  "asking_price",
  "ask_price",
  "sale_price",
  "listing_price",
  "price_eur",
  "price_value",
  "price_amount",
  "price_cents",
  "amount_cents",
  "price_in_cents",
];

const CONDITION_KEYS = ["condition", "item_condition", "product_condition", "state", "quality"];

const LOCATION_KEYS = [
  "location",
  "pickup_location",
  "pick_up_location",
  "meet_location",
  "meetup_location",
  "meeting_location",
  "address",
  "pickup_address",
  "meetup_address",
  "city",
  "city_name",
  "town",
  "area",
  "locality",
  "municipality",
  "region",
  "province",
  "state",
  "county",
  "country",
  "postcode",
  "postal_code",
  "zip",
];

function pickByKeyCandidates(item: ListingLike, candidates: string[]) {
  const keys = Object.keys(item || {});
  for (const c of candidates) {
    if (c in item) return { key: c, value: (item as any)[c] };
  }
  const lower = keys.map((k) => ({ k, lk: k.toLowerCase() }));
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const hit = lower.find((x) => x.lk.includes(lc));
    if (hit) return { key: hit.k, value: (item as any)[hit.k] };
  }
  return null;
}

function detectPrice(item: ListingLike): string | null {
  const hit = pickByKeyCandidates(item, PRICE_KEYS);
  if (!hit) return null;

  const currency = guessCurrency(item);
  const k = hit.key.toLowerCase();
  const v = hit.value;

  if (k.includes("cents") && isFiniteNumber(v)) {
    const euros = (Number(v) / 100).toFixed(2);
    return formatMoney(currency, euros);
  }

  if (v === null || v === undefined || String(v).trim() === "") return null;
  return formatMoney(currency, String(v).trim());
}

function detectCondition(item: ListingLike): string | null {
  const hit = pickByKeyCandidates(item, CONDITION_KEYS);
  if (!hit || hit.value === null || hit.value === undefined) return null;
  const s = String(hit.value).trim();
  return s ? s : null;
}

function detectLocation(item: ListingLike): string | null {
  const full = pickByKeyCandidates(item, [
    "location",
    "pickup_location",
    "meet_location",
    "meetup_location",
    "address",
    "pickup_address",
    "meetup_address",
  ]);
  if (full?.value) {
    const s = String(full.value).trim();
    if (s) return s;
  }

  const city = pickByKeyCandidates(item, ["city", "city_name", "town", "area", "locality", "municipality"]);
  const region = pickByKeyCandidates(item, ["region", "province", "state", "county"]);
  const country = pickByKeyCandidates(item, ["country"]);
  const postal = pickByKeyCandidates(item, ["postcode", "postal_code", "zip"]);

  const parts: string[] = [];
  if (city?.value) {
    const s = String(city.value).trim();
    if (s) parts.push(s);
  }
  if (region?.value) {
    const s = String(region.value).trim();
    if (s) parts.push(s);
  }
  if (country?.value) {
    const s = String(country.value).trim();
    if (s) parts.push(s);
  }

  let composed = parts.join(", ");

  if (postal?.value) {
    const s = String(postal.value).trim();
    if (s) composed = composed ? `${composed} (${s})` : s;
  }

  return composed || null;
}

function extractRawMediaStrings(item: ListingLike): string[] {
  const urls: string[] = [];

  const direct = firstString(item.image_url, item.cover_url, item.photo_url, (item as any).image);
  if (direct) urls.push(direct);

  const media = Array.isArray(item.listing_media) ? item.listing_media : [];
  const sorted = [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const m of sorted) {
    const raw = firstString(m.url, m.path, (m as any).image_url, (m as any).public_url, (m as any).file_path);
    if (raw) urls.push(raw);
  }

  return Array.from(new Set(urls)).filter(Boolean);
}

function diagonalBannerTextStyle() {
  return {
    color: "#FFFFFF",
    fontWeight: "900" as const,
    fontSize: 14,
    letterSpacing: 1,
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: "900", flex: 1, textAlign: "right" }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function MarketplaceBrowse() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ListingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState("");
  const [carouselIndexById, setCarouselIndexById] = useState<Record<string, number>>({});

  const [meId, setMeId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/sign-in");
      return null;
    }
    const id = data.session.user.id;
    setMeId(id);
    return id;
  };

  const runCleanupSilent = async () => {
    try {
      await supabase.rpc("cleanup_sold_listings");
    } catch {}
  };

  const openViewer = (urls: string[], index: number) => {
    if (!urls.length) return;
    router.push({
      pathname: "/viewer",
      params: { urls: JSON.stringify(urls), index: String(index) },
    });
  };

  const messageSeller = async (sellerId: string) => {
    try {
      const me = await ensureAuth();
      if (!me) return;

      if (!sellerId) {
        Alert.alert(
          t("marketplace.missing_seller_title", { defaultValue: "Missing seller" }),
          t("marketplace.missing_seller_body", { defaultValue: "This listing has no seller id." })
        );
        return;
      }
      if (sellerId === me) {
        Alert.alert(
          t("marketplace.not_available_title", { defaultValue: "Not available" }),
          t("marketplace.not_available_body", { defaultValue: "You can’t message yourself." })
        );
        return;
      }

      const { data: threadId, error } = await supabase.rpc("dm_get_or_create_thread", {
        other_user: sellerId,
      });

      if (error) {
        Alert.alert(t("marketplace.message_failed_title", { defaultValue: "Message failed" }), error.message);
        return;
      }

      router.push({ pathname: "/messages/[id]", params: { id: String(threadId) } });
    } catch (e: any) {
      Alert.alert(t("marketplace.message_failed_title", { defaultValue: "Message failed" }), e?.message ?? "Unknown error");
    }
  };

  const setCarouselIndex = (id: string, idx: number) => {
    setCarouselIndexById((prev) => {
      if (prev[id] === idx) return prev;
      return { ...prev, [id]: idx };
    });
  };

  const optimisticSetSold = (listingId: string, sold: boolean) => {
    setItems((prev) =>
      prev.map((it) => {
        if (String(it.id) !== String(listingId)) return it;
        return { ...(it as any), is_sold: sold };
      })
    );
  };

  const markSold = async (listing: ListingView, nextSold: boolean) => {
    try {
      const me = await ensureAuth();
      if (!me) return;

      const sellerId = listing.seller_id ?? null;
      if (!sellerId || sellerId !== me) return;

      const listingId = String(listing.id);

      optimisticSetSold(listingId, nextSold);

      const { error } = await supabase.rpc("listing_set_sold", {
        target_listing: listingId,
        sold: nextSold,
      });

      if (error) {
        optimisticSetSold(listingId, !nextSold);
        Alert.alert(
          t("marketplace.update_failed_title", { defaultValue: "Update failed" }),
          t("marketplace.update_failed_body", { defaultValue: "Couldn’t update this listing." })
        );
        return;
      }

      await load();
    } catch (e: any) {
      Alert.alert(t("marketplace.update_failed_title", { defaultValue: "Update failed" }), e?.message ?? "Unknown error");
    }
  };

  const deleteListing = async (listing: ListingView) => {
    const me = await ensureAuth();
    if (!me) return;

    const sellerId = listing.seller_id ?? null;
    if (!sellerId || sellerId !== me) return;

    Alert.alert(
      t("marketplace.delete_listing_title", { defaultValue: "Delete listing" }),
      t("marketplace.delete_listing_body", { defaultValue: "This will permanently delete the listing." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("common.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            try {
              const listingId = String(listing.id);

              const { error } = await supabase.rpc("listing_delete", {
                target_listing: listingId,
              });

              if (error) {
                Alert.alert(
                  t("marketplace.delete_failed_title", { defaultValue: "Delete failed" }),
                  t("marketplace.delete_failed_body", { defaultValue: "Couldn’t delete this listing." })
                );
                return;
              }

              await load();
            } catch (e: any) {
              Alert.alert(t("marketplace.delete_failed_title", { defaultValue: "Delete failed" }), e?.message ?? "Unknown error");
            }
          },
        },
      ]
    );
  };

  const MediaCarousel = ({
    id,
    urls,
    sold,
    soldLabel,
  }: {
    id: string;
    urls: string[];
    sold: boolean;
    soldLabel: string;
  }) => {
    const currentIndex = carouselIndexById[id] ?? 0;
    const listRef = useRef<FlatList<string>>(null);
    const safeIndex = clamp(currentIndex, 0, Math.max(0, urls.length - 1));

    useEffect(() => {
      const tt = setTimeout(() => {
        if (urls.length <= 1) return;
        try {
          listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
        } catch {}
      }, 0);
      return () => clearTimeout(tt);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, urls.length]);

    return (
      <View style={{ marginTop: 10 }}>
        <View
          style={{
            width: IMAGE_W,
            height: IMAGE_H,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#0F0F16",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <FlatList
            ref={listRef}
            data={urls}
            keyExtractor={(u, i) => `${id}:${i}:${u}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            pagingEnabled
            snapToInterval={IMAGE_W}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            bounces={false}
            overScrollMode="never"
            nestedScrollEnabled={Platform.OS === "android"}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const idx = clamp(Math.round(x / IMAGE_W), 0, urls.length - 1);
              if (idx !== safeIndex) setCarouselIndex(id, idx);
            }}
            getItemLayout={(_, index) => ({ length: IMAGE_W, offset: IMAGE_W * index, index })}
            initialScrollIndex={safeIndex}
            onScrollToIndexFailed={() => {
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
                } catch {}
              }, 40);
            }}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => openViewer(urls, index)} onStartShouldSetResponder={() => true} style={{ width: IMAGE_W, height: IMAGE_H }}>
                <Image source={{ uri: item }} style={{ width: "100%", height: "100%" }} resizeMode="cover" fadeDuration={Platform.OS === "android" ? 0 : undefined} />
              </Pressable>
            )}
          />

          {sold ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -60,
                top: 24,
                width: IMAGE_W + 120,
                transform: [{ rotate: "-16deg" }],
                backgroundColor: "rgba(255,77,77,0.92)",
                paddingVertical: 10,
                alignItems: "center",
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: "rgba(255,255,255,0.22)",
              }}
            >
              <Text style={diagonalBannerTextStyle()}>{soldLabel}</Text>
            </View>
          ) : null}

          {urls.length > 1 ? (
            <View
              style={{
                position: "absolute",
                right: 10,
                top: 10,
                backgroundColor: "rgba(0,0,0,0.55)",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
              pointerEvents="none"
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                {safeIndex + 1} / {urls.length}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const load = useCallback(async () => {
    const me = await ensureAuth();
    if (!me) return;

    runCleanupSilent();

    setLoading(true);

    const tryRel = await supabase.from("listings").select("*, listing_media(*)").order("created_at", { ascending: false }).limit(200);

    const fallback = tryRel.error
      ? await supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(200)
      : null;

    const data = (fallback ? fallback.data : tryRel.data) as any[] | null;
    const error = (fallback ? fallback.error : tryRel.error) as any;

    if (error) {
      setLoading(false);
      Alert.alert(t("marketplace.load_failed_title", { defaultValue: "Load failed" }), error.message);
      return;
    }

    const raw = (data ?? []) as any as ListingLike[];

    const withMedia: ListingView[] = await Promise.all(
      raw.map(async (it) => {
        const rawMedia = extractRawMediaStrings(it);
        const resolved = (await Promise.all(rawMedia.map((m) => resolveMediaUrl(m)))).filter(Boolean) as string[];
        return { ...(it as any), _media_urls: resolved };
      })
    );

    if (mountedRef.current) {
      setItems(withMedia);
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((it) => {
      const tt = extractTitle(it, t("marketplace.listing_fallback_title", { defaultValue: "Listing" })).toLowerCase();
      const d = extractDescription(it).toLowerCase();
      return tt.includes(s) || d.includes(s);
    });
  }, [items, q, t]);

  const soldLabel = t("marketplace.sold_banner", { defaultValue: "SOLD" });
  const listingFallbackTitle = t("marketplace.listing_fallback_title", { defaultValue: "Listing" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>
              {t("marketplace.title", { defaultValue: "Marketplace" })}
            </Text>
            <Text style={{ marginTop: 2, color: COLORS.muted, fontWeight: "800" }}>
              {t("marketplace.browse_subtitle", { defaultValue: "Browse items" })}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/sell/create")}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: pressed ? "rgba(255,255,255,0.10)" : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="add" size={22} color={COLORS.text} />
          </Pressable>
        </View>

        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Ionicons name="search-outline" size={18} color={COLORS.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("marketplace.search_placeholder", { defaultValue: "Search listings…" })}
            placeholderTextColor={COLORS.muted}
            style={{ flex: 1, color: COLORS.text, fontWeight: "800" }}
          />
          {q.trim() ? (
            <Pressable onPress={() => setQ("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: COLORS.muted }}>
              {loading
                ? t("common.loading", { defaultValue: "Loading…" })
                : t("marketplace.empty_state", { defaultValue: "No listings yet. Tap + to sell an item." })}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const id = String(item.id);
          const title = extractTitle(item, listingFallbackTitle);
          const desc = extractDescription(item);
          const createdAt = extractCreatedAt(item);

          const price = detectPrice(item);
          const condition = detectCondition(item);
          const location = detectLocation(item);

          const urls = (item._media_urls ?? []).filter(Boolean);

          const sold = item.is_sold === true;
          const isSeller = Boolean(meId && item.seller_id && meId === item.seller_id);

          const soldMetaText = sold ? t("marketplace.sold_meta", { defaultValue: "Sold • auto-delete in 3 days" }) : null;

          return (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                padding: 12,
                borderRadius: 18,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>

                {price ? (
                  <View
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: COLORS.chip,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>{price}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                {createdAt ? (
                  <Text style={{ color: COLORS.muted, fontWeight: "700" }}>{new Date(createdAt).toLocaleString()}</Text>
                ) : (
                  <View />
                )}

                {soldMetaText ? (
                  <View
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,77,77,0.16)",
                      borderWidth: 1,
                      borderColor: "rgba(255,77,77,0.35)",
                    }}
                  >
                    <Text style={{ color: "#FFD6D6", fontWeight: "900" }}>{soldMetaText}</Text>
                  </View>
                ) : null}
              </View>

              {urls.length > 0 ? (
                <MediaCarousel id={id} urls={urls} sold={sold} soldLabel={soldLabel} />
              ) : (
                <View
                  style={{
                    marginTop: 10,
                    width: IMAGE_W,
                    height: 160,
                    borderRadius: 16,
                    backgroundColor: "#0F0F16",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {sold ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: -60,
                        top: 24,
                        width: IMAGE_W + 120,
                        transform: [{ rotate: "-16deg" }],
                        backgroundColor: "rgba(255,77,77,0.92)",
                        paddingVertical: 10,
                        alignItems: "center",
                        borderTopWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: "rgba(255,255,255,0.22)",
                      }}
                    >
                      <Text style={diagonalBannerTextStyle()}>{soldLabel}</Text>
                    </View>
                  ) : null}

                  <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                    {t("marketplace.no_photos", { defaultValue: "No photos" })}
                  </Text>
                </View>
              )}

              {desc ? (
                <Text style={{ marginTop: 10, color: COLORS.text, lineHeight: 20 }} numberOfLines={6}>
                  {desc}
                </Text>
              ) : null}

              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: COLORS.bg,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  gap: 8,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {t("marketplace.details_title", { defaultValue: "Details" })}
                </Text>

                <DetailRow label={t("marketplace.detail_price", { defaultValue: "Price" })} value={price ?? "—"} />
                <DetailRow label={t("marketplace.detail_condition", { defaultValue: "Condition" })} value={condition ?? "—"} />
                <DetailRow label={t("marketplace.detail_location", { defaultValue: "Location" })} value={location ?? "—"} />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  disabled={!item.seller_id}
                  onPress={() => {
                    if (!item.seller_id) return;
                    router.push({ pathname: "/rider", params: { id: item.seller_id } });
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    opacity: item.seller_id ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {t("marketplace.view_seller", { defaultValue: "View seller" })}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!item.seller_id}
                  onPress={() => {
                    if (!item.seller_id) return;
                    messageSeller(item.seller_id);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 14,
                    backgroundColor: COLORS.button,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    opacity: item.seller_id ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                    {t("marketplace.message_seller", { defaultValue: "Message seller" })}
                  </Text>
                </Pressable>
              </View>

              {isSeller ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={() => {
                      const title = sold
                        ? t("marketplace.mark_available_title", { defaultValue: "Mark as available?" })
                        : t("marketplace.mark_sold_title", { defaultValue: "Mark as sold?" });

                      const body = sold
                        ? t("marketplace.mark_available_body", { defaultValue: "This will remove the SOLD banner." })
                        : t("marketplace.mark_sold_body", {
                            defaultValue: "This will add a SOLD banner and set the listing to auto-delete after 3 days.",
                          });

                      const actionText = sold
                        ? t("marketplace.mark_available", { defaultValue: "Mark available" })
                        : t("marketplace.mark_sold", { defaultValue: "Mark sold" });

                      Alert.alert(title, body, [
                        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                        { text: actionText, style: "default", onPress: () => markSold(item, !sold) },
                      ]);
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: sold ? "rgba(49,210,124,0.14)" : "rgba(49,210,124,0.18)",
                      borderWidth: 1,
                      borderColor: sold ? "rgba(49,210,124,0.40)" : "rgba(49,210,124,0.45)",
                      alignItems: "center",
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text style={{ color: "#D9FFE9", fontWeight: "900" }}>
                      {sold ? t("marketplace.mark_available", { defaultValue: "Mark available" }) : t("marketplace.mark_sold", { defaultValue: "Mark sold" })}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => deleteListing(item)}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: pressed ? "rgba(255,77,77,0.14)" : "rgba(255,77,77,0.10)",
                      borderWidth: 1,
                      borderColor: "rgba(255,77,77,0.45)",
                      alignItems: "center",
                    })}
                  >
                    <Text style={{ color: "#FFD1D1", fontWeight: "900" }}>
                      {t("marketplace.delete_listing_button", { defaultValue: "Delete listing" })}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <Pressable
        onPress={() => router.push("/sell/create")}
        hitSlop={12}
        style={({ pressed }) => ({
          position: "absolute",
          right: 18,
          bottom: insets.bottom + 18,
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: pressed ? "rgba(255,255,255,0.90)" : COLORS.button,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        })}
      >
        <Ionicons name="add" size={28} color={COLORS.buttonText} />
      </Pressable>
    </SafeAreaView>
  );
}