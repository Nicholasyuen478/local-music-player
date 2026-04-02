import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageIcon, Plus, Scissors, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ImageCropPicker from "react-native-image-crop-picker";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";

const THUMB_SIZE = 110;
const COLUMNS = 3;

/** Only user-picked images (not bundled assets) can be cropped */
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
  const { imagePool, addImagesToPool, removeImageFromPool, cropImageInPool } =
    useMusicContext();

  const [isAdding, setIsAdding] = useState(false);
  const [croppingUri, setCroppingUri] = useState<string | null>(null);

  // ── Add images ──────────────────────────────────────────────────────────
  const handlePickFiles = async () => {
    setIsAdding(true);
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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

  // ── Remove image ─────────────────────────────────────────────────────────
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

  // ── Crop image via react-native-image-crop-picker ───────────────────────
  // Uses the library's native crop UI — no custom canvas math needed.
  const handleCrop = useCallback(
    async (uri: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCroppingUri(uri);
      try {
        const result = await ImageCropPicker.openCropper({
          path: uri,
          width: 1000,
          height: 1000,
          cropping: true,
          mediaType: "photo",
          compressImageQuality: 0.92,
          // Keep the crop square (1:1 aspect ratio)
          freeStyleCropEnabled: false,
          // Android toolbar theming
          cropperToolbarTitle: "Crop image",
          cropperActiveWidgetColor: Colors.dark.accent,
          cropperStatusBarColor: "#000000",
          cropperToolbarColor: "#111111",
          cropperToolbarWidgetColor: "#FFFFFF",
        });
        const croppedUri = result.path;
        await cropImageInPool(uri, croppedUri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e: any) {
        // E_PICKER_CANCELLED = user dismissed — not an error
        if (e?.code !== "E_PICKER_CANCELLED") {
          console.error("crop error", e);
        }
      } finally {
        setCroppingUri(null);
      }
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
          renderItem={({ item }) => {
            const isCropping = croppingUri === item;
            const canCrop = isUserPickedUri(item);

            return (
              <View style={styles.thumb}>
                <Image
                  source={{ uri: item }}
                  style={styles.thumbImg}
                  contentFit="cover"
                  transition={200}
                />

                {/* Crop spinner overlay while this specific image is being cropped */}
                {isCropping && (
                  <View style={styles.spinnerOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}

                {/* Crop button — bottom-left, only for user-picked images */}
                {canCrop && !isCropping && (
                  <TouchableOpacity
                    style={[styles.overlayBtn, styles.cropBtn]}
                    onPress={() => handleCrop(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={styles.overlayBtnInner}>
                      <Scissors size={10} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Remove button — top-right */}
                <TouchableOpacity
                  style={[styles.overlayBtn, styles.removeBtn]}
                  onPress={() => handleRemove(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.overlayBtnInner}>
                    <X size={10} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
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
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayBtn: { position: "absolute" },
  cropBtn: { bottom: 6, left: 6 },
  removeBtn: { top: 6, right: 6 },
  overlayBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
