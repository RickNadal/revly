/**
 * Story Creator Component
 * Allows users to create and post new stories
 */
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { createStory } from "../../lib/stories";
import { supabase } from "../../lib/supabase";

interface StoryCreatorProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const StoryCreator: React.FC<StoryCreatorProps> = ({
  visible,
  onClose,
  onSuccess,
  userId,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to create stories.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
      base64: true,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    setSelectedImage(picked.assets[0].uri);
  };

  const uploadStory = async () => {
    if (!selectedImage) {
      Alert.alert("Select an image", "Please choose an image for your story.");
      return;
    }

    try {
      setIsUploading(true);

      const uri = selectedImage;
      const clean = String(uri).split("?")[0].split("#")[0];
      const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      const path = `${userId}/stories/story-${Date.now()}.${ext}`;
      let base64 = "";

      try {
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      } catch {
        // If file system read fails, use the base64 from picker if available
        Alert.alert("Error", "Could not process image.");
        return;
      }

      if (!base64) {
        Alert.alert("Upload failed", "Could not read selected image.");
        return;
      }

      const uploadBody = base64ToBytes(base64);

      const { error: uploadErr } = await supabase.storage
        .from("post-images")
        .upload(path, uploadBody, {
          contentType: mime,
          upsert: true,
        });

      if (uploadErr) {
        Alert.alert("Upload failed", uploadErr.message);
        return;
      }

      const publicUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;

      const storyData = await createStory(userId, publicUrl, caption.trim() || undefined);

      if (!storyData) {
        Alert.alert("Failed to save story", "Please try again.");
        return;
      }

      Alert.alert("Story posted!", "Your story will be visible for 24 hours.");
      handleClose();
      onSuccess();
    } catch (error) {
      console.error("Story upload error:", error);
      Alert.alert("Error", String(error));
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setCaption("");
    onClose();
  };

  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    container: {
      flex: 1,
      backgroundColor: "#0B0B0F",
      paddingTop: 12,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#232334",
    },
    headerTitle: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "600",
    },
    closeButton: {
      padding: 8,
    },
    closeText: {
      color: "#A7A7B5",
      fontSize: 18,
      fontWeight: "500",
    },
    content: {
      flex: 1,
      padding: 16,
    },
    imageContainer: {
      width: "100%",
      aspectRatio: 9 / 16,
      backgroundColor: "#12121A",
      borderRadius: 12,
      borderWidth: 2,
      borderColor: "#232334",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
      overflow: "hidden",
    },
    imagePreview: {
      width: "100%",
      height: "100%",
    },
    placeholderText: {
      color: "#A7A7B5",
      fontSize: 14,
      textAlign: "center",
    },
    selectImageButton: {
      width: "100%",
      paddingVertical: 12,
      backgroundColor: "#FFFFFF",
      borderRadius: 8,
      alignItems: "center",
      marginBottom: 16,
    },
    selectImageButtonText: {
      color: "#0B0B0F",
      fontWeight: "600",
      fontSize: 14,
    },
    captionInput: {
      backgroundColor: "#12121A",
      borderWidth: 1,
      borderColor: "#2A2A3A",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: "#FFFFFF",
      marginBottom: 16,
      maxHeight: 80,
    },
    footer: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderTopColor: "#232334",
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#232334",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      color: "#A7A7B5",
      fontWeight: "600",
    },
    postButton: {
      flex: 1,
      paddingVertical: 12,
      backgroundColor: "#FFFFFF",
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    postButtonDisabled: {
      opacity: 0.6,
    },
    postButtonText: {
      color: "#0B0B0F",
      fontWeight: "600",
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.modal}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>New Story</Text>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Image Preview */}
            <View style={styles.imageContainer}>
              {selectedImage ? (
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
              ) : (
                <Text style={styles.placeholderText}>Tap below to select an image</Text>
              )}
            </View>

            {/* Select Image Button */}
            <Pressable
              style={styles.selectImageButton}
              onPress={pickImage}
              disabled={isUploading}
            >
              <Text style={styles.selectImageButtonText}>
                {selectedImage ? "Change Image" : "Select Image"}
              </Text>
            </Pressable>

            {/* Caption Input */}
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption (optional)"
              placeholderTextColor="#666"
              multiline
              maxLength={200}
              value={caption}
              onChangeText={setCaption}
              editable={!isUploading}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={isUploading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.postButton, !selectedImage || isUploading ? styles.postButtonDisabled : {}]}
              onPress={uploadStory}
              disabled={!selectedImage || isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#0B0B0F" />
              ) : (
                <Text style={styles.postButtonText}>Post Story</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
