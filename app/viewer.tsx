// app/viewer.tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

type ViewerParams = {
  // Existing:
  urls?: string; // JSON stringified string[] OR comma-separated
  url?: string; // single url fallback
  index?: string; // initial index

  // New (passed from post.tsx):
  postId?: string;
  ownerId?: string;

  // JSON stringified: { url: string; sort_order?: number }[]
  media?: string;

  // "1" or "0" - viewer can show delete only if this is "1"
  canDelete?: string;
};

type MediaRow = {
  url: string;
  sort_order?: number;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const COLORS = {
  text: "#fff",
  muted: "rgba(255,255,255,0.75)",
  card: "rgba(20,20,28,0.98)",
  border: "rgba(255,255,255,0.14)",
  chip: "rgba(255,255,255,0.10)",
  dangerBg: "rgba(255,60,60,0.18)",
  dangerBorder: "rgba(255,60,60,0.28)",
  btnBg: "rgba(255,255,255,0.12)",
  btnBorder: "rgba(255,255,255,0.18)",
};

function parseUrls(raw?: string | null): string[] {
  const v = raw?.trim();
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// IMPORTANT: Do NOT use new URL() here (can crash in RN if polyfill not ready)
function guessStoragePathFromPublicUrl(_publicUrl: string): string | null {
  return null;
}

function looksLikeHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function isDuplicateKeyError(err: any) {
  const code = err?.code ?? err?.error_code ?? err?.statusCode ?? err?.status_code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (String(code) === "23505") return true;
  if (msg.includes("duplicate key") || msg.includes("unique") || msg.includes("already exists")) return true;
  return false;
}

export default function ViewerScreen() {
  const params = useLocalSearchParams<ViewerParams>();
  const listRef = useRef<FlatList<string>>(null);

  // Vertical swipe-to-dismiss animation state
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

  const postId = (params.postId ?? "").trim();
  const ownerId = (params.ownerId ?? "").trim();

  const canDelete = useMemo(() => {
    const raw = (params.canDelete ?? "").trim();
    return raw === "1" || raw.toLowerCase() === "true";
  }, [params.canDelete]);

  const media = useMemo<MediaRow[]>(() => {
    const raw = params.media?.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x: any) => ({
            url: String(x?.url ?? ""),
            sort_order: typeof x?.sort_order === "number" ? x.sort_order : undefined,
          }))
          .filter((x) => !!x.url);
      }
    } catch {}
    return [];
  }, [params.media]);

  const images = useMemo<string[]>(() => {
    // Prefer media urls if provided (so index always matches DB order)
    if (media.length) return media.map((m) => m.url).filter(Boolean);

    const rawUrls = params.urls?.trim();
    if (rawUrls) return parseUrls(rawUrls);

    if (params.url?.trim()) return [params.url.trim()];
    return [];
  }, [media, params.urls, params.url]);

  const initialIndex = useMemo(() => {
    const n = Number(params.index ?? "0");
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, Math.max(0, images.length - 1)));
  }, [params.index, images.length]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);

  // --- Report UI state ---
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other"
  >("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  const canReport = !!postId; // must have a postId to report

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

  async function deleteFromDbOnly(urlToDelete: string) {
    if (!postId) throw new Error("Missing postId for delete.");

    const { error } = await supabase
      .from("post_media")
      .delete()
      .eq("post_id", postId)
      .eq("url", urlToDelete);

    if (error) throw new Error(error.message);
  }

  async function deleteAllFromDbOnly() {
    if (!postId) throw new Error("Missing postId for delete.");
    const { error } = await supabase.from("post_media").delete().eq("post_id", postId);
    if (error) throw new Error(error.message);
  }

  async function tryDeleteFromStorage(maybePathOrUrl: string) {
    if (looksLikeHttpUrl(maybePathOrUrl)) return;

    const path = maybePathOrUrl.trim();
    if (!path) return;

    const BUCKET = "post-media";

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.log("STORAGE DELETE FAILED:", error.message);
    }
  }

  const handleDeleteCurrent = () => {
    if (!canDelete || busy) return;

    const urlToDelete = images[activeIndex];
    if (!urlToDelete) return;

    Alert.alert(
      "Delete photo?",
      "This will remove this photo from the post.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);

              await deleteFromDbOnly(urlToDelete);
              await tryDeleteFromStorage(urlToDelete);

              close();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Unknown error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleDeleteAll = () => {
    if (!canDelete || busy) return;

    Alert.alert(
      "Delete all photos?",
      "This will remove ALL photos from this post. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);

              await deleteAllFromDbOnly();

              for (const u of images) {
                await tryDeleteFromStorage(u);
              }

              close();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Unknown error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openReport = () => {
    if (!canReport) {
      Alert.alert("Report unavailable", "This item can’t be reported from here.");
      return;
    }
    setReportReason("spam");
    setReportDetails("");
    setReportOpen(true);
  };

  const closeReport = () => setReportOpen(false);

  const submitReport = async () => {
    if (!postId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      closeReport();
      router.replace("/sign-in");
      return;
    }

    setReporting(true);
    try {
      const payload = {
        post_id: postId,
        reporter_id: session.user.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
        status: "open",
      };

      const { error } = await supabase.from("post_reports").insert(payload);

      if (error) {
        if (isDuplicateKeyError(error)) {
          closeReport();
          Alert.alert("Already reported", "You’ve already reported this post. Thanks — our team will review it.");
          return;
        }

        Alert.alert("Report failed", error.message);
        return;
      }

      closeReport();
      Alert.alert("Reported", "Thanks — we’ll review this post.");
    } finally {
      setReporting(false);
    }
  };

  const ReasonChip = ({
    label,
    value,
  }: {
    label: string;
    value: "spam" | "harassment" | "nudity" | "violence" | "hate" | "scam" | "other";
  }) => {
    const active = reportReason === value;
    return (
      <Pressable
        onPress={() => setReportReason(value)}
        style={[
          styles.reasonChip,
          active ? { backgroundColor: "rgba(255,255,255,0.92)" } : { backgroundColor: COLORS.chip },
        ]}
      >
        <Text style={{ color: active ? "#000" : COLORS.text, fontWeight: "900", fontSize: 12 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

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
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: "#000" }]} />

      {/* Swipe-down-to-dismiss wrapper */}
      <Animated.View style={{ flex: 1, transform: [{ translateY }] }} {...panResponder.panHandlers}>
        <View style={styles.topBar}>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>

          {/* Right side actions */}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {canReport ? (
              <Pressable onPress={openReport} style={styles.actionBtn} disabled={reporting || busy}>
                <Text style={styles.actionText}>Report</Text>
              </Pressable>
            ) : null}

            {canDelete ? (
              <>
                <Pressable
                  onPress={handleDeleteCurrent}
                  disabled={busy}
                  style={[styles.actionBtn, busy ? { opacity: 0.55 } : null]}
                >
                  <Text style={styles.actionText}>{busy ? "..." : "Delete"}</Text>
                </Pressable>

                {images.length > 1 ? (
                  <Pressable
                    onPress={handleDeleteAll}
                    disabled={busy}
                    style={[styles.actionBtnDanger, busy ? { opacity: 0.55 } : null]}
                  >
                    <Text style={styles.actionText}>All</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {!canDelete && !canReport ? <View style={{ width: 44 }} /> : null}
          </View>
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
              <View key={`dot-${i}`} style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
        )}
      </Animated.View>

      {/* Report modal */}
      <Modal transparent visible={reportOpen} animationType="fade" onRequestClose={closeReport}>
        <Pressable onPress={closeReport} style={styles.modalBackdrop}>
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <View style={{ alignItems: "center", paddingVertical: 6 }}>
              <View style={styles.grabber} />
            </View>

            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Report post</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }} numberOfLines={1}>
              Post: {postId ? postId : "(unknown)"}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>Reason</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <ReasonChip label="Spam" value="spam" />
              <ReasonChip label="Harassment" value="harassment" />
              <ReasonChip label="Nudity" value="nudity" />
              <ReasonChip label="Violence" value="violence" />
              <ReasonChip label="Hate" value="hate" />
              <ReasonChip label="Scam" value="scam" />
              <ReasonChip label="Other" value="other" />
            </View>

            <Text style={{ color: COLORS.muted, marginTop: 12, fontWeight: "900" }}>Details (optional)</Text>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Tell us what happened…"
              placeholderTextColor={COLORS.muted}
              multiline
              style={styles.reportInput}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={closeReport} style={[styles.modalBtn, { backgroundColor: COLORS.chip }]}>
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={reporting}
                onPress={submitReport}
                style={[
                  styles.modalBtn,
                  { backgroundColor: "rgba(255,255,255,0.92)" },
                  reporting ? { opacity: 0.6 } : null,
                ]}
              >
                <Text style={{ color: "#000", fontWeight: "900" }}>{reporting ? "Sending…" : "Submit"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: 10,
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
  actionBtn: {
    height: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.btnBg,
    borderWidth: 1,
    borderColor: COLORS.btnBorder,
  },
  actionBtnDanger: {
    height: 44,
    minWidth: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
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

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  modalCard: {
    padding: 14,
    paddingBottom: 18,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  reportInput: {
    marginTop: 10,
    minHeight: 84,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(0,0,0,0.35)",
    color: COLORS.text,
    borderRadius: 14,
    padding: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  reasonChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});