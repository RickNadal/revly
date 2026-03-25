// app/sign-in.tsx
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignIn() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onSignIn = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) {
      Alert.alert(
        t("auth.missing_info_title", { defaultValue: "Missing info" }),
        t("auth.missing_info_body", { defaultValue: "Enter email and password." })
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password: p,
    });

    setLoading(false);

    if (error) {
      Alert.alert(
        t("auth.sign_in_failed_title", { defaultValue: "Sign in failed" }),
        error.message
      );
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (session) {
        const userId = session.user.id;

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("is_banned")
          .eq("id", userId)
          .single();

        if (!profErr && (prof as any)?.is_banned) {
          await supabase.auth.signOut();
          Alert.alert("Account banned", "This account has been banned.");
          return;
        }
      }
    } catch {
      // ignore profile check failure
    }

    router.replace("/");
  };

  const onForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Email required", "Enter your email first.");
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: "oranga://reset-password",
    });

    setResetLoading(false);

    if (error) {
      Alert.alert("Reset failed", error.message);
      return;
    }

    Alert.alert(
      "Check your email",
      "We sent a password reset link to your email. Also check your spam folder."
    );
  };

  const keyboardOffset = Platform.OS === "ios" ? insets.top + 8 : 0;
  const logoSize = keyboardOpen ? 160 : 288;
  const taglineVisible = !keyboardOpen;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
      >
        <View
          style={[
            styles.container,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
        >
          <View style={styles.top}>
            <Image
              source={require("../assets/icon.png")}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
            />
            {taglineVisible ? (
              <Text style={styles.tagline}>
                {t("brand.tagline", { defaultValue: "Where bikers connect" })}
              </Text>
            ) : null}
          </View>

          <Text style={styles.subtitle}>
            {t("auth.sign_in_title", { defaultValue: "Sign in" })}
          </Text>

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

            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t("auth.password", { defaultValue: "Password" })}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={onSignIn}
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
              onPress={onForgotPassword}
              disabled={loading || resetLoading}
              style={({ pressed }) => [
                styles.forgotWrap,
                (pressed || loading || resetLoading) && styles.disabled,
              ]}
            >
              <Text style={styles.forgotText}>
                {resetLoading ? "Sending reset email..." : "Forgot password?"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, loading && styles.disabled]}
              onPress={onSignIn}
              disabled={loading || resetLoading}
            >
              <Text style={styles.buttonText}>
                {loading
                  ? t("common.loading_dots", { defaultValue: "..." })
                  : t("auth.sign_in_button", { defaultValue: "Sign In" })}
              </Text>
            </Pressable>

            <Link href="/sign-up" style={styles.link}>
              {t("auth.create_account", { defaultValue: "Create an account" })}
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: COLORS.bg,
    justifyContent: "flex-start",
  },
  top: {
    alignItems: "center",
    marginBottom: 10,
  },
  tagline: {
    marginTop: -6,
    marginBottom: 6,
    color: COLORS.muted,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: "800",
    marginTop: 6,
  },
  card: {
    marginTop: 10,
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
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: -2,
  },
  forgotText: {
    color: COLORS.text,
    textDecorationLine: "underline",
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