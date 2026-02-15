// app/viewer.tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ViewerParams = {
  urls?: string; // JSON stringified string[] OR comma-separated
  url?: string; // single url fallback
  index?: string; // initial index
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ViewerScreen() {
  const params = useLocalSearchParams<ViewerParams>();
  const listRef = useRef<FlatList<string>>(null);

  // Vertical swipe-to-dismiss animation state
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

  const images = useMemo<string[]>(() => {
    const rawUrls = params.urls?.trim();
    if (rawUrls) {
      // Prefer JSON array, otherwise try comma-separated
      try {
        const parsed = JSON.parse(rawUrls);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
      return rawUrls
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (params.url?.trim()) return [params.url.trim()];
    return [];
  }, [params.urls, params.url]);

  const initialIndex = useMemo(() => {
    const n = Number(params.index ?? "0");
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, Math.max(0, images.length - 1)));
  }, [params.index, images.length]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      if (images.length > 1 && initialIndex > 0) {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [images.length, initialIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_WIDTH);
    setActiveIndex(Math.max(0, Math.min(next, images.length - 1)));
  };

  // Fastest close for modal-style routes
  const close = () => {
    // @ts-ignore
    if (typeof router.dismiss === "function") {
      // @ts-ignore
      router.dismiss();
      return;
    }
    router.back();
  };

  // PanResponder: only capture when gesture is mainly vertical (won't block horizontal swipes)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);

        if (absDx < 6 && absDy < 6) return false;

        // Claim only if mostly vertical (lets left/right paging win)
        return absDy > absDx * 1.2;
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        backdropOpacity.stopAnimation();
      },
      onPanResponderMove: (_evt, gesture) => {
        const dy = Math.max(0, gesture.dy); // only drag down
        translateY.setValue(dy);

        // fade background as you drag
        const fade = 1 - Math.min(dy / 320, 0.7);
        backdropOpacity.setValue(fade);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const dy = Math.max(0, gesture.dy);
        const vy = gesture.vy;

        // Easier + snappier dismiss
        const shouldDismiss = dy > 95 || vy > 0.9;

        if (shouldDismiss) {
          // Close immediately (layout has animation: "none")
          close();
          return;
        }

        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 260,
            mass: 0.9,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  const renderItem = ({ item }: { item: string }) => (
    <View style={[styles.page, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}>
      <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
    </View>
  );

  if (!images.length) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topBar}>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No images to display.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Backdrop fade */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: backdropOpacity, backgroundColor: "#000" },
        ]}
      />

      {/* Swipe-down-to-dismiss wrapper */}
      <Animated.View
        style={{ flex: 1, transform: [{ translateY }] }}
        {...panResponder.panHandlers}
      >
        <View style={styles.topBar}>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>

          <View style={{ width: 44 }} />
        </View>

        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(u, i) => `${i}:${u}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onScrollToIndexFailed={() => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: initialIndex,
                animated: false,
              });
            }, 30);
          }}
        />

        {images.length > 1 && (
          <View style={styles.dotsWrap} pointerEvents="none">
            {images.map((_, i) => (
              <View
                key={`dot-${i}`}
                style={[
                  styles.dot,
                  i === activeIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: Platform.OS === "android" ? 10 : 18,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 18,
  },
  counterText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
  page: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  dotsWrap: {
    position: "absolute",
    bottom: 34,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dotActive: {
    backgroundColor: "rgba(255,255,255,0.95)",
    transform: [{ scale: 1.15 }],
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    textAlign: "center",
  },
});
