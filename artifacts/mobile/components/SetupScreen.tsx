import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

type Props = {
  onPickFolder: () => Promise<boolean>;
  isLoading: boolean;
};

export function SetupScreen({ onPickFolder, isLoading }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[Colors.dark.background, Colors.dark.backgroundSecondary]}
      style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.iconWrapper}>
        <LinearGradient
          colors={[Colors.dark.accent, Colors.dark.accentDark]}
          style={styles.iconGradient}
        >
          <Ionicons name="musical-notes" size={52} color="#fff" />
        </LinearGradient>
      </View>

      <Text style={styles.title}>Music Player</Text>
      <Text style={styles.subtitle}>
        Grant access to your music library to get started.{"\n"}We'll remember your choice.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={onPickFolder}
        activeOpacity={0.8}
        disabled={isLoading}
      >
        <LinearGradient
          colors={[Colors.dark.accent, Colors.dark.accentDark]}
          style={styles.buttonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="musical-notes" size={22} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.buttonText}>Load My Music</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Scans your device for MP3, M4A, AAC, FLAC, OGG, WAV files
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrapper: {
    marginBottom: 32,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 40,
  },
  button: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  hint: {
    fontSize: 13,
    color: Colors.dark.textTertiary,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
