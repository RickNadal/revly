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

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSignUp = async () => {
    const n = fullName.trim();
    const e = email.trim();
    const p = password;

    if (!n) {
      return Alert.alert(
        t("auth.missing_name", { defaultValue: "Missing name" }),
        t("auth.enter_full_name", { defaultValue: "Please enter your full name." })
      );
    }

    if (!e) {
      return Alert.alert(
        t("auth.missing_email", { defaultValue: "Missing email" }),
        t("auth.enter_email", { defaultValue: "Please enter your email." })
      );
    }

    if (!p) {
      return Alert.alert(
        t("auth.missing_info_title", { defaultValue: "Missing info" }),
        t("auth.missing_info_body", { defaultValue: "Enter email and password." })
      );
    }

    if (p.length < 6) {
      return Alert.alert(
        t("auth.password_too_short", { defaultValue: "Password too short" }),
        t("auth.password_min_6", { defaultValue: "Use at least 6 characters." })
      );
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: p,
      options: {
        data: {
          full_name: n,
        },
      },
    });

    if (!error && data.session?.user?.id) {
      const uid = data.session.user.id;

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: uid,
          full_name: n,
        } as any,
        { onConflict: "id" }
      );

      if (profileErr) {
        console.log("PROFILE UPSERT AFTER SIGNUP ERROR:", profileErr);
      }
    }

    setLoading(false);

    if (error) {
      return Alert.alert(
        t("auth.sign_up_failed_title", { defaultValue: "Sign up failed" }),
        error.message
      );
    }

    Alert.alert(
      t("auth.sign_up_success_title", { defaultValue: "Account created" }),
      t("auth.sign_up_success_body", {
        defaultValue: "Check your email if confirmation is required, then sign in.",
      })
    );

    router.replace("/sign-in");
  };

  const behavior = Platform.OS === "ios" ? "padding" : "height";
  const keyboardOffset = Platform.OS === "ios" ? insets.top + 8 : 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={behavior}
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.container,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <Image
              source={require("../assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>
              {t("brand.tagline", { defaultValue: "Where bikers connect" })}
            </Text>

            <Text style={styles.subtitle}>
              {t("auth.sign_up_title", { defaultValue: "Sign up" })}
            </Text>

            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder={t("profile.full_name_placeholder", { defaultValue: "Full name" })}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                autoComplete="name"
                value={fullName}
                onChangeText={setFullName}
                returnKeyType="next"
              />

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

              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t("auth.password", { defaultValue: "Password" })}
                  placeholderTextColor={COLORS.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password-new"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={onSignUp}
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.passwordToggle,
                    pressed ? styles.passwordTogglePressed : null,
                  ]}
                >
                  <Text style={styles.passwordToggleText}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.button, loading ? styles.disabled : null]}
                onPress={onSignUp}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading
                    ? t("common.loading_dots", { defaultValue: "..." })
                    : t("auth.sign_up_button", { defaultValue: "Create account" })}
                </Text>
              </Pressable>

              <Link href="/sign-in" style={styles.link}>
                {t("auth.have_account_sign_in", {
                  defaultValue: "Already have an account? Sign in",
                })}
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
  logo: {
    width: 288,
    height: 288,
    alignSelf: "center",
  },
  tagline: {
    marginTop: -6,
    marginBottom: 10,
    color: COLORS.muted,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: "800",
  },
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
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    paddingLeft: 12,
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  passwordToggle: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  passwordTogglePressed: {
    opacity: 0.7,
  },
  passwordToggleText: {
    color: COLORS.text,
    fontWeight: "800",
  },
  button: {
    backgroundColor: COLORS.button,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: COLORS.buttonText,
    fontSize: 16,
    fontWeight: "900",
  },
  link: {
    marginTop: 6,
    color: COLORS.text,
    textDecorationLine: "underline",
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.7,
  },
});