import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

type PushType = "like" | "comment" | "follow" | "mention";

const PUSH_STEP_TIMEOUT_MS = 10000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function getExpoProjectId(): string | null {
  const fromEas = (Constants as any)?.easConfig?.projectId;
  if (typeof fromEas === "string" && fromEas.trim()) return fromEas;

  const fromExpoConfig = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === "string" && fromExpoConfig.trim()) return fromExpoConfig;

  return null;
}

function isExpoGo(): boolean {
  const ownership = String((Constants as any)?.appOwnership ?? "").toLowerCase();
  const env = String((Constants as any)?.executionEnvironment ?? "").toLowerCase();
  return ownership === "expo" || env === "storeclient";
}

export async function registerPushTokenForUser(userId: string): Promise<void> {
  if (!userId) return;

  if (Platform.OS === "web") return;
  if (isExpoGo()) return;

  let Device: typeof import("expo-device") | null = null;
  let Notifications: typeof import("expo-notifications") | null = null;

  try {
    Device = await import("expo-device");
    Notifications = await import("expo-notifications");
  } catch (e: any) {
    console.log("PUSH MODULE LOAD ERROR:", e?.message ?? String(e));
    return;
  }

  if (!Device?.isDevice || !Notifications) return;
  if (typeof Notifications.getPermissionsAsync !== "function") return;
  if (typeof Notifications.requestPermissionsAsync !== "function") return;
  if (typeof Notifications.getExpoPushTokenAsync !== "function") return;

  try {
    const existing = await withTimeout(Notifications.getPermissionsAsync(), PUSH_STEP_TIMEOUT_MS, "getPermissionsAsync");
    let status = existing.status;

    if (status !== "granted") {
      const requested = await withTimeout(Notifications.requestPermissionsAsync(), PUSH_STEP_TIMEOUT_MS, "requestPermissionsAsync");
      status = requested.status;
    }

    if (status !== "granted") return;

    const projectId = getExpoProjectId();
    if (!projectId) {
      console.log("PUSH: missing Expo projectId for push token registration");
      return;
    }

    const tokenResponse = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }), PUSH_STEP_TIMEOUT_MS, "getExpoPushTokenAsync");
    const token = String(tokenResponse.data ?? "").trim();
    if (!token) return;

    if (Platform.OS === "android") {
      await withTimeout(
        Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FFFFFF",
        }),
        PUSH_STEP_TIMEOUT_MS,
        "setNotificationChannelAsync"
      );
    }

    const { error } = await withTimeout(
      (async () =>
        supabase.from("user_push_tokens").upsert(
          {
            user_id: userId,
            expo_push_token: token,
            platform: Platform.OS,
            disabled: false,
            last_error: null,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "expo_push_token" }
        ))(),
      PUSH_STEP_TIMEOUT_MS,
      "push token upsert"
    );

    if (error) {
      console.log("PUSH TOKEN UPSERT ERROR:", error.message);
    }
  } catch (e: any) {
    console.log("PUSH REGISTRATION SKIPPED:", e?.message ?? String(e));
  }
}

export async function sendPushEvent(opts: {
  recipientUserId: string;
  type: PushType;
  postId?: string | null;
}): Promise<void> {
  const recipientUserId = String(opts.recipientUserId ?? "").trim();
  if (!recipientUserId) return;

  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: {
      recipientUserId,
      type: opts.type,
      postId: opts.postId ?? null,
    },
  });

  if (error) {
    console.log("PUSH EVENT INVOKE ERROR:", error.message);
  }
}
