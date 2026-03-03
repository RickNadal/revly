// app/(tabs)/profile.tsx
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type ProfileRole = "user" | "moderator" | "admin";

type Post = {
  id: string;
  caption: string | null;
  created_at: string;
  post_media: { url: string; sort_order: number }[];
};

const COLORS = {
  bg: "#0B0B0F",
  card: "#12121A",
  border: "#232334",
  text: "#FFFFFF",
  muted: "#A7A7B5",
  inputBg: "#12121A",
  inputBorder: "#2A2A3A",
  button: "#FFFFFF",
  buttonText: "#0B0B0F",
  chip: "#1D1D2A",
  danger: "#FF5A5F",
  badgeBg: "rgba(255,255,255,0.10)",
  badgeBorder: "#232334",
  badgeGold: "#F5C451",
  badgeGreen: "#7CFFB2",
};

// Keep your old "admin uid" debug check
const ADMIN_USER_ID = "165b27e6-a9df-4cc2-a529-9c667cb5f018";

function Badge({ label, tone }: { label: string; tone?: "default" | "gold" | "green" }) {
  const color = tone === "gold" ? COLORS.badgeGold : tone === "green" ? COLORS.badgeGreen : COLORS.text;

  return (
    <View
      style={{
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: COLORS.badgeBg,
        borderWidth: 1,
        borderColor: COLORS.badgeBorder,
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function openViewer(urls: string[], index: number) {
  if (!urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      urls: JSON.stringify(urls),
      index: String(index),
    },
  });
}

export default function Profile() {
  const { t } = useTranslation();

  const [fullName, setFullName] = useState("");
  const [editing, setEditing] = useState(false);

  const [role, setRole] = useState<ProfileRole>("user");
  const [isPremium, setIsPremium] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const isAdminByRole = role === "admin";
  const isAdminByUid = !!myUserId && myUserId === ADMIN_USER_ID;
  const isAdmin = useMemo(() => isAdminByRole || isAdminByUid, [isAdminByRole, isAdminByUid]);

  const load = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return;
    }

    const uid = sessionData.session.user.id;
    setMyUserId(uid);

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("full_name, role, is_premium, is_legacy")
      .eq("id", uid)
      .single();

    if (profErr) {
      console.log("PROFILE LOAD ERROR:", profErr);
    } else {
      if (profile?.full_name) setFullName(profile.full_name);

      const r = ((profile as any)?.role ?? "user") as ProfileRole;
      setRole(r);

      setIsPremium(!!(profile as any)?.is_premium);
      setIsLegacy(!!(profile as any)?.is_legacy);
    }

    const { count: followers } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", uid);

    const { count: following } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", uid);

    setFollowersCount(followers ?? 0);
    setFollowingCount(following ?? 0);

    const { data: userPosts } = await supabase
      .from("posts")
      .select("id, caption, created_at, post_media(url, sort_order)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    const normalized: Post[] = (userPosts ?? []).map((p: any) => ({
      ...p,
      post_media: (p.post_media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

    setPosts(normalized);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const saveName = async () => {
    const name = fullName.trim();
    if (!name) {
      return Alert.alert(
        t("profile.missing_name_title", { defaultValue: "Missing name" }),
        t("profile.missing_name_body", { defaultValue: "Enter a name." })
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return router.replace("/sign-in");

    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", uid);
    if (error) return Alert.alert(t("profile.save_failed_title", { defaultValue: "Save failed" }), error.message);

    setEditing(false);
  };

  const deletePost = async (postId: string) => {
    Alert.alert(
      t("profile.delete_post_title", { defaultValue: "Delete post?" }),
      t("profile.delete_post_body", { defaultValue: "This cannot be undone." }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("common.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("posts").delete().eq("id", postId);
            if (error) return Alert.alert(t("profile.delete_failed_title", { defaultValue: "Delete failed" }), error.message);
            load();
          },
        },
      ]
    );
  };

  const roleLabel = useMemo(() => {
    if (role === "admin") return t("profile.badge_admin", { defaultValue: "ADMIN" });
    if (role === "moderator") return t("profile.badge_mod", { defaultValue: "MOD" });
    return "";
  }, [role, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("profile.title", { defaultValue: "Profile" })}
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          {t("profile.subtitle", { defaultValue: "Manage your account" })}
        </Text>

        {/* Debug info (DEV only) */}
        {__DEV__ ? (
          <View
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
              {t("profile.dev_admin_uid_check", { defaultValue: "Admin UID check:" })}
            </Text>

            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
              {t("profile.dev_you", { defaultValue: "You:" })} {myUserId ?? t("profile.dev_loading", { defaultValue: "(loading...)" })}
            </Text>

            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
              {t("profile.dev_admin", { defaultValue: "Admin:" })} {ADMIN_USER_ID}
            </Text>

            <Text style={{ color: isAdminByUid ? "#7CFF9A" : COLORS.muted, fontWeight: "900", marginTop: 4 }}>
              {isAdminByUid
                ? t("profile.dev_admin_by_uid_yes", { defaultValue: "✅ Admin by UID" })
                : t("profile.dev_admin_by_uid_no", { defaultValue: "❌ Not admin by UID" })}
            </Text>

            <Text style={{ color: isAdminByRole ? "#7CFF9A" : COLORS.muted, fontWeight: "900", marginTop: 4 }}>
              {isAdminByRole
                ? t("profile.dev_admin_by_role_yes", { role, defaultValue: `✅ Admin by role (${role})` })
                : t("profile.dev_role", { role, defaultValue: `Role: ${role}` })}
            </Text>
          </View>
        ) : null}

        {editing ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder={t("profile.full_name_placeholder", { defaultValue: "Full name" })}
              placeholderTextColor={COLORS.muted}
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                padding: 12,
                borderRadius: 12,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
              }}
            />

            <Pressable
              onPress={saveName}
              style={{
                backgroundColor: COLORS.button,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
                {t("common.save", { defaultValue: "Save" })}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setEditing(false)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: COLORS.text }}>
                {fullName || t("feed.rider_fallback", { defaultValue: "Rider" })}
              </Text>

              {roleLabel ? <Badge label={roleLabel} tone="gold" /> : null}
              {isLegacy ? <Badge label={t("profile.badge_legacy", { defaultValue: "LEGACY" })} tone="gold" /> : null}
              {isPremium ? <Badge label={t("profile.badge_premium", { defaultValue: "PREMIUM" })} tone="green" /> : null}
            </View>

            <Pressable onPress={() => setEditing(true)} style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.text, textDecorationLine: "underline", fontWeight: "800" }}>
                {t("profile.edit_name", { defaultValue: "Edit name" })}
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/followers", params: { id: myUserId ?? "" } })}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  {t("profile.followers", { count: followersCount, defaultValue: `Followers: ${followersCount}` })}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/following", params: { id: myUserId ?? "" } })}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  {t("profile.following", { count: followingCount, defaultValue: `Following: ${followingCount}` })}
                </Text>
              </Pressable>
            </View>

            {isAdmin ? (
              <Pressable
                onPress={() => router.push("/admin-feedback")}
                style={{
                  marginTop: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                  backgroundColor: COLORS.chip,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {t("profile.admin_view_feedback", { defaultValue: "Admin: View feedback" })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <Text style={{ marginTop: 18, fontWeight: "900", color: COLORS.text }}>
          {t("profile.my_posts", { count: posts.length, defaultValue: `My posts (${posts.length})` })}
        </Text>

        {loading ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>
            {t("common.loading", { defaultValue: "Loading…" })}
          </Text>
        ) : posts.length === 0 ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>
            {t("profile.empty_posts", { defaultValue: "You haven’t posted yet. Tap “Post” on the home screen 🚀" })}
          </Text>
        ) : (
          <FlatList
            style={{ marginTop: 10 }}
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 30 }}
            renderItem={({ item }) => {
              const urls = (item.post_media ?? []).map((m) => m.url).filter(Boolean);

              return (
                <View
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 16,
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: COLORS.muted }}>{new Date(item.created_at).toLocaleString()}</Text>

                    <Pressable onPress={() => deletePost(item.id)}>
                      <Text style={{ color: COLORS.danger, fontWeight: "900" }}>
                        {t("common.delete", { defaultValue: "Delete" })}
                      </Text>
                    </Pressable>
                  </View>

                  {urls[0] ? (
                    <Pressable onPress={() => openViewer(urls, 0)} onStartShouldSetResponder={() => true} style={{ marginTop: 10 }}>
                      <Image
                        source={{ uri: urls[0] }}
                        style={{
                          width: "100%",
                          height: 220,
                          borderRadius: 14,
                          backgroundColor: "#0F0F16",
                        }}
                        resizeMode="cover"
                        fadeDuration={0}
                      />

                      {urls.length > 1 ? (
                        <View
                          style={{
                            position: "absolute",
                            right: 10,
                            top: 10,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            backgroundColor: "rgba(0,0,0,0.55)",
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "900" }}>
                            {t("profile.photos_count", { count: urls.length, defaultValue: `${urls.length} photos` })}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : null}

                  {item.caption ? <Text style={{ marginTop: 10, color: COLORS.text }}>{item.caption}</Text> : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}