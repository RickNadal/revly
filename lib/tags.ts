export function normalizeTagInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
}

export function getTrailingTagQuery(text: string): string {
  const match = text.match(/(?:^|\s)#([a-z0-9_]*)$/i);
  if (!match) return "";
  return normalizeTagInput(match[1] ?? "");
}

export function applyTagSuggestion(text: string, tag: string): string {
  const normalized = normalizeTagInput(tag);
  if (!normalized) return text;

  if (/(?:^|\s)#([a-z0-9_]*)$/i.test(text)) {
    return text.replace(/(?:^|\s)#([a-z0-9_]*)$/i, (full) => {
      const prefix = full.startsWith(" ") ? " " : "";
      return `${prefix}#${normalized} `;
    });
  }

  const needsSpace = text.length > 0 && !/\s$/.test(text);
  return `${text}${needsSpace ? " " : ""}#${normalized} `;
}

export function pickSuggestedTags(allTags: string[], query: string, max = 8): string[] {
  const normalizedQuery = normalizeTagInput(query);
  const unique = Array.from(new Set(allTags.map(normalizeTagInput).filter(Boolean)));

  if (!normalizedQuery) return unique.slice(0, max);

  return unique
    .filter((tag) => tag.startsWith(normalizedQuery) && tag !== normalizedQuery)
    .slice(0, max);
}
