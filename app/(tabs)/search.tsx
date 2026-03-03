// app/(tabs)/search.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Row = { id: string; full_name: string };

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
};

export default function SearchScreen() {
  const { t } = useTranslation();

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) router.replace("/sign-in");
  };

  useFocusEffect(
    useCallback(() => {
      ensureAuth();
    }, [])
  );

  const runSearch = async (text: string) => {
    setQ(text);

    const term = text.trim();
    if (term.length < 2) {
      setRows([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${term}%`)
      .limit(30);

    const list: Row[] = (data ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
    }));

    setRows(list);
    setLoading(false);

    // Keep console logs for dev only; no UI debug text.
    if (error) console.log("SEARCH ERROR:", error);
  };

  const showEmpty = q.trim().length >= 2 && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: COLORS.text }}>
          {t("search.title", { defaultValue: "Search Riders" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("search.subtitle", { defaultValue: "Find bikers and open their profile" })}
        </Text>

        <TextInput
          value={q}
          onChangeText={runSearch}
          placeholder={t("search.placeholder", { defaultValue: "Type a name (min 2 letters)" })}
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            padding: 12,
            borderRadius: 12,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
          }}
        />

        {loading ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>
            {t("search.searching", { defaultValue: "Searching…" })}
          </Text>
        ) : null}

        <FlatList
          style={{ marginTop: 12 }}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/rider", params: { id: item.id } })}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 14,
                marginBottom: 10,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontWeight: "900", fontSize: 16, color: COLORS.text }}>{item.full_name}</Text>
              <Text style={{ color: COLORS.muted, marginTop: 4 }} numberOfLines={1}>
                {item.id}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            showEmpty ? (
              <Text style={{ marginTop: 12, color: COLORS.muted }}>
                {t("search.empty", { defaultValue: "No riders found." })}
              </Text>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}