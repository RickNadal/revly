// lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;
let _missingEnvAlertShown = false;

function showMissingEnvAlert() {
  if (_missingEnvAlertShown) return;
  _missingEnvAlertShown = true;

  Alert.alert(
    "Supabase not configured",
    "This build is missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add both for the Play build profile, rebuild, and reinstall."
  );
}

function createPlaceholderClient() {
  return createClient("https://example.invalid", "invalid-key", {
    auth: {
      storage: AsyncStorage,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function getClient(): SupabaseClient {
  if (_client) return _client;

  if (!supabaseUrl || !supabaseAnonKey) {
    showMissingEnvAlert();
    _client = createPlaceholderClient();
    return _client;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: string) {
    const client = getClient();

    if (!supabaseUrl || !supabaseAnonKey) {
      if (prop === "auth" || prop === "from" || prop === "rpc" || prop === "storage") {
        showMissingEnvAlert();
      }
    }

    // @ts-expect-error dynamic proxy access
    return client[prop];
  },
}) as SupabaseClient;

export const SUPABASE_DEBUG = {
  url: supabaseUrl || "MISSING_SUPABASE_URL",
  hasAnonKey: !!supabaseAnonKey,
};