import { Tabs } from "expo-router";
import { ImageIcon, Music2 } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.dark.accent,
        tabBarInactiveTintColor: Colors.dark.textTertiary,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.dark.backgroundSecondary,
          borderTopWidth: 1,
          borderTopColor: Colors.dark.border,
          elevation: 0,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.backgroundSecondary }]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Player",
          tabBarIcon: ({ color }) => <Music2 size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="images"
        options={{
          title: "Images",
          tabBarIcon: ({ color }) => <ImageIcon size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
