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
  useWindowDimensions,
  View,
} from "react-native";
import ImageCropPicker from "react-native-image-crop-picker";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";

const COLUMNS = 3;
const GAP = 6;

function isUserPickedUri(uri: string): boolean {
  return (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  );
}

export default function ImagesScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const { width } = useWindowDimensions();
  const { imagePool, addImagesToPool, removeImageFromPool, cropImageInPool } =
    useMusicContext();

  const thumbSize = Math.floor((width - GAP * (COLUMNS + 1)) / COLUMNS);

  const [isAdding, setIsAdding] = useState(false);
  const [croppingUri, setCroppingUri] = useState<string | null>(null);

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
    } catch (e) { console.error("pick error", e); }
    finally { setIsAdding(false); }
  };

  const handleRemove = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove image?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeImageFromPool(uri) },
    ]);
  };

  const handleCrop = useCallback(async (uri: string) => {
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
        freeStyleCropEnabled: false,
        cropperToolbarTitle: "Crop image",
        cropperActiveWidgetColor: Colors.dark.accent,
        cropperStatusBarColor: "#000000",
        cropperToolbarColor: "#111111",
        cropperToolbarWidgetColor: "#FFFFFF",
      });
      await cropImageInPool(uri, result.path);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      if (e?.code !== "E_PICKER_CANCELLED") console.error("crop error", e);
    } finally { setCroppingUri(null); }
  }, [cropImageInPool]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* Header */}
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Text style={styles.headerCount}>
          {imagePool.length > 0 ? `${imagePool.length} images` : "Artwork pool"}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, isAdding && styles.addBtnLoading]}
          onPress={handlePickFiles}
          activeOpacity={0.7}
          disabled={isAdding}
          hitSlop={8}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color={Colors.dark.accent} />
          ) : (
            <Plus size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {imagePool.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <ImageIcon size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.emptyText}>No artwork yet</Text>
          <Text style={styles.emptyHint}>
            Tap the + button to add images from your gallery
          </Text>
        </View>
      ) : (
        <FlatList
          data={imagePool}
          keyExtractor={(item) => item}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: GAP,
            paddingBottom: bottomInset + tabBarH + 16,
            gap: GAP,
          }}
          columnWrapperStyle={{ gap: GAP }}
          renderItem={({ item }) => {
            const isCropping = croppingUri === item;
            const canCrop = isUserPickedUri(item);

            return (
              <View style={[styles.thumb, { width: thumbSize, height: thumbSize }]}>
                <Image
                  source={{ uri: item }}
                  style={styles.thumbImg}
                  contentFit="cover"
                  transition={200}
                />

                {isCropping && (
                  <View style={styles.spinnerOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}

                {canCrop && !isCropping && (
                  <TouchableOpacity
                    style={[styles.overlayBtn, styles.cropBtn]}
                    onPress={() => handleCrop(item)}
                    hitSlop={10}
                  >
                    <View style={styles.overlayBtnInner}>
                      <Scissors size={11} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.overlayBtn, styles.removeBtn]}
                  onPress={() => handleRemove(item)}
                  hitSlop={10}
                >
                  <View style={styles.overlayBtnInner}>
                    <X size={11} color="#fff" />
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
    paddingBottom: 14,
  },
  headerCompact: { paddingTop: 4, paddingBottom: 10 },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnLoading: { opacity: 0.5 },

  thumb: {
    borderRadius: 10,
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
  cropBtn: { bottom: 7, left: 7 },
  removeBtn: { top: 7, right: 7 },
  overlayBtnInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.accentDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  emptyHint: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
