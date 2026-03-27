import { Tabs } from "expo-router";
import { ImageIcon, Library, Music2 } from "lucide-react-native";
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
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.dark.text,
        tabBarInactiveTintColor: Colors.dark.textTertiary,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.dark.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.dark.border,
          elevation: 0,
          height: 52,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.background }]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => <Music2 size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarIcon: ({ color }) => <Library size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="images"
        options={{
          tabBarIcon: ({ color }) => <ImageIcon size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
