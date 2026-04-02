import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Crop, ImageIcon, Plus, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { CropModal } from "@/components/CropModal";
import { useLayout } from "@/hooks/useLayout";

const THUMB_SIZE = 110;
const COLUMNS = 3;

/** Returns true only for user-picked images (file://, content://, https://) */
function isUserPickedUri(uri: string): boolean {
  return (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  );
}

export default function ImagesScreen() {
  const { topInset, bottomInset, tabBarH } = useLayout();
  const {
    imagePool,
    addImagesToPool,
    removeImageFromPool,
    cropImageInPool,
  } = useMusicContext();

  const [isAdding, setIsAdding] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);

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

  const handleRemove = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove image?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeImageFromPool(uri),
      },
    ]);
  };

  const handleOpenCrop = useCallback((uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCropUri(uri);
  }, []);

  const handleCropSave = useCallback(
    async (croppedUri: string, originalUri: string) => {
      await cropImageInPool(originalUri, croppedUri);
      setCropUri(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [cropImageInPool],
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerCount}>
          {imagePool.length > 0 ? `${imagePool.length} images` : ""}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, isAdding && { opacity: 0.4 }]}
          onPress={handlePickFiles}
          activeOpacity={0.6}
          disabled={isAdding}
        >
          <Plus size={20} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
      </View>

      {imagePool.length === 0 ? (
        <View style={styles.emptyState}>
          <ImageIcon size={36} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No images</Text>
          <Text style={styles.emptyHint}>Tap + to add artwork images</Text>
        </View>
      ) : (
        <FlatList
          data={imagePool}
          keyExtractor={(item) => item}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: bottomInset + tabBarH + 16,
            gap: 4,
          }}
          columnWrapperStyle={{ gap: 4 }}
          renderItem={({ item }) => (
            <View style={styles.thumb}>
              <Image
                source={{ uri: item }}
                style={styles.thumbImg}
                contentFit="cover"
                transition={200}
              />
              {/* Crop button — bottom-left (hidden for default/bundled assets) */}
              {isUserPickedUri(item) && (
                <TouchableOpacity
                  style={[styles.overlayBtn, styles.cropBtn]}
                  onPress={() => handleOpenCrop(item)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={styles.overlayBtnInner}>
                    <Crop size={10} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
              {/* Remove button — top-right */}
              <TouchableOpacity
                style={[styles.overlayBtn, styles.removeBtn]}
                onPress={() => handleRemove(item)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View style={styles.overlayBtnInner}>
                  <X size={10} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <CropModal
        visible={cropUri !== null}
        uri={cropUri}
        onSave={handleCropSave}
        onClose={() => setCropUri(null)}
      />
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
  addBtn: {
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
  overlayBtn: { position: "absolute" },
  cropBtn: { bottom: 6, left: 6 },
  removeBtn: { top: 6, right: 6 },
  overlayBtnInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 80,
  },
  emptyText: {
    color: Colors.dark.textTertiary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  emptyHint: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
