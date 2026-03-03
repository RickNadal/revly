// app/sign-up.tsx
import { Link, router } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

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

export default function SignUp() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSignUp = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) {
      return Alert.alert(
        t("auth.missing_info_title", { defaultValue: "Missing info" }),
        t("auth.missing_info_body", { defaultValue: "Enter email and password." })
      );
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email: e, password: p });
    setLoading(false);

    if (error) {
      return Alert.alert(t("auth.sign_up_failed_title", { defaultValue: "Sign up failed" }), error.message);
    }

    Alert.alert(
      t("auth.sign_up_success_title", { defaultValue: "Account created" }),
      t("auth.sign_up_success_body", { defaultValue: "Check your email if confirmation is required, then sign in." })
    );
    router.replace("/sign-in");
  };

  // Make sure content can move above keyboard on BOTH iOS + Android
  // Android typically needs "height"; iOS works best with "padding"
  const behavior = Platform.OS === "ios" ? "padding" : "height";

  // Small offset prevents the top content from jumping under the status bar
  const keyboardOffset = Platform.OS === "ios" ? insets.top + 8 : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={behavior} keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <Image source={require("../assets/icon.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>{t("brand.tagline", { defaultValue: "Where bikers connect" })}</Text>

            <Text style={styles.subtitle}>{t("auth.sign_up_title", { defaultValue: "Sign up" })}</Text>

            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder={t("auth.email", { defaultValue: "Email" })}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                returnKeyType="next"
              />

              <TextInput
                style={styles.input}
                placeholder={t("auth.password", { defaultValue: "Password" })}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={onSignUp}
              />

              <Pressable style={[styles.button, loading ? { opacity: 0.7 } : null]} onPress={onSignUp} disabled={loading}>
                <Text style={styles.buttonText}>
                  {loading
                    ? t("common.loading_dots", { defaultValue: "..." })
                    : t("auth.sign_up_button", { defaultValue: "Create account" })}
                </Text>
              </Pressable>

              <Link href="/sign-in" style={styles.link}>
                {t("auth.have_account_sign_in", { defaultValue: "Already have an account? Sign in" })}
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
  },
  inner: {
    gap: 12,
  },
  logo: { width: 288, height: 288, alignSelf: "center" },
  tagline: { marginTop: -6, marginBottom: 10, color: COLORS.muted, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 18, color: COLORS.text, fontWeight: "800" },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  button: { backgroundColor: COLORS.button, padding: 14, borderRadius: 12, alignItems: "center" },
  buttonText: { color: COLORS.buttonText, fontSize: 16, fontWeight: "900" },

  link: { marginTop: 6, color: COLORS.text, textDecorationLine: "underline", fontWeight: "800" },
});