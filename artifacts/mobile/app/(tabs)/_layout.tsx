import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { ImageIcon, Library } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Colors from "@/constants/colors";
import { TAB_BAR_H_COMPACT, TAB_BAR_H_NORMAL } from "@/hooks/useLayout";

export default function TabLayout() {
  const { height } = useWindowDimensions();
  const isCompact = height < 700;
  const tabBarHeight = isCompact ? TAB_BAR_H_COMPACT : TAB_BAR_H_NORMAL;
  const isIOS = Platform.OS === "ios";
  const iconSize = isCompact ? 21 : 23;

  const tabBarBase = {
    position: "absolute" as const,
    backgroundColor: isIOS ? "transparent" : "rgba(10,10,18,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
    elevation: 0,
    height: tabBarHeight,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: !isCompact,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
          marginBottom: 4,
          letterSpacing: 0.2,
        },
        tabBarActiveTintColor: Colors.dark.text,
        tabBarInactiveTintColor: Colors.dark.textTertiary,
        tabBarStyle: tabBarBase,
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,18,0.96)" }]} />
          ),
        tabBarIconStyle: { marginTop: isCompact ? 2 : 6 },
      }}
    >
      {/* Player — immersive full-screen, NO tab bar, NOT shown in the tab row */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none", width: 0, overflow: "hidden" },
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          tabBarLabel: "Library",
          tabBarIcon: ({ color }) => <Library size={iconSize} color={color} />,
          tabBarStyle: tabBarBase,
        }}
      />

      <Tabs.Screen
        name="images"
        options={{
          tabBarLabel: "Artwork",
          tabBarIcon: ({ color }) => <ImageIcon size={iconSize} color={color} />,
          tabBarStyle: tabBarBase,
        }}
      />
    </Tabs>
  );
}
