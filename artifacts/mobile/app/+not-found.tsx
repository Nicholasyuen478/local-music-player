import { Redirect } from "expo-router";
import { View, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

/**
 * Catches any unmatched route — including trackplayer://notification.click
 * from RNTP. Uses <Redirect> (synchronous, no timing issues) to go home.
 */
export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <Redirect href="/(tabs)/" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
