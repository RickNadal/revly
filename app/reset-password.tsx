import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
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

function getAllParamsFromUrl(url: string) {
  const result = new URLSearchParams();

  if (!url) {
    return result;
  }

  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");

  if (queryIndex >= 0) {
    const queryString =
      hashIndex >= 0 ? url.slice(queryIndex + 1, hashIndex) : url.slice(queryIndex + 1);

    const queryParams = new URLSearchParams(queryString);

    queryParams.forEach((value, key) => {
      result.set(key, value);
    });
  }

  if (hashIndex >= 0) {
    const hashString = url.slice(hashIndex + 1);
    const hashParams = new URLSearchParams(hashString);

    hashParams.forEach((value, key) => {
      result.set(key, value);
    });
  }

  return result;
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    let mounted = true;

    const prepareRecovery = async (incomingUrl?: string | null) => {
      try {
        const url = incomingUrl ?? (await Linking.getInitialURL());

        if (!url) {
          if (mounted) {
            setPreparing(false);
          }
          return;
        }

        const params = getAllParamsFromUrl(url);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            Alert.alert("Recovery link error", error.message);
            if (mounted) {
              setPreparing(false);
            }
            return;
          }

          if (mounted) {
            setPreparing(false);
          }
          return;
        }

        if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            Alert.alert("Recovery link error", error.message);
            if (mounted) {
              setPreparing(false);
            }
            return;
          }

          if (mounted) {
            setPreparing(false);
          }
          return;
        }

        if (mounted) {
          setPreparing(false);
        }
      } catch (error: any) {
        Alert.alert("Link error", error?.message ?? "Could not process reset link.");
        if (mounted) {
          setPreparing(false);
        }
      }
    };

    prepareRecovery();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      prepareRecovery(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const onSaveNewPassword = async () => {
    const newPassword = password.trim();
    const confirm = confirmPassword.trim();

    if (preparing) {
      Alert.alert("Please wait", "Still preparing the reset link.");
      return;
    }

    if (!newPassword || !confirm) {
      Alert.alert("Missing info", "Enter your new password in both fields.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }

    if (newPassword !== confirm) {
      Alert.alert("Passwords do not match", "Both password fields must match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Password update failed", error.message);
      return;
    }

    Alert.alert("Password updated", "Your password has been changed.", [
      {
        text: "OK",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/sign-in");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            {preparing ? "Preparing reset link..." : "Enter your new password below."}
          </Text>

          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              editable={!preparing && !loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!preparing && !loading}
            />

            <Pressable
              style={[styles.button, (preparing || loading) && styles.disabled]}
              onPress={onSaveNewPassword}
              disabled={preparing || loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Saving..." : "Save new password"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    backgroundColor: COLORS.bg,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    marginBottom: 18,
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
  disabled: {
    opacity: 0.7,
  },
});