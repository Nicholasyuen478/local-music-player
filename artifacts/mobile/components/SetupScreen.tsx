import { Folder, Music2 } from "lucide-react-native";
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

export function SetupScreen({ onPickFolder, isLoading }: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 48 : insets.top;
  const bottomInset = Platform.OS === "web" ? 90 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <Music2 size={48} color={Colors.dark.textTertiary} />
      <Text style={styles.title}>Music Player</Text>

      <TouchableOpacity
        style={[styles.button, isLoading && { opacity: 0.5 }]}
        onPress={onPickFolder}
        activeOpacity={0.7}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.dark.background} />
        ) : (
          <>
            <Folder size={20} color={Colors.dark.background} />
            <Text style={styles.buttonText}>Choose music folder</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 32,
    gap: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textSecondary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.dark.text,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 4,
    marginTop: 8,
  },
  buttonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
