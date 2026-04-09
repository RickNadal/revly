// app/(tabs)/search.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MentionText from "../../components/MentionText";
import { supabase } from "../../lib/supabase";

type RiderRow = { id: string; full_name: string };

type PostRow = {
  id: string;
  caption: string | null;
  created_at: string;
  user_id: string;
  author_name: string;
  tags: string[];
};

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
  const insets = useSafeAreaInsets();

  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"riders" | "posts">("riders");
  const [riderRows, setRiderRows] = useState<RiderRow[]>([]);
  const [postRows, setPostRows] = useState<PostRow[]>([]);
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
      setRiderRows([]);
      setPostRows([]);
      return;
    }

    setLoading(true);

    try {
      const normalizedTag = term.replace(/^#/, "").toLowerCase();

      const ridersPromise = supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${term}%`)
        .limit(30);

      const captionPostsPromise = supabase
        .from("posts")
        .select("id, caption, created_at, user_id")
        .eq("visibility", "public")
        .ilike("caption", `%${term}%`)
        .order("created_at", { ascending: false })
        .limit(30);

      const tagIdsPromise = supabase
        .from("post_tags")
        .select("post_id")
        .ilike("tag", `${normalizedTag}%`)
        .limit(60);

      const [ridersRes, captionRes, tagIdsRes] = await Promise.all([ridersPromise, captionPostsPromise, tagIdsPromise]);

      if (ridersRes.error) console.log("RIDER SEARCH ERROR:", ridersRes.error);
      if (captionRes.error) console.log("POST CAPTION SEARCH ERROR:", captionRes.error);
      if (tagIdsRes.error) {
        const msg = String(tagIdsRes.error.message ?? "").toLowerCase();
        if (!msg.includes("post_tags") || !msg.includes("does not exist")) {
          console.log("POST TAG SEARCH ERROR:", tagIdsRes.error);
        }
      }

      const nextRiders: RiderRow[] = ((ridersRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        full_name: p.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
      }));

      const captionPosts = (captionRes.data ?? []) as any[];
      const tagPostIds = Array.from(new Set(((tagIdsRes.data ?? []) as any[]).map((r) => String(r.post_id ?? "")).filter(Boolean)));

      let tagPosts: any[] = [];
      if (tagPostIds.length > 0) {
        const { data, error } = await supabase
          .from("posts")
          .select("id, caption, created_at, user_id")
          .eq("visibility", "public")
          .in("id", tagPostIds)
          .order("created_at", { ascending: false })
          .limit(30);
        if (error) console.log("TAG POST FETCH ERROR:", error);
        tagPosts = (data ?? []) as any[];
      }

      const mergedPostMap = new Map<string, any>();
      for (const p of captionPosts) mergedPostMap.set(String(p.id), p);
      for (const p of tagPosts) mergedPostMap.set(String(p.id), p);
      const mergedPosts = Array.from(mergedPostMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const userIds = Array.from(new Set(mergedPosts.map((p) => String(p.user_id ?? "")).filter(Boolean)));
      const profileById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        if (error) console.log("POST AUTHOR SEARCH ERROR:", error);
        for (const row of data ?? []) {
          profileById.set(String((row as any).id), String((row as any).full_name ?? "").trim() || t("feed.rider_fallback", { defaultValue: "Rider" }));
        }
      }

      const postIds = mergedPosts.map((p) => String(p.id));
      const tagsByPostId = new Map<string, string[]>();
      if (postIds.length > 0) {
        const { data, error } = await supabase.from("post_tags").select("post_id, tag").in("post_id", postIds);
        if (error) {
          const msg = String(error.message ?? "").toLowerCase();
          if (!msg.includes("post_tags") || !msg.includes("does not exist")) {
            console.log("POST TAGS FETCH ERROR:", error);
          }
        } else {
          for (const row of (data ?? []) as any[]) {
            const pid = String(row.post_id ?? "");
            const tag = String(row.tag ?? "").toLowerCase();
            if (!pid || !tag) continue;
            const existing = tagsByPostId.get(pid) ?? [];
            if (!existing.includes(tag)) existing.push(tag);
            tagsByPostId.set(pid, existing);
          }
        }
      }

      const nextPosts: PostRow[] = mergedPosts.map((p) => ({
        id: String(p.id),
        caption: (p.caption as string | null) ?? null,
        created_at: String(p.created_at),
        user_id: String(p.user_id),
        author_name: profileById.get(String(p.user_id)) ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
        tags: tagsByPostId.get(String(p.id)) ?? [],
      }));

      setRiderRows(nextRiders);
      setPostRows(nextPosts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (q.trim().length >= 2) {
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const showEmpty = q.trim().length >= 2 && !loading;
  const isRidersMode = mode === "riders";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: COLORS.text }}>
          {t("search.title", { defaultValue: "Search" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("search.subtitle", { defaultValue: "Find riders or search posts by #tags" })}
        </Text>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setMode("riders")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingVertical: 9,
              alignItems: "center",
              backgroundColor: isRidersMode ? COLORS.text : COLORS.card,
            }}
          >
            <Text style={{ color: isRidersMode ? COLORS.bg : COLORS.text, fontWeight: "900" }}>
              {t("search.mode_riders", { defaultValue: "Riders" })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("posts")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingVertical: 9,
              alignItems: "center",
              backgroundColor: !isRidersMode ? COLORS.text : COLORS.card,
            }}
          >
            <Text style={{ color: !isRidersMode ? COLORS.bg : COLORS.text, fontWeight: "900" }}>
              {t("search.mode_posts", { defaultValue: "Posts" })}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={q}
          onChangeText={runSearch}
          placeholder={
            isRidersMode
              ? t("search.placeholder", { defaultValue: "Type a name (min 2 letters)" })
              : t("search.placeholder_posts", { defaultValue: "Try #bmw, #wheelie, #nightride (min 2 chars)" })
          }
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
          data={isRidersMode ? riderRows : postRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
          renderItem={({ item }) => {
            if (isRidersMode) {
              const rider = item as RiderRow;
              return (
                <Pressable
                  onPress={() => router.push({ pathname: "/rider", params: { id: rider.id } })}
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
                  <Text style={{ fontWeight: "900", fontSize: 16, color: COLORS.text }}>{rider.full_name}</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 4 }} numberOfLines={1}>
                    {rider.id}
                  </Text>
                </Pressable>
              );
            }

            const post = item as PostRow;
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/post", params: { id: post.id } })}
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
                <Text style={{ fontWeight: "900", fontSize: 15, color: COLORS.text }}>
                  {post.author_name}
                </Text>
                <MentionText
                  text={post.caption?.trim() || t("search.post_no_caption", { defaultValue: "(No caption)" })}
                  textStyle={{ color: COLORS.text, marginTop: 4 }}
                  numberOfLines={2}
                />
                {post.tags.length > 0 ? (
                  <Text style={{ color: COLORS.muted, marginTop: 6 }} numberOfLines={2}>
                    {post.tags.map((tag) => `#${tag}`).join("  ")}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            showEmpty ? (
              <Text style={{ marginTop: 12, color: COLORS.muted }}>
                {isRidersMode
                  ? t("search.empty", { defaultValue: "No riders found." })
                  : t("search.empty_posts", { defaultValue: "No posts found for this query/tag." })}
              </Text>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}