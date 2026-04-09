/**
 * StoryRing Component
 * Displays a glowing ring around profile pictures when user has active stories
 */
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

interface StoryRingProps {
  hasStories: boolean;
  avatarUrl?: string;
  size?: number;
  borderWidth?: number;
}

export const StoryRing: React.FC<StoryRingProps> = ({
  hasStories,
  avatarUrl,
  size = 80,
  borderWidth = 3,
}) => {
  const [pulseAnim] = useState(new Animated.Value(1));

  // Pulsing animation for glow effect
  useEffect(() => {
    if (!hasStories) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [hasStories, pulseAnim]);

  const styles = StyleSheet.create({
    container: {
      width: size,
      height: size,
      borderRadius: size / 2,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    gradientBorder: {
      width: size,
      height: size,
      borderRadius: size / 2,
      justifyContent: "center",
      alignItems: "center",
      padding: borderWidth,
    },
    imageContainer: {
      width: size - borderWidth * 2,
      height: size - borderWidth * 2,
      borderRadius: (size - borderWidth * 2) / 2,
      overflow: "hidden",
      backgroundColor: "#1a1a1a",
      justifyContent: "center",
      alignItems: "center",
    },
    avatar: {
      width: "100%",
      height: "100%",
    },
    innerRing: {
      width: size - borderWidth * 2,
      height: size - borderWidth * 2,
      borderRadius: (size - borderWidth * 2) / 2,
      backgroundColor: "#111",
    },
    noStoriesContainer: {
      width: size,
      height: size,
      borderRadius: size / 2,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#1a1a1a",
      borderWidth: 1,
      borderColor: "#333",
      overflow: "hidden",
    },
  });

  if (!hasStories) {
    return (
      <View style={styles.noStoriesContainer}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={{ width: "100%", height: "100%", backgroundColor: "#222" }} />
        )}
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      <LinearGradient
        colors={["#FF6B6B", "#FF9E64", "#FFD93D", "#6BCB77", "#4D96FF", "#BB6BD9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}
      >
        <View style={styles.imageContainer}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={{ width: "100%", height: "100%", backgroundColor: "#222" }} />
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
};
