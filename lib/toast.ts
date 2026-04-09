/**
 * Simple toast notification helper
 * Shows native feedback to user
 */
import { Platform, ToastAndroid } from "react-native";

export const showToast = (
  message: string,
  type: "success" | "error" | "info" = "success",
  duration: number = 2000
) => {
  if (Platform.OS === "android") {
    const nativeDuration = duration >= 3000 ? ToastAndroid.LONG : ToastAndroid.SHORT;
    ToastAndroid.show(message, nativeDuration);
    return;
  }

  // iOS/web fallback without additional dependency setup
  console.log(`[${type.toUpperCase()}] ${message}`);
};

export const showError = (message: string) => showToast(message, "error");
export const showSuccess = (message: string) => showToast(message, "success");
export const showInfo = (message: string) => showToast(message, "info");
