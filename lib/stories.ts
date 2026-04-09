/**
 * Story types and service for 24-hour stories
 */
import { supabase } from "./supabase";

export interface Story {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
  viewed_by: string[];
}

export interface StoryUser {
  id: string;
  full_name: string;
  avatar_url: string;
  has_stories: boolean;
  stories_count: number;
  latest_story_created_at: string | null;
}

// Check if a story is expired
export const isStoryExpired = (expiresAt: string): boolean => {
  return new Date(expiresAt) <= new Date();
};

// Format remaining time for a story
export const getStoryTimeRemaining = (expiresAt: string): string => {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// Get active stories for a user
export const getUserActiveStories = async (userId: string): Promise<Story[]> => {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch user stories:", error);
    return [];
  }

  return data || [];
};

// Get all users with active stories
export const getUsersWithActiveStories = async (): Promise<StoryUser[]> => {
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("user_id, created_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (storiesError) {
    console.error("Failed to fetch stories:", storiesError);
    return [];
  }

  // Group stories by user
  const userStories: Record<string, { count: number; latestCreated: string }> = {};
  const storyUserIds = new Set<string>();

  stories?.forEach((story) => {
    storyUserIds.add(story.user_id);
    if (!userStories[story.user_id]) {
      userStories[story.user_id] = { count: 0, latestCreated: story.created_at };
    }
    userStories[story.user_id].count++;
  });

  if (storyUserIds.size === 0) return [];

  // Get profile data for users with stories
  const userIds = Array.from(storyUserIds);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", userIds);

  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError);
    return [];
  }

  return (profiles || []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name || "Rider",
    avatar_url: profile.avatar_url || "",
    has_stories: true,
    stories_count: userStories[profile.id]?.count || 0,
    latest_story_created_at: userStories[profile.id]?.latestCreated || null,
  }));
};

// Create a new story
export const createStory = async (userId: string, imageUrl: string, caption?: string): Promise<Story | null> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

  const { data, error } = await supabase
    .from("stories")
    .insert([
      {
        user_id: userId,
        image_url: imageUrl,
        caption: caption || null,
        expires_at: expiresAt.toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Failed to create story:", error);
    return null;
  }

  return data;
};

// Mark story as viewed by user
export const markStoryAsViewed = async (storyId: string, viewerId: string): Promise<boolean> => {
  const { data, error: fetchError } = await supabase
    .from("stories")
    .select("viewed_by")
    .eq("id", storyId)
    .single();

  if (fetchError) {
    console.error("Failed to fetch story:", fetchError);
    return false;
  }

  const viewedBy = Array.isArray(data?.viewed_by) ? data.viewed_by : [];
  if (!viewedBy.includes(viewerId)) {
    viewedBy.push(viewerId);
  }

  const { error: updateError } = await supabase
    .from("stories")
    .update({ viewed_by: viewedBy })
    .eq("id", storyId);

  if (updateError) {
    console.error("Failed to mark story as viewed:", updateError);
    return false;
  }

  return true;
};

// Delete a story
export const deleteStory = async (storyId: string): Promise<boolean> => {
  const { error } = await supabase.from("stories").delete().eq("id", storyId);

  if (error) {
    console.error("Failed to delete story:", error);
    return false;
  }

  return true;
};

// Delete expired stories (cleanup job)
export const deleteExpiredStories = async (): Promise<number> => {
  const { data, error } = await supabase
    .from("stories")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select();

  if (error) {
    console.error("Failed to delete expired stories:", error);
    return 0;
  }

  return data?.length || 0;
};

// Check if story is saved by user
export const isStorySaved = async (storyId: string, userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from("saved_stories")
    .select("id")
    .eq("story_id", storyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to check if story is saved:", error);
    return false;
  }

  return !!data;
};

// Get user's saved stories
export const getUserSavedStories = async (userId: string): Promise<(Story & { saved_at: string })[]> => {
  const { data: savedStories, error: savedError } = await supabase
    .from("saved_stories")
    .select("story_id, saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (savedError) {
    console.error("Failed to fetch saved stories:", savedError);
    return [];
  }

  if (!savedStories || savedStories.length === 0) return [];

  const storyIds = savedStories.map((s) => s.story_id);
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("*")
    .in("id", storyIds);

  if (storiesError) {
    console.error("Failed to fetch story details:", storiesError);
    return [];
  }

  // Map saved_at to stories
  const savedMap = new Map(savedStories.map((s) => [s.story_id, s.saved_at]));

  return (stories || []).map((story) => ({
    ...story,
    saved_at: savedMap.get(story.id) || new Date().toISOString(),
  }));
};

// Save a story
export const saveStory = async (storyId: string, userId: string): Promise<boolean> => {
  const { error } = await supabase.from("saved_stories").insert([
    {
      user_id: userId,
      story_id: storyId,
    },
  ]);

  if (error) {
    console.error("Failed to save story:", error);
    return false;
  }

  return true;
};

// Unsave a story
export const unsaveStory = async (storyId: string, userId: string): Promise<boolean> => {
  const { error } = await supabase
    .from("saved_stories")
    .delete()
    .eq("story_id", storyId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to unsave story:", error);
    return false;
  }

  return true;
};
