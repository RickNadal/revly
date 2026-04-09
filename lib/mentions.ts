import { supabase } from "./supabase";

const MENTION_REGEX = /(^|[^a-z0-9_])(@[a-z0-9_]{2,30})/gi;

const mentionCache = new Map<string, string | null>();
const mentionPending = new Map<string, Promise<string | null>>();

export function normalizeMentionHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
}

export function displayNameToMentionHandle(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
}

export function getTrailingMentionQuery(text: string): string {
  const match = String(text ?? "").match(/(?:^|\s)@([a-z0-9_]*)$/i);
  if (!match) return "";
  return normalizeMentionHandle(match[1] ?? "");
}

export function applyMentionSuggestion(text: string, fullName: string): string {
  const handle = displayNameToMentionHandle(fullName);
  if (!handle) return text;

  if (/(?:^|\s)@([a-z0-9_]*)$/i.test(text)) {
    return text.replace(/(?:^|\s)@([a-z0-9_]*)$/i, (full) => {
      const prefix = full.startsWith(" ") ? " " : "";
      return `${prefix}@${handle} `;
    });
  }

  const needsSpace = text.length > 0 && !/\s$/.test(text);
  return `${text}${needsSpace ? " " : ""}@${handle} `;
}

export function splitTextWithMentions(text: string): Array<{ text: string; handle: string | null }> {
  const source = String(text ?? "");
  if (!source) return [{ text: "", handle: null }];

  const segments: Array<{ text: string; handle: string | null }> = [];
  MENTION_REGEX.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(source)) !== null) {
    const fullMatch = match[0] ?? "";
    const prefix = match[1] ?? "";
    const mentionRaw = match[2] ?? "";
    const startIndex = match.index;
    const mentionStart = startIndex + prefix.length;

    if (startIndex > cursor) {
      segments.push({ text: source.slice(cursor, startIndex), handle: null });
    }

    if (prefix) {
      segments.push({ text: prefix, handle: null });
    }

    const handle = normalizeMentionHandle(mentionRaw);
    segments.push({ text: source.slice(mentionStart, mentionStart + mentionRaw.length), handle: handle || null });

    cursor = startIndex + fullMatch.length;
  }

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), handle: null });
  }

  return segments;
}

export function extractMentionHandles(text: string): string[] {
  const out = new Set<string>();
  const segments = splitTextWithMentions(text);
  for (const seg of segments) {
    if (seg.handle) out.add(seg.handle);
  }
  return Array.from(out);
}

async function resolveMentionHandleToUserId(handle: string): Promise<string | null> {
  const normalized = normalizeMentionHandle(handle);
  if (!normalized) return null;

  if (mentionCache.has(normalized)) {
    return mentionCache.get(normalized) ?? null;
  }

  if (mentionPending.has(normalized)) {
    return mentionPending.get(normalized) ?? null;
  }

  const pending = (async () => {
    const probe = normalized.slice(0, Math.min(3, normalized.length));
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${probe}%`)
      .limit(40);

    if (error) {
      mentionCache.set(normalized, null);
      return null;
    }

    const rows = (data ?? []) as Array<{ id: string; full_name: string | null }>;

    let bestId: string | null = null;
    let bestScore = -1;

    for (const row of rows) {
      const fullName = String(row.full_name ?? "").trim();
      if (!fullName) continue;

      const compact = displayNameToMentionHandle(fullName);
      if (!compact) continue;

      let score = -1;
      if (compact === normalized) score = 100;
      else if (compact.startsWith(normalized)) score = 80;
      else if (compact.includes(normalized)) score = 60;

      const tokens = fullName
        .toLowerCase()
        .split(/\s+/)
        .map((tok) => tok.replace(/[^a-z0-9_]/g, ""))
        .filter(Boolean);

      if (tokens.some((tok) => tok === normalized)) score = Math.max(score, 95);
      else if (tokens.some((tok) => tok.startsWith(normalized))) score = Math.max(score, 75);

      if (score > bestScore) {
        bestScore = score;
        bestId = row.id;
      }
    }

    const resolved = bestScore >= 70 ? bestId : null;
    mentionCache.set(normalized, resolved);
    return resolved;
  })();

  mentionPending.set(normalized, pending);

  try {
    return await pending;
  } finally {
    mentionPending.delete(normalized);
  }
}

export async function resolveMentionHandlesToUserIds(handles: string[]): Promise<Record<string, string>> {
  const normalizedHandles = Array.from(new Set(handles.map(normalizeMentionHandle).filter(Boolean)));
  const resolvedEntries = await Promise.all(
    normalizedHandles.map(async (handle) => {
      const userId = await resolveMentionHandleToUserId(handle);
      return [handle, userId] as const;
    })
  );

  const out: Record<string, string> = {};
  for (const [handle, userId] of resolvedEntries) {
    if (handle && userId) out[handle] = userId;
  }
  return out;
}
