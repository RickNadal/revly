// app/communities/[id].tsx
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  privacy: "open" | "private" | string;
  invite_code: string | null;
  owner_id: string;
  created_at: string;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member" | string;
  status: "active" | "pending" | "rejected" | string;
};

type GroupPostMediaRow = { id: string; url: string; sort_order: number };

type GroupPostRow = {
  id: string;
  group_id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  group_post_media: GroupPostMediaRow[];
  author_name?: string;
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
  danger: "#FF5A5F",
};

const { width: SCREEN_W } = Dimensions.get("window");
const SIDE = 16;
const CARD_PAD = 12;
const CAROUSEL_W = SCREEN_W - SIDE * 2 - CARD_PAD * 2;
const CAROUSEL_H = 280;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CommunityDetailScreen() {
  const { t } = useTranslation();

  const params = useLocalSearchParams<{ id: string }>();
  const groupId = params.id;

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);

  const [inviteInput, setInviteInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const [posts, setPosts] = useState<GroupPostRow[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [carouselIndexByPost, setCarouselIndexByPost] = useState<Record<string, number>>({});

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isPrivate = group?.privacy === "private";
  const isMemberActive = membership?.status === "active";
  const isPending = membership?.status === "pending";

  const isStaff = useMemo(() => {
    const r = String(membership?.role ?? "");
    return r === "owner" || r === "moderator";
  }, [membership]);

  const openViewer = (urls: string[], index: number) => {
    if (!urls.length) return;
    router.push({
      pathname: "/viewer",
      params: {
        urls: JSON.stringify(urls),
        index: String(index),
      },
    });
  };

  const setCarouselIndex = (postId: string, idx: number) => {
    setCarouselIndexByPost((prev) => {
      if (prev[postId] === idx) return prev;
      return { ...prev, [postId]: idx };
    });
  };

  const loadCore = async () => {
    if (!groupId) return;

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;
    setMeId(uid);

    const { data: g, error: gErr } = await supabase
      .from("groups")
      .select("id, name, description, privacy, invite_code, owner_id, created_at")
      .eq("id", groupId)
      .single();

    if (gErr || !g) {
      setLoading(false);
      return Alert.alert(
        t("communities_detail.load_failed_title", { defaultValue: "Load failed" }),
        gErr?.message ?? t("communities_detail.group_not_found", { defaultValue: "Group not found" })
      );
    }

    const { data: mem, error: mErr } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, status")
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .maybeSingle();

    if (mErr) console.log("MEMBERSHIP LOAD ERROR:", mErr);

    if (mountedRef.current) {
      setGroup(g as any);
      setMembership((mem as any) ?? null);
      setLoading(false);
    }
  };

  const loadPosts = async () => {
    if (!groupId) return;
    if (!isMemberActive) return;

    setLoadingPosts(true);

    const { data, error } = await supabase
      .from("group_posts")
      .select("id, group_id, user_id, content, created_at, group_post_media(id, url, sort_order)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(100);

    setLoadingPosts(false);

    if (error) {
      console.log("GROUP POSTS LOAD ERROR:", error);
      return;
    }

    const raw = ((data ?? []) as any as GroupPostRow[]).map((p) => ({
      ...p,
      group_post_media: (p.group_post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

    const userIds = Array.from(new Set(raw.map((p) => p.user_id)));
    const nameById = new Map<string, string>();

    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (pErr) console.log("GROUP POSTS PROFILES ERROR:", pErr);
      for (const pr of (profs ?? []) as any[]) {
        nameById.set(pr.id, pr.full_name ?? t("feed.rider_fallback", { defaultValue: "Rider" }));
      }
    }

    const normalized = raw.map((p) => ({
      ...p,
      author_name: nameById.get(p.user_id) ?? t("feed.rider_fallback", { defaultValue: "Rider" }),
    }));

    setPosts(normalized);
  };

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (isMemberActive) loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMemberActive]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCore();
      await loadPosts();
    } finally {
      setRefreshing(false);
    }
  };

  const joinOpen = async () => {
    if (!groupId || !meId) return;
    setJoining(true);

    const { error } = await supabase.from("group_members").upsert({
      group_id: groupId,
      user_id: meId,
      role: "member",
      status: "active",
    } as any);

    setJoining(false);

    if (error) return Alert.alert(t("communities_detail.join_failed_title", { defaultValue: "Join failed" }), error.message);
    Alert.alert(
      t("communities_detail.joined_title", { defaultValue: "Joined" }),
      t("communities_detail.joined_body", { defaultValue: "You’re now a member." })
    );
    loadCore();
  };

  const requestAccess = async () => {
    if (!groupId || !meId) return;
    setJoining(true);

    const { error } = await supabase.from("group_members").upsert({
      group_id: groupId,
      user_id: meId,
      role: "member",
      status: "pending",
    } as any);

    setJoining(false);

    if (error) return Alert.alert(t("communities_detail.request_failed_title", { defaultValue: "Request failed" }), error.message);
    Alert.alert(
      t("communities_detail.request_sent_title", { defaultValue: "Request sent" }),
      t("communities_detail.request_sent_body", { defaultValue: "A moderator will review your request." })
    );
    loadCore();
  };

  const joinWithInvite = async () => {
    if (!group || !groupId || !meId) return;

    const code = inviteInput.trim().toUpperCase();
    if (!code) {
      return Alert.alert(
        t("communities_detail.missing_code_title", { defaultValue: "Missing code" }),
        t("communities_detail.missing_code_body", { defaultValue: "Enter an invite code." })
      );
    }

    if (!group.invite_code) {
      return Alert.alert(
        t("communities_detail.no_invite_code_title", { defaultValue: "No invite code" }),
        t("communities_detail.no_invite_code_body", { defaultValue: "This group has no invite code configured." })
      );
    }

    if (code !== String(group.invite_code).toUpperCase()) {
      return Alert.alert(
        t("communities_detail.invalid_code_title", { defaultValue: "Invalid code" }),
        t("communities_detail.invalid_code_body", { defaultValue: "That invite code is not correct." })
      );
    }

    setJoining(true);
    const { error } = await supabase.from("group_members").upsert({
      group_id: groupId,
      user_id: meId,
      role: "member",
      status: "active",
    } as any);
    setJoining(false);

    if (error) return Alert.alert(t("communities_detail.join_failed_title", { defaultValue: "Join failed" }), error.message);
    Alert.alert(
      t("communities_detail.joined_title", { defaultValue: "Joined" }),
      t("communities_detail.invite_accepted_body", { defaultValue: "Invite accepted. You’re in." })
    );
    loadCore();
  };

  const removeBadPhoto = (mediaId: string) => {
    Alert.alert(
      t("communities_detail.remove_photo_title", { defaultValue: "Remove photo?" }),
      t("communities_detail.remove_photo_body", { defaultValue: "This will remove the photo from the community post." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("communities_detail.remove", { defaultValue: "Remove" }),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("community_delete_group_post_media", { target_media_id: mediaId });
            if (error) {
              return Alert.alert(t("communities_detail.remove_failed_title", { defaultValue: "Remove failed" }), error.message);
            }
            await loadPosts();
          },
        },
      ]
    );
  };

  const PostCarousel = ({ postId, media }: { postId: string; media: GroupPostMediaRow[] }) => {
    const urls = media.map((m) => m.url).filter(Boolean);
    const currentIndex = carouselIndexByPost[postId] ?? 0;
    const safeIndex = clamp(currentIndex, 0, Math.max(0, urls.length - 1));
    const listRef = useRef<FlatList<GroupPostMediaRow>>(null);

    useEffect(() => {
      const tt = setTimeout(() => {
        if (media.length <= 1) return;
        try {
          listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
        } catch {}
      }, 0);
      return () => clearTimeout(tt);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [postId, media.length]);

    const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = clamp(Math.round(x / CAROUSEL_W), 0, urls.length - 1);
      if (idx !== safeIndex) setCarouselIndex(postId, idx);
    };

    return (
      <View style={{ marginTop: 10 }}>
        <View
          style={{
            width: CAROUSEL_W,
            height: CAROUSEL_H,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#0F0F16",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <FlatList
            ref={listRef}
            data={media}
            keyExtractor={(m) => `${postId}:${m.id}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CAROUSEL_W}
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumEnd}
            getItemLayout={(_, index) => ({ length: CAROUSEL_W, offset: CAROUSEL_W * index, index })}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => openViewer(urls, index)} style={{ width: CAROUSEL_W, height: CAROUSEL_H }}>
                <Image source={{ uri: item.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />

                {isStaff ? (
                  <Pressable
                    onPress={() => removeBadPhoto(item.id)}
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      backgroundColor: "rgba(0,0,0,0.65)",
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.15)",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>
                      {t("communities_detail.remove", { defaultValue: "Remove" })}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            )}
          />

          {urls.length > 1 ? (
            <View
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                backgroundColor: "rgba(0,0,0,0.55)",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
              pointerEvents="none"
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                {safeIndex + 1} / {urls.length}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading || !group) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: COLORS.muted }}>{t("communities_detail.loading", { defaultValue: "Loading…" })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not a member: join/request UI
  if (!isMemberActive) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ padding: 16, gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 6 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              ← {t("common.back", { defaultValue: "Back" })}
            </Text>
          </Pressable>

          <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>{group.name}</Text>
                {group.description ? (
                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>{group.description}</Text>
                ) : null}
              </View>

              <View
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: isPrivate ? "rgba(245,196,81,0.16)" : "rgba(255,255,255,0.10)",
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  alignSelf: "flex-start",
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                  {isPrivate
                    ? t("communities_detail.private", { defaultValue: "PRIVATE" })
                    : t("communities_detail.open", { defaultValue: "OPEN" })}
                </Text>
              </View>
            </View>

            {isPending ? (
              <Text style={{ color: "rgba(255,255,255,0.60)", marginTop: 10, fontWeight: "800" }}>
                {t("communities_detail.request_pending", { defaultValue: "Request pending — a moderator will review it." })}
              </Text>
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.60)", marginTop: 10, fontWeight: "800" }}>
                {t("communities_detail.not_a_member_yet", { defaultValue: "You are not a member yet." })}
              </Text>
            )}
          </View>

          {!isPrivate ? (
            <Pressable
              onPress={joinOpen}
              disabled={joining}
              style={{
                backgroundColor: joining ? "#777" : COLORS.button,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                {joining
                  ? t("communities_detail.joining", { defaultValue: "Joining…" })
                  : t("communities_detail.join_community", { defaultValue: "Join community" })}
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={requestAccess}
                disabled={joining || isPending}
                style={{
                  backgroundColor: joining || isPending ? "#777" : COLORS.button,
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                  {isPending
                    ? t("communities_detail.request_pending_button", { defaultValue: "Request pending" })
                    : joining
                    ? t("communities_detail.sending", { defaultValue: "Sending…" })
                    : t("communities_detail.request_access", { defaultValue: "Request access" })}
                </Text>
              </Pressable>

              <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14, gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {t("communities_detail.have_invite_code", { defaultValue: "Have an invite code?" })}
                </Text>

                <TextInput
                  value={inviteInput}
                  onChangeText={(txt) => setInviteInput(txt.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder={t("communities_detail.invite_code_placeholder", { defaultValue: "INVITE CODE" })}
                  placeholderTextColor={COLORS.muted}
                  autoCapitalize="characters"
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.bg,
                    color: COLORS.text,
                    borderRadius: 14,
                    padding: 12,
                    fontWeight: "900",
                    letterSpacing: 2,
                    textAlign: "center",
                  }}
                />

                <Pressable
                  onPress={joinWithInvite}
                  disabled={joining}
                  style={{
                    backgroundColor: joining ? "#777" : COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {joining
                      ? t("communities_detail.joining", { defaultValue: "Joining…" })
                      : t("communities_detail.join_with_code", { defaultValue: "Join with code" })}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Member: community feed
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 6 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            ← {t("common.back", { defaultValue: "Back" })}
          </Text>
        </Pressable>

        <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>{group.name}</Text>
              {group.description ? (
                <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>{group.description}</Text>
              ) : null}
            </View>

            <View
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: isPrivate ? "rgba(245,196,81,0.16)" : "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: COLORS.border,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                {isPrivate
                  ? t("communities_detail.private", { defaultValue: "PRIVATE" })
                  : t("communities_detail.open", { defaultValue: "OPEN" })}
              </Text>
            </View>
          </View>

          <Text style={{ color: "rgba(255,255,255,0.60)", marginTop: 10, fontWeight: "800" }}>
            {t("communities_detail.role_prefix", { defaultValue: "Role:" })} {membership?.role}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => router.push({ pathname: "/communities/[id]/members", params: { id: groupId } })}
              style={{
                flex: 1,
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("communities_detail.members", { defaultValue: "Members" })}
              </Text>
            </Pressable>

            {isStaff ? (
              <Pressable
                onPress={() => router.push({ pathname: "/communities/[id]/invite", params: { id: groupId } })}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.button,
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                  {t("communities_detail.invite_settings", { defaultValue: "Invite settings" })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push({ pathname: "/communities/[id]/new-post", params: { id: groupId } })}
            style={{
              marginTop: 10,
              backgroundColor: COLORS.button,
              borderRadius: 16,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
              {t("communities_detail.post_to_community", { defaultValue: "Post to community" })}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 18 }}>
            <Text style={{ color: COLORS.muted }}>
              {loadingPosts
                ? t("communities_detail.loading", { defaultValue: "Loading…" })
                : t("communities_detail.no_posts", { defaultValue: "No community posts yet." })}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const media = item.group_post_media ?? [];
          const urls = media.map((m) => m.url).filter(Boolean);

          return (
            <View
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 18,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                  {item.author_name ?? t("feed.rider_fallback", { defaultValue: "Rider" })}
                </Text>

                <Text style={{ color: COLORS.muted, fontWeight: "700" }}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>

              {item.content ? (
                <Text style={{ color: COLORS.text, marginTop: 8, lineHeight: 20, fontWeight: "700" }}>{item.content}</Text>
              ) : null}

              {urls.length > 0 ? <PostCarousel postId={item.id} media={media} /> : null}

              {urls.length > 0 ? (
                <Pressable
                  onPress={() => openViewer(urls, carouselIndexByPost[item.id] ?? 0)}
                  style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: COLORS.chip,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {t("common.view", { defaultValue: "View" })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}