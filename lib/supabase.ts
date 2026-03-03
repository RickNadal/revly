// lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// We create lazily so the app doesn't crash at import-time.
let _client: SupabaseClient | null = null;

function showMissingEnvAlert() {
  Alert.alert(
    "Supabase not configured",
    "Your build is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.\n\nFix: expo.dev → Project → Environment variables → add both (UPPERCASE) for 'preview', then rebuild with --clear-cache and reinstall."
  );
}

function getClient(): SupabaseClient {
  if (_client) return _client;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Create a harmless placeholder client so imports don't crash.
    // Any actual use will show a clear alert.
    _client = createClient("https://example.invalid", "invalid-key");
    return _client;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage, // ✅ this is the key: persist session on device
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

// Proxy that prevents instant-crash and gives readable error instead.
export const supabase = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop: string) {
      const client = getClient();

      // If env is missing, intercept common access patterns and show alert.
      if ((!supabaseUrl || !supabaseAnonKey) && (prop === "auth" || prop === "from" || prop === "storage")) {
        showMissingEnvAlert();
      }

      // @ts-expect-error dynamic proxy
      return client[prop];
    },
  }
) as SupabaseClient;
