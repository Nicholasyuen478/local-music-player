import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Platform,
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
  safAvailable: boolean;
};

export function SetupScreen({ onPickFolder, isLoading, safAvailable }: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <LinearGradient
      colors={[Colors.dark.background, Colors.dark.backgroundSecondary]}
      style={[styles.container, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}
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

      {safAvailable ? (
        <Text style={styles.subtitle}>
          Pick a specific folder on your device.{"\n"}Only files in that folder will be loaded.
        </Text>
      ) : (
        <Text style={styles.subtitle}>
          Browse to your music folder and select the files you want to play.{"\n"}You can add more songs later.
        </Text>
      )}

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
              <Feather
                name={safAvailable ? "folder" : "file-plus"}
                size={22}
                color="#fff"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.buttonText}>
                {safAvailable ? "Choose Music Folder" : "Select Music Files"}
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.tipBox}>
        <Feather name="info" size={14} color={Colors.dark.textTertiary} style={{ marginRight: 8, marginTop: 1 }} />
        <Text style={styles.tipText}>
          {safAvailable
            ? "Navigate to your music folder — all MP3, M4A, FLAC, AAC, OGG, WAV files inside will be loaded."
            : "In the file browser, navigate to your music folder then tap the files you want (or select all). Supports MP3, M4A, FLAC, AAC, OGG, WAV."}
        </Text>
      </View>
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
    marginBottom: 36,
  },
  button: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
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
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    width: "100%",
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textTertiary,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
