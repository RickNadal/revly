import type { Ad } from "@/lib/ads/types";
import React from "react";
import { useTranslation } from "react-i18next";
import { AdCard } from "./AdCard";

type Props = {
  ad: Ad;
  onPressCta?: () => void;
  onHide?: () => void;
};

export function HouseAdCard({ ad, onPressCta, onHide }: Props) {
  const { t } = useTranslation();
  // If you want a distinct label later, keep this separate:
  // const label = t("ads.house_sponsor", { defaultValue: "House sponsor" });
  return <AdCard ad={ad} onPressCta={onPressCta} onHide={onHide} />;
}