import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { ImageIcon, Library, Music } from "lucide-react-native";
import React from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
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
    backgroundColor: isIOS ? "transparent" : "rgba(8,8,8,0.97)",
    borderTopWidth: 0.5,
    borderTopColor: Colors.dark.borderLight,
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
            <BlurView intensity={90} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,8,8,0.97)" }]} />
          ),
        tabBarIconStyle: { marginTop: isCompact ? 1 : 4 },
      }}
    >
      {/* Library — left */}
      <Tabs.Screen
        name="library"
        options={{
          tabBarLabel: "Library",
          tabBarIcon: ({ color }) => <Library size={iconSize} color={color} />,
          tabBarStyle: tabBarBase,
        }}
      />

      {/* Player — centre hero button; tab bar hidden when this screen is active */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "",
          tabBarItemStyle: styles.centreItem,
          tabBarIconStyle: { marginTop: 0 },
          tabBarStyle: { display: "none" },
          tabBarButton: ({ onPress, onLongPress }) => {
            return (
              <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.centreBtn}
                android_ripple={null}
              >
                <View style={styles.centreBtnOrb}>
                  <Music size={28} color="#fff" fill="#fff" />
                </View>
              </Pressable>
            );
          },
        }}
      />

      {/* Artwork — right */}
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

const styles = StyleSheet.create({
  centreItem: {
    flex: 1.2,
    alignItems: "center",
    justifyContent: "center",
  },
  centreBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centreBtnOrb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FF8C00",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -15 }],
    shadowColor: "#FF8C00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
});
