/**
 * Story Viewer Component
 * Displays stories in full-screen view with navigation between stories
 */
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    Modal,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View
} from "react-native";
import { Story, getStoryTimeRemaining, isStorySaved, markStoryAsViewed, saveStory, unsaveStory } from "../../lib/stories";

interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  userName: string;
  userAvatar: string;
  onClose: () => void;
  currentUserId: string;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export const StoryViewer: React.FC<StoryViewerProps> = ({
  stories,
  initialIndex = 0,
  userName = "Rider",
  userAvatar = "",
  onClose,
  currentUserId,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [timeRemaining, setTimeRemaining] = useState("");
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [isViewing, setIsViewing] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isSavingLoading, setIsSavingLoading] = useState(false);

  const currentStory = stories[currentIndex];

  // Update time remaining every second
  useEffect(() => {
    if (!currentStory) return;

    const updateTime = () => {
      setTimeRemaining(getStoryTimeRemaining(currentStory.expires_at));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [currentStory]);

  // Mark story as viewed
  useEffect(() => {
    if (!currentStory) return;

    const viewerId = currentUserId;
    if (!currentStory.viewed_by?.includes(viewerId)) {
      markStoryAsViewed(currentStory.id, viewerId);
    }
  }, [currentStory, currentUserId]);

  // Check if story is saved
  useEffect(() => {
    if (!currentStory) return;

    const checkIfSaved = async () => {
      const saved = await isStorySaved(currentStory.id, currentUserId);
      setIsSaved(saved);
    };

    checkIfSaved();
  }, [currentStory, currentUserId]);

  // Progress bar animation
  useEffect(() => {
    if (!isViewing) return;

    progressAnim.setValue(0);
    const animation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished && isViewing) {
        if (currentIndex < stories.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onClose();
        }
      }
    });

    return () => animation.stop();
  }, [currentIndex, isViewing, stories.length, progressAnim, onClose]);

  const handleNextStory = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePreviousStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handlePressIn = () => {
    setIsViewing(false);
    progressAnim.flattenOffset();
  };

  const handlePressOut = () => {
    setIsViewing(true);
    progressAnim.flattenOffset();
  };

  const handleToggleSave = async () => {
    if (!currentStory || isSavingLoading) return;

    setIsSavingLoading(true);
    try {
      if (isSaved) {
        const success = await unsaveStory(currentStory.id, currentUserId);
        if (success) {
          setIsSaved(false);
        }
      } else {
        const success = await saveStory(currentStory.id, currentUserId);
        if (success) {
          setIsSaved(true);
        }
      }
    } finally {
      setIsSavingLoading(false);
    }
  };

  if (!currentStory) {
    return null;
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    storyContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
    },
    image: {
      width: screenWidth,
      height: screenHeight,
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "space-between",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 8,
      backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    progressBars: {
      flexDirection: "row",
      marginBottom: 4,
      gap: 4,
    },
    progressBar: {
      flex: 1,
      height: 2,
      backgroundColor: "rgba(255, 255, 255, 0.3)",
      borderRadius: 1,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: "#fff",
      borderRadius: 1,
    },
    userInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    userAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "#333",
    },
    userName: {
      color: "#fff",
      fontWeight: "600",
      fontSize: 14,
      flex: 1,
    },
    timeText: {
      color: "rgba(255, 255, 255, 0.8)",
      fontSize: 12,
      marginLeft: "auto",
    },
    closeButton: {
      padding: 8,
    },
    closeText: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "300",
    },
    footer: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    caption: {
      color: "#fff",
      fontSize: 14,
      marginBottom: 8,
    },
    saveContainer: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.1)",
    },
    saveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    saveButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    saveButtonSaved: {
      backgroundColor: "rgba(255, 215, 0, 0.15)",
      borderColor: "rgba(255, 215, 0, 0.4)",
    },
    saveButtonSavedText: {
      color: "#FFD700",
    },
    touchAreas: {
      flexDirection: "row",
      position: "absolute",
      top: 0,
      bottom: 70,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    touchLeft: {
      flex: 1,
    },
    touchRight: {
      flex: 1,
    },
    saveWrapper: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
    },
  });

  return (
    <Modal visible={true} animationType="fade" statusBarTranslucent transparent={false}>
      <SafeAreaView style={styles.container}>
      <View style={styles.storyContent}>
        <Image source={{ uri: currentStory.image_url }} style={styles.image} resizeMode="cover" />

        <View style={styles.overlay}>
          {/* Header with progress, user info */}
          <View>
            <View style={styles.progressBars}>
              {stories.map((_, index) => (
                <View key={index} style={styles.progressBar}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      index < currentIndex
                        ? { width: "100%" }
                        : index === currentIndex
                          ? { width: progressWidth }
                          : { width: "0%" },
                    ]}
                  />
                </View>
              ))}
            </View>

            <View style={styles.header}>
              <View style={styles.userInfo}>
                <Image source={{ uri: userAvatar }} style={styles.userAvatar} resizeMode="cover" />
                <Text style={styles.userName}>{userName}</Text>
              </View>
              <Text style={styles.timeText}>{timeRemaining}</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
          </View>

          {/* Caption and Save */}
          {currentStory.caption && (
            <View style={styles.footer}>
              <Text style={styles.caption}>{currentStory.caption}</Text>
            </View>
          )}

        </View>

        {/* Touch areas for navigation — bottom is 70 to leave save button exposed */}
        <View style={styles.touchAreas}>
          <Pressable
            style={styles.touchLeft}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePreviousStory}
          />
          <Pressable
            style={styles.touchRight}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handleNextStory}
          />
        </View>

        {/* Save Button — above touch areas via zIndex 20 */}
        <View style={styles.saveWrapper}>
          <View style={styles.saveContainer}>
            <Pressable
              style={[styles.saveButton, isSaved && styles.saveButtonSaved]}
              onPress={handleToggleSave}
              disabled={isSavingLoading}
            >
              {isSavingLoading ? (
                <ActivityIndicator color={isSaved ? "#FFD700" : "#fff"} />
              ) : (
                <>
                  <Text>{isSaved ? "✓" : "💾"}</Text>
                  <Text style={[styles.saveButtonText, isSaved && styles.saveButtonSavedText]}>
                    {isSaved ? "Saved" : "Save Story"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
    </Modal>
  );
};
