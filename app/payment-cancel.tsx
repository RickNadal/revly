import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#0B0B0F",
  muted: "#A7A7B5",
  text: "#FFFFFF",
  redBg: "rgba(248,113,113,0.12)",
  border: "#232334",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

export default function PaymentCancelScreen() {
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
            backgroundColor: COLORS.redBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 44 }}>✕</Text>
        </View>

        <Text
          style={{
            color: COLORS.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Payment cancelled
        </Text>

        <Text
          style={{
            color: COLORS.muted,
            fontSize: 15,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          No charge was made. You can try again whenever you&apos;re ready.
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 12,
            backgroundColor: COLORS.button,
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 40,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "700", fontSize: 16 }}>
            Go back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
