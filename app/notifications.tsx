import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type NotificationBase = {
  id: string;
  created_at: string;
  user_id: string;
  actor_id: string;
  type: "follow" | "like" | "comment";
  post_id: string | null;
  comment_id: string | null;
  read_at: string | null;
};

type NotificationItem = NotificationBase & {
  actor_name: string;
  post_caption: string | null;
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
  danger: "#FF4D4D",
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;

  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoMarked, setAutoMarked] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    setAutoMarked(false);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    const me = session.user.id;

    const { data: notifs, error: nErr } = await supabase
      .from("notifications")
      .select("id, created_at, user_id, actor_id, type, post_id, comment_id, read_at")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(100);

    if (nErr) {
      console.log("NOTIFICATIONS ERROR:", nErr);
      Alert.alert("Failed to load notifications", nErr.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const base: NotificationBase[] = (notifs as any) ?? [];

    const actorIds = Array.from(new Set(base.map((n) => n.actor_id)));
    const actorNameById = new Map<string, string>();

    if (actorIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);

      if (pErr) console.log("PROFILES ERROR:", pErr);

      for (const pr of profs ?? []) {
        actorNameById.set(pr.id, pr.full_name ?? "Rider");
      }
    }

    const postIds = Array.from(new Set(base.map((n) => n.post_id).filter(Boolean))) as string[];
    const captionByPostId = new Map<string, string | null>();

    if (postIds.length > 0) {
      const { data: posts, error: postErr } = await supabase.from("posts").select("id, caption").in("id", postIds);
      if (postErr) console.log("POSTS ERROR:", postErr);
      for (const p of posts ?? []) captionByPostId.set(p.id, p.caption ?? null);
    }

    const merged: NotificationItem[] = base.map((n) => ({
      ...n,
      actor_name: actorNameById.get(n.actor_id) ?? "Rider",
      post_caption: n.post_id ? captionByPostId.get(n.post_id) ?? null : null,
    }));

    setItems(merged);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const markManyAsRead = async (ids: string[]) => {
    if (ids.length === 0) return;

    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).in("id", ids);

    if (error) {
      console.log("MARK READ ERROR:", error);
      return;
    }

    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
  };

  const markAllAsRead = async () => {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await markManyAsRead(unreadIds);
  };

  const markOneAsRead = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.read_at) return;

    await markManyAsRead([id]);
  };

  // ✅ Auto mark all currently loaded notifications as read (once per screen open)
  const autoMarkLoadedAsRead = async () => {
    if (autoMarked) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) {
      setAutoMarked(true);
      return;
    }
    setAutoMarked(true);
    await markManyAsRead(unreadIds);
  };

  const clearAll = async () => {
    Alert.alert("Clear notifications?", "This will delete all notifications for your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          const session = sessionData.session;
          if (!session) return router.replace("/sign-in");

          const me = session.user.id;

          const { error } = await supabase.from("notifications").delete().eq("user_id", me);
          if (error) return Alert.alert("Clear failed", error.message);

          setItems([]);
        },
      },
    ]);
  };

  const renderText = (n: NotificationItem) => {
    if (n.type === "follow") return `${n.actor_name} started following you`;
    if (n.type === "like") return `${n.actor_name} liked your post`;
    return `${n.actor_name} commented on your post`;
  };

  const openNotification = async (n: NotificationItem) => {
    await markOneAsRead(n.id);

    if (n.type === "follow") {
      router.push({ pathname: "/rider", params: { id: n.actor_id } });
      return;
    }

    if (n.post_id) {
      router.push({ pathname: "/post", params: { id: n.post_id } });
      return;
    }
  };

  const TopButton = ({
    label,
    onPress,
    disabled,
    danger,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: danger ? COLORS.danger : disabled ? "#777" : COLORS.button,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: "center",
        flex: 1,
        opacity: disabled ? 0.75 : 1,
      }}
    >
      <Text style={{ color: danger ? "#0B0B0F" : COLORS.buttonText, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>Notifications</Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>Unread: {unreadCount}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <TopButton label="Back" onPress={() => router.back()} />
          <TopButton label="Mark all read" onPress={markAllAsRead} disabled={unreadCount === 0} />
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <TopButton
            label="Auto-mark shown"
            onPress={autoMarkLoadedAsRead}
            disabled={items.length === 0 || unreadCount === 0}
          />
          <TopButton label="Clear all" onPress={clearAll} disabled={items.length === 0} danger />
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: COLORS.muted }}>Loading notifications...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: COLORS.muted }}>No notifications yet.</Text>
          <Text style={{ marginTop: 8, color: COLORS.muted }}>
            You’ll get notifications when someone follows you, likes your post, or comments.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          onRefresh={loadNotifications}
          refreshing={loading}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const unread = !item.read_at;

            return (
              <Pressable
                onPress={() => openNotification(item)}
                style={{
                  marginHorizontal: 16,
                  marginBottom: 10,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: unread ? "#FFFFFF" : COLORS.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {unread ? (
                    <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#FFFFFF" }} />
                  ) : (
                    <View style={{ width: 10, height: 10 }} />
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "900", color: COLORS.text }}>{renderText(item)}</Text>

                    {item.post_caption ? (
                      <Text style={{ marginTop: 2, color: COLORS.muted }} numberOfLines={1}>
                        “{item.post_caption}”
                      </Text>
                    ) : null}

                    <Text style={{ marginTop: 6, color: COLORS.muted, fontWeight: "800" }}>
                      {timeAgo(item.created_at)}
                    </Text>
                  </View>

                  <Text style={{ fontWeight: "900", color: COLORS.text }}>›</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
