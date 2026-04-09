import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleProp, Text, TextStyle } from "react-native";

import { resolveMentionHandlesToUserIds, splitTextWithMentions } from "../lib/mentions";

type MentionTextProps = {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

const DEFAULT_MENTION_STYLE: TextStyle = {
  color: "#6FB3FF",
  fontWeight: "700",
};

export default function MentionText({ text, textStyle, mentionStyle, numberOfLines }: MentionTextProps) {
  const [mentionUserIdByHandle, setMentionUserIdByHandle] = useState<Record<string, string>>({});

  const segments = useMemo(() => splitTextWithMentions(text), [text]);

  useEffect(() => {
    let active = true;

    const handles = Array.from(new Set(segments.map((seg) => seg.handle).filter(Boolean) as string[]));
    if (handles.length === 0) {
      setMentionUserIdByHandle({});
      return;
    }

    (async () => {
      const resolved = await resolveMentionHandlesToUserIds(handles);
      if (!active) return;
      setMentionUserIdByHandle(resolved);
    })();

    return () => {
      active = false;
    };
  }, [segments]);

  return (
    <Text style={textStyle} numberOfLines={numberOfLines}>
      {segments.map((seg, idx) => {
        if (!seg.handle) return <React.Fragment key={`${idx}:${seg.text}`}>{seg.text}</React.Fragment>;

        const userId = mentionUserIdByHandle[seg.handle];
        if (!userId) {
          return (
            <Text key={`${idx}:${seg.text}`} style={[DEFAULT_MENTION_STYLE, mentionStyle]}>
              {seg.text}
            </Text>
          );
        }

        return (
          <Text
            key={`${idx}:${seg.text}`}
            style={[DEFAULT_MENTION_STYLE, mentionStyle]}
            onPress={() => router.push({ pathname: "/rider", params: { id: userId } })}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}
