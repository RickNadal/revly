// lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Alert, AppState, type AppStateStatus } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;
let _missingEnvAlertShown = false;
let _authLifecycleInitialized = false;
let _appStateSubscription: { remove: () => void } | null = null;

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

async function refreshSessionIfNeeded(client: SupabaseClient) {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return;

    const session = data.session;
    if (!session) return;

    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    const msLeft = expiresAtMs - Date.now();
    if (msLeft <= 60_000) {
      await client.auth.refreshSession();
    }
  } catch {}
}

export function initSupabaseAuthLifecycle() {
  if (_authLifecycleInitialized) return;
  _authLifecycleInitialized = true;

  if (!supabaseUrl || !supabaseAnonKey) return;

  const client = getClient();

  const applyState = (state: AppStateStatus) => {
    if (state === "active") {
      client.auth.startAutoRefresh();
      refreshSessionIfNeeded(client).catch(() => {});
      return;
    }

    client.auth.stopAutoRefresh();
  };

  applyState(AppState.currentState);
  _appStateSubscription = AppState.addEventListener("change", applyState);
}

export function disposeSupabaseAuthLifecycle() {
  _appStateSubscription?.remove();
  _appStateSubscription = null;
  _authLifecycleInitialized = false;

  if (!supabaseUrl || !supabaseAnonKey) return;

  try {
    getClient().auth.stopAutoRefresh();
  } catch {}
}

export async function signOutSafely() {
  async function clearAuthStorageKeys() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const authKeys = keys.filter((k) => {
        if (k === "supabase.auth.token") return true;
        if (k === "sb-access-token") return true;
        if (k === "sb-refresh-token") return true;
        return /^sb-[a-z0-9]+-auth-token$/i.test(k);
      });

      if (authKeys.length > 0) {
        await AsyncStorage.multiRemove(authKeys);
      }
    } catch {}
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {}

  await clearAuthStorageKeys();
}