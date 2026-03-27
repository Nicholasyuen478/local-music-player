import { LinearGradient } from "expo-linear-gradient";
import { FilePlus, Folder, Music2 } from "lucide-react-native";
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

type StepProps = { num: string; text: string };
function Step({ num, text }: StepProps) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{num}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

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
          <Music2 size={52} color="#fff" />
        </LinearGradient>
      </View>

      <Text style={styles.title}>Music Player</Text>
      <Text style={styles.subtitle}>
        {safAvailable
          ? "Tap below to choose a music folder — all songs inside will be loaded automatically."
          : "Tap below to open your file browser and select your music files."}
      </Text>

      {!safAvailable && (
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How to load your music folder:</Text>
          <Step num="1" text="Tap the button below to open the file browser" />
          <Step num="2" text='Navigate to your music folder (e.g. "Music" or "Downloads")' />
          <Step num="3" text="Long-press any file to enter selection mode" />
          <Step num="4" text='Tap ⋮ → "Select all" to select every file in the folder' />
          <Step num="5" text='Tap "Open" — all songs load automatically' />
        </View>
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
              {safAvailable
                ? <Folder size={22} color="#fff" style={{ marginRight: 10 }} />
                : <FilePlus size={22} color="#fff" style={{ marginRight: 10 }} />
              }
              <Text style={styles.buttonText}>
                {safAvailable ? "Choose Music Folder" : "Open File Browser"}
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.hint}>Supports MP3, M4A, AAC, FLAC, OGG, WAV, Opus, WMA</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  iconWrapper: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 96,
    height: 96,
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
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  stepsCard: {
    width: "100%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 10,
  },
  stepsTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  stepNum: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  button: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
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
    fontSize: 12,
    color: Colors.dark.textTertiary,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
