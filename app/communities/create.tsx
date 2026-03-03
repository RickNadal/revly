// app/communities/create.tsx
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Privacy = "open" | "private";

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
};

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function CreateCommunityScreen() {
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("open");
  const [inviteCode, setInviteCode] = useState(makeInviteCode());
  const [loading, setLoading] = useState(false);

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? COLORS.button : COLORS.chip,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <Text style={{ color: active ? COLORS.buttonText : COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );

  const canSubmit = useMemo(() => name.trim().length >= 3, [name]);

  const create = async () => {
    const n = name.trim();
    const d = description.trim();

    if (n.length < 3) {
      return Alert.alert(
        t("communities_create.name_too_short_title", { defaultValue: "Name too short" }),
        t("communities_create.name_too_short_body", { defaultValue: "Use at least 3 characters." })
      );
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      router.replace("/sign-in");
      return;
    }

    const uid = session.user.id;

    // For open groups, invite_code can be null.
    // For private groups, we keep a code for invite-only joining.
    const codeToUse = privacy === "private" ? (inviteCode.trim().toUpperCase() || makeInviteCode()) : null;

    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        owner_id: uid,
        name: n,
        description: d || null,
        privacy,
        invite_code: codeToUse,
      } as any)
      .select("id")
      .single();

    if (error || !group?.id) {
      setLoading(false);
      return Alert.alert(
        t("communities_create.create_failed_title", { defaultValue: "Create failed" }),
        error?.message ?? t("communities_create.unknown_error", { defaultValue: "Unknown error" })
      );
    }

    // Add creator as owner/member (active)
    const { error: memErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: uid,
      role: "owner",
      status: "active",
    } as any);

    if (memErr) {
      // group exists; membership failed
      console.log("GROUP MEMBER INSERT ERROR:", memErr);
    }

    setLoading(false);
    router.replace({ pathname: "/communities/[id]", params: { id: group.id } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: COLORS.text }}>
          {t("communities_create.title", { defaultValue: "Create community" })}
        </Text>

        <Text style={{ marginTop: -6, color: COLORS.muted, fontWeight: "700" }}>
          {t("communities_create.subtitle", {
            defaultValue: "Choose open or private (invite-only / request approval).",
          })}
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("communities_create.name_placeholder", { defaultValue: "Community name" })}
          placeholderTextColor={COLORS.muted}
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            borderRadius: 14,
            padding: 12,
            fontWeight: "800",
          }}
        />

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t("communities_create.description_placeholder", { defaultValue: "Description (optional)" })}
          placeholderTextColor={COLORS.muted}
          multiline
          style={{
            borderWidth: 1,
            borderColor: COLORS.inputBorder,
            backgroundColor: COLORS.inputBg,
            color: COLORS.text,
            borderRadius: 14,
            padding: 12,
            minHeight: 90,
          }}
        />

        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>
          {t("communities_create.privacy_title", { defaultValue: "Privacy" })}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Chip
            active={privacy === "open"}
            label={t("communities_create.privacy_open", { defaultValue: "Open (anyone can join)" })}
            onPress={() => setPrivacy("open")}
          />
          <Chip
            active={privacy === "private"}
            label={t("communities_create.privacy_private", { defaultValue: "Private (invite/approval)" })}
            onPress={() => setPrivacy("private")}
          />
        </View>

        {privacy === "private" ? (
          <View
            style={{
              marginTop: 6,
              padding: 12,
              borderRadius: 16,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {t("communities_create.invite_code_title", { defaultValue: "Invite code" })}
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              {t("communities_create.invite_code_body", {
                defaultValue:
                  "Share this code with riders. They can join instantly if they have it, otherwise they can request access.",
              })}
            </Text>

            <TextInput
              value={inviteCode}
              onChangeText={(txt) => setInviteCode(txt.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder={t("communities_create.invite_code_placeholder", { defaultValue: "INVITE CODE" })}
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              style={{
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                backgroundColor: COLORS.inputBg,
                color: COLORS.text,
                borderRadius: 14,
                padding: 12,
                fontWeight: "900",
                letterSpacing: 2,
                textAlign: "center",
              }}
            />

            <Pressable
              onPress={() => setInviteCode(makeInviteCode())}
              disabled={loading}
              style={{
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {t("communities_create.generate_new_code", { defaultValue: "Generate new code" })}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={create}
          disabled={loading || !canSubmit}
          style={{
            backgroundColor: loading || !canSubmit ? "#777" : COLORS.button,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: COLORS.buttonText, fontWeight: "900" }}>
            {loading
              ? t("communities_create.creating", { defaultValue: "Creating…" })
              : t("communities_create.create", { defaultValue: "Create" })}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={loading}
          style={{
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {t("common.back", { defaultValue: "Back" })}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}