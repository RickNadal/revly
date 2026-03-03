import type { Ad } from "@/lib/ads/types";
import React from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  ad: Ad;
  onPressCta?: () => void;
  onHide?: () => void;
};

export function AdCard({ ad, onPressCta, onHide }: Props) {
  const { t } = useTranslation();
  const sponsoredLabel = t("ads.sponsored", { defaultValue: "Sponsored" });
  const hideLabel = t("ads.hide", { defaultValue: "Hide" });
  const learnMoreFallback = t("ads.learn_more", { defaultValue: "Learn more" });

  const ctaText = ad.creative.cta?.label || learnMoreFallback;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sponsored}>{sponsoredLabel}</Text>

        {!!onHide && (
          <Pressable onPress={onHide} hitSlop={10}>
            <Text style={styles.hide}>{hideLabel}</Text>
          </Pressable>
        )}
      </View>

      {!!ad.creative.imageUrl && (
        <Image source={{ uri: ad.creative.imageUrl }} style={styles.image} />
      )}

      <Text style={styles.headline}>{ad.creative.headline}</Text>
      {!!ad.creative.body && <Text style={styles.body}>{ad.creative.body}</Text>}

      {!!ad.creative.cta?.url && (
        <Pressable onPress={onPressCta} style={styles.cta}>
          <Text style={styles.ctaText}>{ctaText}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "white",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sponsored: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: "600",
  },
  hide: {
    fontSize: 12,
    opacity: 0.8,
    fontWeight: "600",
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 10,
  },
  headline: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 10,
  },
  cta: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "700",
  },
});