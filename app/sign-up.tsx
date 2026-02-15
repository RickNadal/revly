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
};

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSignUp = async () => {
    const name = fullName.trim();
    const e = email.trim();

    if (!name) return Alert.alert("Missing name", "Please enter your full name.");
    if (!e) return Alert.alert("Missing email", "Please enter your email.");
    if (password.length < 6) return Alert.alert("Password too short", "Use at least 6 characters.");

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email: e, password });

    if (error) {
      setLoading(false);
      Alert.alert("Sign up failed", error.message);
      return;
    }

    // Create profile row
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        full_name: name,
      });

      if (profileError) {
        setLoading(false);
        Alert.alert("Profile error", profileError.message);
        return;
      }
    }

    setLoading(false);

    // If Supabase returns a session, you're signed in immediately.
    // If not, user must sign in (or confirm email depending on project settings).
    if (data.session) {
      router.replace("/");
    } else {
      Alert.alert("Account created", "Now sign in.");
      router.replace("/sign-in");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join Revly — Where bikers connect</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={COLORS.muted}
            value={fullName}
            onChangeText={setFullName}
          />
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
            placeholder="Password (min 6 chars)"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={[styles.button, loading ? { opacity: 0.7 } : null]} onPress={onSignUp} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "..." : "Sign Up"}</Text>
          </Pressable>

          <Link href="/sign-in" style={styles.link}>
            I already have an account
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
  title: { fontSize: 28, fontWeight: "900", color: COLORS.text },
  subtitle: { marginTop: -6, marginBottom: 8, color: COLORS.muted, fontWeight: "700" },

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
