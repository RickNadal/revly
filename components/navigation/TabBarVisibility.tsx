import React, { createContext, useContext, useMemo, useState } from "react";

type TabBarVisibilityContextValue = {
  visible: boolean;
  show: () => void;
  hide: () => void;
  setVisible: (v: boolean) => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue | null>(null);

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);

  const value = useMemo<TabBarVisibilityContextValue>(
    () => ({
      visible,
      show: () => setVisible(true),
      hide: () => setVisible(false),
      setVisible,
    }),
    [visible]
  );

  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

export function useTabBarVisibility() {
  const ctx = useContext(TabBarVisibilityContext);
  if (!ctx) throw new Error("useTabBarVisibility must be used inside <TabBarVisibilityProvider>");
  return ctx;
}
