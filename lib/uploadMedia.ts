/**
 * Reliable media uploader for React Native / Expo.
 *
 * Uses expo-file-system uploadAsync which streams the file directly —
 * avoids the "Network request failed" error that fetch().blob() causes
 * with local file:// URIs on Android.
 */
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

function extFromUri(uri: string, type?: "image" | "video") {
  const clean = String(uri).split("?")[0].split("#")[0];
  const fromUri = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "";
  if (fromUri) return fromUri;
  return type === "video" ? "mp4" : "jpg";
}

function mimeFromExt(ext: string, type?: "image" | "video") {
  const e = ext.toLowerCase();
  if (type === "video" || ["mp4", "mov", "m4v", "webm"].includes(e)) {
    if (e === "mov") return "video/quicktime";
    if (e === "webm") return "video/webm";
    return "video/mp4";
  }
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

export async function uploadMediaToSupabase(
  uri: string,
  bucket: string,
  storagePath: string,
  type?: "image" | "video",
  onProgress?: (progress: number) => void
): Promise<string> {
  const ext = extFromUri(uri, type);
  const mime = mimeFromExt(ext, type);

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;

  const task = FileSystem.createUploadTask(
    uploadUrl,
    uri,
    {
      httpMethod: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mime,
        "x-upsert": "false",
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    onProgress
      ? (e) => {
          if (e.totalBytesSent && e.totalBytesExpectedToSend) {
            onProgress(e.totalBytesSent / e.totalBytesExpectedToSend);
          }
        }
      : undefined
  );

  const result = await task.uploadAsync();

  if (!result || result.status !== 200) {
    let msg = result?.body ?? "Upload failed";
    try {
      const parsed = JSON.parse(result?.body ?? "");
      msg = parsed?.message ?? parsed?.error ?? msg;
    } catch {}
    throw new Error(msg || `Upload failed (HTTP ${result?.status})`);
  }

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}
