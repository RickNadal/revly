import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearAppLanguageOverride, setAppLanguage } from "../lib/i18n";

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

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const current = (i18n.language || "en").startsWith("nl") ? "nl" : "en";

  const pick = async (lang: "en" | "nl") => {
    await setAppLanguage(lang);
    Alert.alert(t("common.saved"), "");
  };

  const resetToDefault = async () => {
    await clearAppLanguageOverride();
    Alert.alert(t("common.saved"), "");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16 }}>
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>{t("language.title")}</Text>
        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700" }}>{t("language.note")}</Text>

        <View style={{ marginTop: 14, gap: 10 }}>
          <Pressable
            onPress={() => pick("en")}
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: current === "en" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: current === "en" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("language.english")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => pick("nl")}
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: current === "nl" ? COLORS.button : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: current === "nl" ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>
              {t("language.dutch")}
            </Text>
          </Pressable>

          <Pressable
            onPress={resetToDefault}
            style={{
              marginTop: 10,
              padding: 14,
              borderRadius: 14,
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("language.reset")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}