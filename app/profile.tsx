import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

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
};

// 🔒 Replace this with YOUR Supabase Auth UID (you will see it printed on screen below)
const ADMIN_USER_ID = "165b27e6-a9df-4cc2-a529-9c667cb5f018";

function openViewer(urls: string[], index: number) {
  if (!urls.length) return;

  router.push({
    pathname: "/viewer",
    params: {
      urls: encodeURIComponent(JSON.stringify(urls)),
      index: String(index),
    },
  });
}

export default function Profile() {
  const [fullName, setFullName] = useState("");
  const [editing, setEditing] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return;
    }

    const uid = sessionData.session.user.id;
    setMyUserId(uid);

    // Profile name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", uid)
      .single();

    if (profile?.full_name) setFullName(profile.full_name);

    // Counts
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

    // My posts
    const { data: userPosts } = await supabase
      .from("posts")
      .select("id, caption, created_at, post_media(url, sort_order)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    const normalized = (userPosts ?? []).map((p: any) => ({
      ...p,
      post_media: (p.post_media ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
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
    if (!name) return Alert.alert("Missing name", "Enter a name.");

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return router.replace("/sign-in");

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", uid);

    if (error) return Alert.alert("Save failed", error.message);

    setEditing(false);
  };

  const deletePost = async (postId: string) => {
    Alert.alert("Delete post?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("posts")
            .delete()
            .eq("id", postId);

          if (error) return Alert.alert("Delete failed", error.message);

          load();
        },
      },
    ]);
  };

  const isAdmin = !!myUserId && myUserId === ADMIN_USER_ID;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "left", "right"]}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {/* Header */}
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          Profile
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: "700" }}>
          Manage your account
        </Text>

        {/* ✅ Debug line so you can see your UID */}
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
            Admin UID check:
          </Text>
          <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
            You: {myUserId ?? "(loading...)"}
          </Text>
          <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
            Admin: {ADMIN_USER_ID}
          </Text>
          <Text style={{ color: isAdmin ? "#7CFF9A" : COLORS.muted, fontWeight: "900", marginTop: 4 }}>
            {isAdmin ? "✅ Admin unlocked" : "❌ Not admin (UID mismatch)"}
          </Text>
        </View>

        {/* Name section */}
        {editing ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
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
                Save
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
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: COLORS.text }}>
              {fullName || "Rider"}
            </Text>

            <Pressable onPress={() => setEditing(true)} style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: COLORS.text,
                  textDecorationLine: "underline",
                  fontWeight: "800",
                }}
              >
                Edit name
              </Text>
            </Pressable>

            {/* Followers / Following */}
            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              <Pressable
                onPress={() => router.push("/followers")}
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
                  Followers: {followersCount}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/following")}
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
                  Following: {followingCount}
                </Text>
              </Pressable>
            </View>

            {/* ✅ Admin button only if UID matches */}
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
                  Admin: View feedback
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Posts */}
        <Text style={{ marginTop: 18, fontWeight: "900", color: COLORS.text }}>
          My posts ({posts.length})
        </Text>

        {loading ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>Loading...</Text>
        ) : posts.length === 0 ? (
          <Text style={{ marginTop: 12, color: COLORS.muted }}>
            You haven’t posted yet. Tap “Post” on the home screen 🚀
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
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.muted }}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>

                    <Pressable onPress={() => deletePost(item.id)}>
                      <Text style={{ color: COLORS.danger, fontWeight: "900" }}>
                        Delete
                      </Text>
                    </Pressable>
                  </View>

                  {urls[0] ? (
                    <Pressable
                      onPress={() => openViewer(urls, 0)}
                      style={{ marginTop: 10 }}
                    >
                      <Image
                        source={{ uri: urls[0] }}
                        style={{
                          width: "100%",
                          height: 220,
                          borderRadius: 14,
                          backgroundColor: "#0F0F16",
                        }}
                        resizeMode="cover"
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
                            {urls.length} photos
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : null}

                  {item.caption ? (
                    <Text style={{ marginTop: 10, color: COLORS.text }}>
                      {item.caption}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
