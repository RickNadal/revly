import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Alert, Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Create lazily so the app doesn't crash at import-time.
let _client: SupabaseClient | null = null;

function showMissingEnvAlert() {
  Alert.alert(
    "Supabase not configured",
    "Your build is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.\n\nFix: expo.dev → Project → Environment variables → add both (UPPERCASE) for 'preview', then rebuild with --clear-cache and reinstall."
  );
}

function showInvalidUrlAlert(badValue: string) {
  Alert.alert(
    "Startup config error",
    `A URL value is invalid in this build.\n\nValue: ${badValue}\n\nThis usually happens when a redirect URL is set to "app" instead of a real scheme like "revly://".`
  );
}

// Make a safe redirect URL for native auth flows.
// IMPORTANT: This must match your app scheme in app.json ("scheme": "revly")
function getRedirectUrl(): string {
  // This produces something like: revly://auth-callback
  return Linking.createURL("auth-callback");
}

// Basic URL sanity check so "app" can't crash the runtime.
function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function getClient(): SupabaseClient {
  if (_client) return _client;

  // If env missing, make placeholder client (won't crash app)
  if (!supabaseUrl || !supabaseAnonKey) {
    _client = createClient("https://example.invalid", "invalid-key");
    return _client;
  }

  // Prevent "Invalid URL: app" type crashes due to bad env url values
  if (!isValidHttpUrl(supabaseUrl)) {
    showInvalidUrlAlert(String(supabaseUrl));
    _client = createClient("https://example.invalid", "invalid-key");
    return _client;
  }

  const redirectTo = getRedirectUrl();

  // Create client with native-safe auth config.
  // Key changes:
  // - flowType: "pkce" (recommended for native)
  // - detectSessionInUrl: false (prevents URL parsing assumptions)
  // - redirectTo passed via signIn methods (kept here as helper value)
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: Platform.OS === "web" ? "implicit" : "pkce",
    },
    global: {
      // Optional: helps some edge cases in release builds
      headers: {
        "X-Client-Info": "revly-mobile",
      },
    },
  });

  // Expose redirectTo value for use by your auth calls if needed.
  // (Doesn't change runtime behavior by itself)
  // @ts-expect-error attach helper
  _client.__redirectTo = redirectTo;

  return _client;
}

// Proxy that prevents instant-crash and gives readable error instead.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const client = getClient();

      // If env is missing, intercept common access patterns and show alert.
      if (
        (!supabaseUrl || !supabaseAnonKey) &&
        (prop === "auth" || prop === "from" || prop === "storage")
      ) {
        showMissingEnvAlert();
      }

      // @ts-expect-error dynamic proxy
      return client[prop];
    },
  }
) as SupabaseClient;

// Helper you can import anywhere to use the correct redirect URL (safe)
export function getSupabaseRedirectUrl(): string {
  return getRedirectUrl();
}
