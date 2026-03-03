// app/messages/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ThreadRow = {
  id: string;
  user_a: string;
  user_b: string;
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
};

export default function MessageThreadScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const threadId = params.id;

  const insets = useSafeAreaInsets();

  const [meId, setMeId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadRow | null>(null);
  const [otherName, setOtherName] = useState("Messages");

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<MessageRow>>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const subShow = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const ensureAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/sign-in");
      return null;
    }
    return data.session.user.id;
  };

  const load = useCallback(async () => {
    if (!threadId) return;

    setLoading(true);

    const uid = await ensureAuth();
    if (!uid) return;

    setMeId(uid);

    const { data: t, error: tErr } = await supabase
      .from("dm_threads")
      .select("id, user_a, user_b")
      .eq("id", threadId)
      .single();

    if (tErr || !t) {
      setLoading(false);
      setThread(null);
      setMessages([]);
      return;
    }

    setThread(t as any);

    const otherId = uid === (t as any).user_a ? (t as any).user_b : (t as any).user_a;
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", otherId).maybeSingle();
    setOtherName(prof?.full_name ?? "Rider");

    const { data: msgs, error: mErr } = await supabase
      .from("dm_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (mErr) console.log("DM MESSAGES LOAD ERROR:", mErr);

    setMessages((msgs ?? []) as any);
    setLoading(false);

    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: false });
      } catch {}
    }, 30);
  }, [threadId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!threadId) return;

    const uid = await ensureAuth();
    if (!uid) return;

    setSending(true);
    try {
      const optimistic: MessageRow = {
        id: `tmp-${Date.now()}`,
        thread_id: threadId,
        sender_id: uid,
        body,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setText("");

      setTimeout(() => {
        try {
          listRef.current?.scrollToEnd({ animated: true });
        } catch {}
      }, 20);

      const { error } = await supabase.from("dm_messages").insert({
        thread_id: threadId,
        sender_id: uid,
        body,
      } as any);

      if (error) {
        // revert optimistic
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(body);
        return;
      }

      // reload to replace tmp id with real id
      await load();
    } finally {
      setSending(false);
    }
  };

  const inputBarHeight = 64;
  const extraBottom = insets.bottom + 12;
  const bottomOffset = keyboardHeight > 0 ? keyboardHeight : 0;

  const renderBubble = ({ item }: { item: MessageRow }) => {
    const mine = !!meId && item.sender_id === meId;

    return (
      <View style={{ paddingVertical: 6 }}>
        <View
          style={{
            alignSelf: mine ? "flex-end" : "flex-start",
            maxWidth: "84%",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 16,
            backgroundColor: mine ? COLORS.button : COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: mine ? COLORS.buttonText : COLORS.text, fontWeight: "700", lineHeight: 20 }}>
            {item.body}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 11, fontWeight: "800", color: mine ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)" }}>
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      {/* Header */}
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

          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              {otherName}
            </Text>
            <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 2, fontSize: 12 }}>
              {loading ? "Loading…" : "Text chat"}
            </Text>
          </View>

          <Pressable
            onPress={load}
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
            <Ionicons name="refresh-outline" size={20} color={COLORS.text} />
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderBubble}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: inputBarHeight + extraBottom + 16 + bottomOffset,
        }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: COLORS.muted }}>No messages yet.</Text>
          </View>
        }
      />

      {/* Input */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
          backgroundColor: COLORS.bg,
          borderTopWidth: 1,
          borderColor: COLORS.border,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={COLORS.muted}
          multiline
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 12,
            borderRadius: 14,
            backgroundColor: COLORS.card,
            color: COLORS.text,
            maxHeight: 120,
          }}
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          style={{
            backgroundColor: sending || !text.trim() ? "#777" : COLORS.button,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>{sending ? "…" : "Send"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}