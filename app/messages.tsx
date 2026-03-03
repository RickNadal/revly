// app/messages.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type ThreadSummaryRow = {
  thread_id: string;
  created_at: string;
  last_message_at: string | null;
  other_user_id: string;
  other_user_name: string;
  last_message_body: string | null;
  last_message_created_at: string | null;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  chip: "#1D1D2A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  danger: "#FF5A5F",
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function MessagesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<ThreadSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New message modal
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Search state
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText, 250);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<ProfileMini[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/sign-in");
      return false;
    }
    return true;
  };

  const loadThreads = useCallback(async () => {
    const ok = await ensureAuth();
    if (!ok) return;

    if (mountedRef.current) setLoading(true);

    const { data, error } = await supabase
      .from("dm_thread_summaries")
      .select("thread_id, created_at, last_message_at, other_user_id, other_user_name, last_message_body, last_message_created_at")
      .limit(200);

    if (error) {
      console.log("DM THREAD SUMMARIES ERROR:", error);
      if (mountedRef.current) {
        setRows([]);
        setLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setRows((data ?? []) as any);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [loadThreads])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadThreads();
    } finally {
      setRefreshing(false);
    }
  };

  const openThread = (threadId: string) => {
    router.push({ pathname: "/messages/[id]", params: { id: threadId } });
  };

  const startThreadWith = async (otherUserId: string) => {
    setCreating(true);
    try {
      const ok = await ensureAuth();
      if (!ok) return;

      const { data, error } = await supabase.rpc("dm_get_or_create_thread", { other_user: otherUserId });
      if (error) {
        return Alert.alert(t("messages.create_failed_title", { defaultValue: "Create failed" }), error.message);
      }

      setNewOpen(false);
      setSearchText("");
      setResults([]);
      setSearchErr(null);

      openThread(String(data));
    } finally {
      setCreating(false);
    }
  };

  const searchUsers = useCallback(async (q: string) => {
    const ok = await ensureAuth();
    if (!ok) return;

    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearchErr(null);
      return;
    }

    setSearchLoading(true);
    setSearchErr(null);

    const { data, error } = await supabase.from("profiles").select("id, full_name").ilike("full_name", `%${query}%`).limit(20);

    setSearchLoading(false);

    if (error) {
      console.log("PROFILE SEARCH ERROR:", error);
      setResults([]);
      setSearchErr(error.message);
      return;
    }

    const list = (data ?? []) as any as ProfileMini[];
    setResults(list);
  }, []);

  useEffect(() => {
    if (!newOpen) return;
    searchUsers(debouncedSearch);
  }, [debouncedSearch, newOpen, searchUsers]);

  const emptyText = useMemo(() => {
    if (loading) return t("messages.loading", { defaultValue: "Loading…" });
    return t("messages.empty", { defaultValue: "No messages yet. Tap New to start a conversation." });
  }, [loading, t]);

  const modalEmptyText = useMemo(() => {
    if (searchLoading) return t("messages.searching", { defaultValue: "Searching…" });

    const q = searchText.trim();
    if (q.length < 2) return t("messages.type_min_chars", { defaultValue: "Type at least 2 characters." });

    return t("messages.no_results", { defaultValue: "No results." });
  }, [searchLoading, searchText, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </Pressable>

          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>
            {t("messages.title", { defaultValue: "Messages" })}
          </Text>

          <Pressable
            onPress={() => setNewOpen(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="create-outline" size={20} color={COLORS.text} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.thread_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ paddingTop: 14 }}>
            <Text style={{ color: COLORS.muted }}>{emptyText}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const preview =
            item.last_message_body?.trim() || t("messages.no_messages_yet", { defaultValue: "No messages yet" });
          const time = item.last_message_created_at || item.created_at;

          return (
            <Pressable
              onPress={() => openThread(item.thread_id)}
              style={({ pressed }) => ({
                marginBottom: 12,
                padding: 12,
                borderRadius: 16,
                backgroundColor: pressed ? "rgba(255,255,255,0.04)" : COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                  {item.other_user_name}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 12 }}>
                  {new Date(time).toLocaleString()}
                </Text>
              </View>

              <Text style={{ color: COLORS.muted, marginTop: 6 }} numberOfLines={2}>
                {preview}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* New message modal: USER SEARCH */}
      <Modal transparent visible={newOpen} animationType="fade" onRequestClose={() => setNewOpen(false)}>
        <Pressable
          onPress={() => setNewOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              padding: 14,
              paddingBottom: insets.bottom + 14,
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTopWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {t("messages.new_message_title", { defaultValue: "New message" })}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700", lineHeight: 20 }}>
              {t("messages.new_message_subtitle", { defaultValue: "Search riders by name and start a conversation." })}
            </Text>

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t("messages.search_placeholder", { defaultValue: "Search name…" })}
              placeholderTextColor={COLORS.muted}
              autoCapitalize="words"
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                color: COLORS.text,
                borderRadius: 14,
                padding: 12,
                fontWeight: "800",
              }}
            />

            {searchErr ? (
              <Text style={{ marginTop: 10, color: COLORS.danger, fontWeight: "800" }}>{searchErr}</Text>
            ) : null}

            <View style={{ marginTop: 12, maxHeight: 260 }}>
              {results.length === 0 ? (
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>{modalEmptyText}</Text>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(x) => x.id}
                  renderItem={({ item }) => (
                    <Pressable
                      disabled={creating}
                      onPress={() => startThreadWith(item.id)}
                      style={({ pressed }) => ({
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: pressed ? "rgba(255,255,255,0.06)" : COLORS.bg,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        marginBottom: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", flex: 1 }} numberOfLines={1}>
                        {item.full_name?.trim() || t("feed.rider_fallback", { defaultValue: "Rider" })}
                      </Text>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.text} />
                    </Pressable>
                  )}
                />
              )}
            </View>

            <Pressable
              onPress={() => setNewOpen(false)}
              disabled={creating}
              style={{
                marginTop: 4,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {creating ? t("messages.working", { defaultValue: "Working…" }) : t("messages.close", { defaultValue: "Close" })}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}