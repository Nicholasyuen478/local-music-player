import { ScanSearch } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useLayout } from "@/hooks/useLayout";

type Props = {
  onScan: () => Promise<boolean>;
  isLoading: boolean;
};

export function SetupScreen({ onScan, isLoading }: Props) {
  const { topInset, controlsBottomPad } = useLayout();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topInset, paddingBottom: controlsBottomPad },
      ]}
    >
      <ScanSearch size={48} color={Colors.dark.textTertiary} />
      <Text style={styles.title}>Music Player</Text>

      <TouchableOpacity
        style={[styles.button, isLoading && { opacity: 0.5 }]}
        onPress={onScan}
        activeOpacity={0.7}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.dark.background} />
        ) : (
          <>
            <ScanSearch size={20} color={Colors.dark.background} />
            <Text style={styles.buttonText}>Scan device</Text>
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
