import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type NotificationBadgeContextValue = {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
};

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | null>(null);

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCountState] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const setUnreadCount = useCallback((n: number) => {
    setUnreadCountState(Math.max(0, n));
  }, []);

  const refreshUnreadCount = useCallback(async (userId: string) => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    setUnreadCountState(Math.max(0, count ?? 0));
  }, []);

  useEffect(() => {
    let mounted = true;

    const subscribeForUser = async (userId: string | null) => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;

      if (!userId || !mounted) {
        if (mounted) setUnreadCountState(0);
        return;
      }

      await refreshUnreadCount(userId);

      const channel = supabase
        .channel(`notif-badge:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void refreshUnreadCount(userId);
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      await subscribeForUser(data.session?.user?.id ?? null);
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await subscribeForUser(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      authSub.subscription.unsubscribe();
    };
  }, [refreshUnreadCount]);

  const value = useMemo<NotificationBadgeContextValue>(
    () => ({ unreadCount, setUnreadCount }),
    [unreadCount, setUnreadCount]
  );

  return <NotificationBadgeContext.Provider value={value}>{children}</NotificationBadgeContext.Provider>;
}

export function useNotificationBadge() {
  const ctx = useContext(NotificationBadgeContext);
  if (!ctx) throw new Error("useNotificationBadge must be used inside <NotificationBadgeProvider>");
  return ctx;
}
