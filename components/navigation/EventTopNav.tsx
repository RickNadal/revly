import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

type EventTopNavProps = {
  onBack: () => void;
  onHome: () => void;
  title?: string;
};

export default function EventTopNav({ onBack, onHome, title }: EventTopNavProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [glowAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const glowScaleX = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.3)",
            backgroundColor: "#FFFFFF",
            paddingVertical: 8,
            paddingHorizontal: 12,
            shadowColor: "#000000",
            shadowOpacity: 0.16,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          <Ionicons name="chevron-back" size={16} color="#0B0B0F" />
          <Text style={{ color: "#0B0B0F", fontWeight: "900", fontSize: 12 }}>Back</Text>
        </Pressable>

        <Pressable
          onPress={onHome}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.3)",
            backgroundColor: "#FFFFFF",
            paddingVertical: 8,
            paddingHorizontal: 12,
            shadowColor: "#000000",
            shadowOpacity: 0.16,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          <Ionicons name="home" size={15} color="#0B0B0F" />
          <Text style={{ color: "#0B0B0F", fontWeight: "900", fontSize: 12 }}>Home</Text>
        </Pressable>

        {title ? (
          <Text style={{ color: "#D8FFE8", fontWeight: "900", fontSize: 13, marginLeft: 4 }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>

      <Animated.View
        style={{
          marginTop: 8,
          height: 2,
          borderRadius: 999,
          backgroundColor: "rgba(124,255,178,0.95)",
          shadowColor: "#7CFFB2",
          shadowOpacity: 0.95,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 5,
          opacity: glowOpacity,
          transform: [{ scaleX: glowScaleX }],
        }}
      />
    </View>
  );
}
