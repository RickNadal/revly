/**
 * Saved Stories Component
 * Displays user's saved stories in a horizontal scrollable list
 */
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { getUserSavedStories, Story } from "../../lib/stories";

interface SavedStoriesProps {
  userId: string;
  onStoryPress: (stories: (Story & { saved_at: string })[], storyIndex: number) => void;
}

export const SavedStories: React.FC<SavedStoriesProps> = ({ userId, onStoryPress }) => {
  const [savedStories, setSavedStories] = useState<(Story & { saved_at: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSavedStories();

    // Refresh every 30 seconds
    const interval = setInterval(loadSavedStories, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const loadSavedStories = async () => {
    try {
      const stories = await getUserSavedStories(userId);
      setSavedStories(stories);
    } catch (error) {
      console.error("Failed to load saved stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: "#0B0B0F",
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: "#232334",
    },
    header: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    headerText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "600",
    },
    scrollContainer: {
      paddingHorizontal: 12,
    },
    storyItem: {
      marginHorizontal: 6,
      alignItems: "center",
      gap: 6,
    },
    storyThumbnail: {
      width: 70,
      height: 105,
      borderRadius: 8,
      backgroundColor: "#12121A",
      borderWidth: 1,
      borderColor: "#232334",
      overflow: "hidden",
    },
    storyImage: {
      width: "100%",
      height: "100%",
    },
    storyCaption: {
      color: "#A7A7B5",
      fontSize: 11,
      maxWidth: 70,
      textAlign: "center",
    },
    emptyMessage: {
      paddingHorizontal: 16,
      color: "#A7A7B5",
      fontSize: 12,
      fontStyle: "italic",
    },
    loadingContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      justifyContent: "center",
      alignItems: "center",
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Saved Stories</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      </View>
    );
  }

  if (savedStories.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Saved Stories</Text>
        </View>
        <Text style={styles.emptyMessage}>No saved stories yet. Start saving! 💾</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Saved Stories ({savedStories.length})</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {savedStories.map((story, index) => (
          <Pressable
            key={story.id}
            style={styles.storyItem}
            onPress={() => onStoryPress(savedStories, index)}
          >
            <View style={styles.storyThumbnail}>
              <Image source={{ uri: story.image_url }} style={styles.storyImage} resizeMode="cover" />
            </View>
            {story.caption && <Text style={styles.storyCaption} numberOfLines={1}>{story.caption}</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
