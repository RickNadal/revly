// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import React from "react";
import SlideInMenu from "../../components/SlideInMenu";
import AppTabBar from "../../components/navigation/AppTabBar";

export default function TabsLayout() {
  return (
    <>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />

        {/* ✅ Restored tab */}
        <Tabs.Screen name="communities" />

        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
      </Tabs>

      {/* IMPORTANT: render menu AFTER Tabs so it overlays everything */}
      <SlideInMenu />
    </>
  );
}