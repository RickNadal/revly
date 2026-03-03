import React, { createContext, useContext, useMemo, useState } from "react";

type MenuContextValue = {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<MenuContextValue>(
    () => ({
      isOpen,
      openMenu: () => setIsOpen(true),
      closeMenu: () => setIsOpen(false),
      toggleMenu: () => setIsOpen((p) => !p),
    }),
    [isOpen]
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used inside <MenuProvider>");
  return ctx;
}
