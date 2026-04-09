import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { ImageIcon, Library, Music2 } from "lucide-react-native";
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
    backgroundColor: isIOS ? "transparent" : "rgba(10,10,18,0.97)",
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,18,0.97)" }]} />
          ),
        tabBarIconStyle: { marginTop: isCompact ? 2 : 6 },
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
          tabBarButton: ({ onPress, onLongPress, accessibilityState }) => {
            const active = accessibilityState?.selected ?? false;
            return (
              <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.centreBtn}
                android_ripple={null}
              >
                <View style={[styles.centreBtnOrb, active && styles.centreBtnOrbActive]}>
                  <Music2 size={isCompact ? 24 : 26} color="#fff" />
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
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(232,112,42,0.30)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(232,112,42,0.45)",
    shadowColor: "#E8702A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  centreBtnOrbActive: {
    backgroundColor: "#E8702A",
    borderColor: "#F0913E",
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 12,
  },
});
