import { Link, router } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSignIn = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) return Alert.alert("Missing info", "Enter email and password.");

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    setLoading(false);

    if (error) return Alert.alert("Sign in failed", error.message);
    router.replace("/"); // go home
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Revly</Text>
        <Text style={styles.tagline}>Where bikers connect</Text>

        <Text style={styles.subtitle}>Sign in</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={[styles.button, loading ? { opacity: 0.7 } : null]} onPress={onSignIn} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "..." : "Sign In"}</Text>
          </Pressable>

          <Link href="/sign-up" style={styles.link}>
            Create an account
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: "center",
    gap: 12,
    backgroundColor: COLORS.bg,
  },
  title: { fontSize: 44, fontWeight: "900", color: COLORS.text, textAlign: "left" },
  tagline: { marginTop: -6, marginBottom: 10, color: COLORS.muted, fontWeight: "700" },
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
