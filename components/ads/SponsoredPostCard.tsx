// components/ads/SponsoredPostCard.tsx
import type { Placement, SponsoredAd } from "@/lib/ads/sponsoredTypes";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Dimensions, Image, Pressable, Text, View } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_SIDE_MARGIN = 16;
const CARD_PADDING = 12;
const IMAGE_W = SCREEN_W - CARD_SIDE_MARGIN * 2 - CARD_PADDING * 2;
const IMAGE_H = 280;

const COLORS = {
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  white: "#FFFFFF",
  black: "#0B0B0F",
  sponsorBg: "#12121A",
  sponsorPill: "rgba(255,255,255,0.12)",
  sponsorAccent: "rgba(245,196,81,0.16)",
};

type Props = {
  ad: SponsoredAd;
  placement: Placement;
  onPressCta: (ad: SponsoredAd) => void | Promise<void>;
  onHide: (adId: string) => void;
  onImpression?: (campaignId: string, placement: Placement) => void | Promise<void>;
};

export function SponsoredPostCard({ ad, placement, onPressCta, onHide, onImpression }: Props) {
  const { t } = useTranslation();
  const hasImage = !!ad.image_url;

  useEffect(() => {
    onImpression?.(ad.id, placement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.id, placement]);

  const badgeLabel =
    ad.sponsor_tag === "House Sponsor"
      ? t("ads.badge_house", { defaultValue: "House Sponsor" })
      : t("ads.badge_sponsored", { defaultValue: "Sponsored" });

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 12,
        borderRadius: 18,
        backgroundColor: COLORS.sponsorBg,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="briefcase-outline" size={18} color={COLORS.text} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
              {ad.sponsor_name}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 2, fontWeight: "800" }} numberOfLines={1}>
              {ad.title}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: ad.sponsor_tag === "House Sponsor" ? COLORS.sponsorAccent : COLORS.sponsorPill,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{badgeLabel}</Text>
          </View>

          <Pressable
            onPress={() => {
              onHide(ad.id);
              Alert.alert(
                t("ads.hidden_title", { defaultValue: "Hidden" }),
                t("ads.hidden_body", { defaultValue: "You’ll see fewer posts like this." })
              );
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              {t("common.hide", { defaultValue: "Hide" })}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>{ad.body}</Text>

      {hasImage ? (
        <View
          style={{
            marginTop: 10,
            width: IMAGE_W,
            height: IMAGE_H,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#0F0F16",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Image source={{ uri: ad.image_url as string }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.08)" }} />
        </View>
      ) : null}

      <Pressable
        onPress={() => onPressCta(ad)}
        style={{
          marginTop: 12,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: COLORS.white,
          alignItems: "center",
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ color: COLORS.black, fontWeight: "900" }}>{ad.cta}</Text>
      </Pressable>
    </View>
  );
}