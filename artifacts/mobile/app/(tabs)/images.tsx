import { Feather, Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handlePickFiles = async () => {
    setIsAdding(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
        multiple: true,
        copyToCacheDirectory: true,
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
    Alert.alert("Remove Image", "Remove this image from the pool?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeImageFromPool(uri),
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundTertiary, Colors.dark.background]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Image Pool</Text>
          <Text style={styles.headerSub}>{imagePool.length} image{imagePool.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handlePickFolder}
            activeOpacity={0.7}
          >
            <Feather name="folder" size={18} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, isAdding && styles.addBtnDisabled]}
            onPress={handlePickFiles}
            activeOpacity={0.8}
            disabled={isAdding}
          >
            <LinearGradient
              colors={[Colors.dark.accent, Colors.dark.accentDark]}
              style={styles.addBtnGradient}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.hint}>
        Images are randomly assigned to songs as artwork. Long-press to remove.
      </Text>

      {imagePool.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient
            colors={[Colors.dark.surface, Colors.dark.surfaceSecondary]}
            style={styles.emptyIconBg}
          >
            <Feather name="image" size={40} color={Colors.dark.textTertiary} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No images yet</Text>
          <Text style={styles.emptySub}>
            Tap the + button to add images{"\n"}or pick a folder to auto-populate
          </Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity style={styles.emptyBtn} onPress={handlePickFiles} activeOpacity={0.8}>
              <LinearGradient
                colors={[Colors.dark.accent, Colors.dark.accentDark]}
                style={styles.emptyBtnGradient}
              >
                <Ionicons name="images" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.emptyBtnText}>Add Images</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyBtnOutline} onPress={handlePickFolder} activeOpacity={0.8}>
              <Feather name="folder-plus" size={18} color={Colors.dark.accent} style={{ marginRight: 8 }} />
              <Text style={styles.emptyBtnOutlineText}>Pick Folder</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={imagePool}
          keyExtractor={(item) => item}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: bottomInset + 100 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.thumb}
              onLongPress={() => handleRemove(item)}
              activeOpacity={0.85}
              delayLongPress={400}
            >
              <Image
                source={{ uri: item }}
                style={styles.thumbImg}
                contentFit="cover"
                transition={200}
              />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(item)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <View style={styles.removeBtnInner}>
                  <Ionicons name="close" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  addBtn: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnGradient: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 18,
  },
  grid: {
    paddingHorizontal: 12,
    gap: 6,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: 4,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
    position: "relative",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  removeBtnInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyIconBg: {
    width: 90,
    height: 90,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  emptySub: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyActions: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  emptyBtn: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  emptyBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    borderRadius: 14,
  },
  emptyBtnOutlineText: {
    color: Colors.dark.accent,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
