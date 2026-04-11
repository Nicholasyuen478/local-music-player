import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function NotificationClickScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Resuming your music...</Text>
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={() => {
          // Check if we can go back, otherwise fallback to home
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/');
          }
        }}
      >
        <Text style={styles.buttonText}>Go to Player</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#FF8C00",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#FF8C00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8, 
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
