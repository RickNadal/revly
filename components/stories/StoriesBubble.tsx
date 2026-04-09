/**
 * Stories Bubble Component
 * Displays user stories as interactive bubbles (like Instagram stories)
 */
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";
import { getUserActiveStories, getUsersWithActiveStories, StoryUser } from "../../lib/stories";
import { StoryRing } from "./StoryRing";

interface StoriesBubbleProps {
  onStoryPress: (stories: any[], userIndex: number, userName: string, userAvatar: string) => void;
  showAddStoryButton?: boolean;
  onAddStoryPress?: () => void;
}

export const StoriesBubble: React.FC<StoriesBubbleProps> = ({
  onStoryPress,
  showAddStoryButton = true,
  onAddStoryPress,
}) => {
  const [users, setUsers] = useState<StoryUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsersWithStories();

    // Refresh every 30 seconds
    const interval = setInterval(loadUsersWithStories, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadUsersWithStories = async () => {
    try {
      const usersWithStories = await getUsersWithActiveStories();
      setUsers(usersWithStories);
    } catch (error) {
      console.error("Failed to load users with stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserPress = async (user: StoryUser) => {
    const stories = await getUserActiveStories(user.id);
    if (stories.length > 0) {
      onStoryPress(stories, 0, user.full_name, user.avatar_url);
    }
  };

  const styles = StyleSheet.create({
    container: {
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    scrollContainer: {
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    bubble: {
      marginHorizontal: 6,
      alignItems: "center",
      gap: 6,
    },
    bubbleButton: {
      justifyContent: "center",
      alignItems: "center",
    },
    userName: {
      color: "#FFFFFF",
      fontSize: 12,
      textAlign: "center",
      maxWidth: 80,
    },
    loadingContainer: {
      height: 120,
      justifyContent: "center",
      alignItems: "center",
    },
    addStoryButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "#12121A",
      borderWidth: 2,
      borderColor: "#232334",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 6,
    },
    addStoryText: {
      color: "#A7A7B5",
      fontSize: 24,
      fontWeight: "300",
    },
    addStoryLabel: {
      color: "#A7A7B5",
      fontSize: 12,
      textAlign: "center",
      maxWidth: 80,
    },
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
      style={styles.container}
    >
      {/* Add Story Button */}
      {showAddStoryButton && (
        <Pressable
          style={styles.bubble}
          onPress={onAddStoryPress}
        >
          <Pressable style={styles.addStoryButton}>
            <Text style={styles.addStoryText}>+</Text>
          </Pressable>
          <Text style={styles.addStoryLabel}>Your Story</Text>
        </Pressable>
      )}

      {/* Story Bubbles */}
      {users.length > 0 ? (
        users.map((user) => (
          <Pressable
            key={user.id}
            style={styles.bubble}
            onPress={() => handleUserPress(user)}
          >
            <Pressable style={styles.bubbleButton}>
              <StoryRing
                hasStories={user.has_stories}
                avatarUrl={user.avatar_url}
                size={80}
                borderWidth={3}
              />
            </Pressable>
            <Text style={styles.userName} numberOfLines={2}>
              {user.full_name}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: "#A7A7B5", marginLeft: 12 }}>No stories yet</Text>
      )}
    </ScrollView>
  );
};
