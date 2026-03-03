// app/rent.tsx
import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
};

export default function RentScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16 }}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>Rent bikes</Text>
        <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700", lineHeight: 20 }}>
          List rentals (bikes or gear). Next we can add availability + request-to-book.
        </Text>

        <View
          style={{
            marginTop: 14,
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Monetization</Text>
          <Text style={{ color: COLORS.muted, marginTop: 8, lineHeight: 20 }}>
            • Booking fee / lead fee{"\n"}
            • Rental business subscription{"\n"}
            • Featured rentals
          </Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 16,
            backgroundColor: COLORS.button,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}