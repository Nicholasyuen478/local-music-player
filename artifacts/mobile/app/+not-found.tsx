import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

/**
 * Catches any unmatched route — including trackplayer://notification.click
 * from RNTP. Renders a solid background (no flash) while navigating home.
 */
export default function NotFoundScreen() {
  useEffect(() => {
    // Navigate immediately — no visible transition
    router.replace("/(tabs)/");
  }, []);

  // Match the app background so there is zero visual flash
  return <View style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
