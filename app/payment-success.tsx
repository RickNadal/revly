import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  green: "#4ADE80",
  greenBg: "rgba(74,222,128,0.12)",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

export default function PaymentSuccessScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type = params.type ?? "payment";

  const label =
    type === "premium"
      ? "Premium"
      : type === "store"
      ? "Store subscription"
      : type === "donation"
      ? "Donation"
      : type === "gift"
      ? "Gift"
      : "Payment";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
          gap: 20,
        }}
      >
        {/* Icon circle */}
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: COLORS.greenBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 44 }}>✓</Text>
        </View>

        <Text
          style={{
            color: COLORS.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {label} confirmed
        </Text>

        <Text
          style={{
            color: COLORS.muted,
            fontSize: 15,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          Your {label.toLowerCase()} was successful. It may take a few seconds for your account to update.
        </Text>

        <Pressable
          onPress={() => router.replace("/(tabs)/")}
          style={{
            marginTop: 12,
            backgroundColor: COLORS.button,
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 40,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "700", fontSize: 16 }}>
            Back to home
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
