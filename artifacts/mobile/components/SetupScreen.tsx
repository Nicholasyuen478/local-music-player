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
      <View style={styles.iconRing}>
        <ScanSearch size={36} color={Colors.dark.accent} />
      </View>

      <View style={styles.textBlock}>
        <Text style={styles.title}>Music Player</Text>
        <Text style={styles.subtitle}>Scan your device to get started</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonLoading]}
        onPress={onScan}
        activeOpacity={0.8}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <ScanSearch size={20} color="#fff" />
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
    paddingHorizontal: 40,
    gap: 20,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.dark.accentDim,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(232,112,42,0.3)",
  },
  textBlock: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textTertiary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 50,
    marginTop: 12,
    minWidth: 200,
  },
  buttonLoading: { opacity: 0.6 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
