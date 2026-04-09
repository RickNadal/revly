import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";

type Props = {
  label?: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  pressableStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  borderRadius?: number;
  hitSlop?: number;
  children?: React.ReactNode;
};

const ACTIVE_BORDER = "#7CFFB2";
const IDLE_BORDER = "#232334";
const ACTIVE_BG = "#1D1D2A";
const IDLE_BG = "#12121A";

export default function AnimatedSelectableButton({
  label,
  active,
  onPress,
  disabled,
  containerStyle,
  pressableStyle,
  textStyle,
  borderRadius = 14,
  hitSlop,
  children,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 6500,
        useNativeDriver: true,
      })
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [active, spin]);

  const rotate = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    [spin]
  );

  return (
    <View
      style={[
        {
          borderRadius,
          overflow: "hidden",
          borderWidth: active ? 0 : 1,
          borderColor: active ? "transparent" : IDLE_BORDER,
          backgroundColor: "transparent",
        },
        containerStyle,
      ]}
    >
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -18,
            bottom: -18,
            left: -18,
            right: -18,
            transform: [{ rotate }],
          }}
        >
          <LinearGradient
            colors={["rgba(124,255,178,0.12)", ACTIVE_BORDER, "rgba(124,255,178,0.12)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}

      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={hitSlop}
        style={[
          {
            borderRadius,
            paddingVertical: 10,
            paddingHorizontal: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? ACTIVE_BG : IDLE_BG,
          },
          pressableStyle,
        ]}
      >
        {children ? <>{children}</> : <Text style={[{ color: "#FFFFFF", fontWeight: "900" }, textStyle]}>{label ?? ""}</Text>}
      </Pressable>
    </View>
  );
}
