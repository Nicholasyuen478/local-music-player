import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { FolderOpen, ImageIcon, Plus, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";

const THUMB_SIZE = 110;
const COLUMNS = 3;

export default function ImagesScreen() {
  const insets = useSafeAreaInsets();
  const { imagePool, addImagesToPool, removeImageFromPool, pickImageFolder } = useMusicContext();
  const [isAdding, setIsAdding] = useState(false);

  const topInset = Platform.OS === "web" ? 48 : insets.top;
  const bottomInset = Platform.OS === "web" ? 90 : insets.bottom;

  const handlePickFiles = async () => {
    setIsAdding(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 1,
        exif: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uris = result.assets.map((a) => a.uri);
        await addImagesToPool(uris);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("pick error", e);
    } finally {
      setIsAdding(false);
    }
  };

  const handlePickFolder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await pickImageFolder();
  };

  const handleRemove = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove image?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeImageFromPool(uri) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerCount}>
          {imagePool.length > 0 ? `${imagePool.length} images` : ""}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={handlePickFolder} activeOpacity={0.6}>
            <FolderOpen size={20} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, isAdding && { opacity: 0.4 }]}
            onPress={handlePickFiles}
            activeOpacity={0.6}
            disabled={isAdding}
          >
            <Plus size={20} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {imagePool.length === 0 ? (
        <View style={styles.emptyState}>
          <ImageIcon size={36} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No images</Text>
        </View>
      ) : (
        <FlatList
          data={imagePool}
          keyExtractor={(item) => item}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: bottomInset + 16, gap: 4 }}
          columnWrapperStyle={{ gap: 4 }}
          renderItem={({ item }) => (
            <View style={styles.thumb}>
              <Image
                source={{ uri: item }}
                style={styles.thumbImg}
                contentFit="cover"
                transition={200}
              />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(item)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View style={styles.removeBtnInner}>
                  <X size={10} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
    position: "relative",
  },
  thumbImg: { width: "100%", height: "100%" },
  removeBtn: { position: "absolute", top: 6, right: 6 },
  removeBtnInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
  },
  emptyText: {
    color: Colors.dark.textTertiary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
