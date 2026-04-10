import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ChevronLeft, ImageIcon, Plus, Scissors, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
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

// ── Per-thumbnail: retry on transient load errors ────────────────────────────
interface ThumbImgProps {
  uri: string;
  size: number;
}

function ThumbImg({ uri, size }: ThumbImgProps) {
  const [failed,  setFailed]  = useState(false);
  const [imgKey,  setImgKey]  = useState(0);
  const retryRef = useRef(0);

  // Resume from background → reset failure so images retry
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && failed) {
        retryRef.current = 0;
        setFailed(false);
        setImgKey((k) => k + 1);
      }
    });
    return () => sub.remove();
  }, [failed]);

  const handleError = useCallback(() => {
    if (retryRef.current < 1) {
      retryRef.current += 1;
      setTimeout(() => setImgKey((k) => k + 1), 1500);
    } else {
      setFailed(true);
    }
  }, []);

  if (failed) {
    return (
      <View style={[styles.failedThumb, { width: size, height: size }]}>
        <ImageIcon size={size * 0.28} color={Colors.dark.textTertiary} />
        <Text style={styles.failedText}>Not found</Text>
      </View>
    );
  }

  return (
    <Image
      key={imgKey}
      source={{ uri }}
      style={styles.thumbImg}
      contentFit="cover"
      transition={180}
      recyclingKey={`${uri}-${imgKey}`}
      onError={handleError}
    />
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function ImagesScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const { width } = useWindowDimensions();
  const {
    imagePool,
    pickImageFolder,
    removeImageFromPool,
    cropImageInPool,
  } = useMusicContext();

  const thumbSize = Math.floor((width - GAP * (COLUMNS + 1)) / COLUMNS);

  const [isAdding,    setIsAdding]    = useState(false);
  const [croppingUri, setCroppingUri] = useState<string | null>(null);

  // Hardware back → return to previous screen
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.navigate("/(tabs)");
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // ── Add images — copies to permanent storage, shows latest as current art ─
  const handlePickFiles = async () => {
    setIsAdding(true);
    try {
      const added = await pickImageFolder();
      if (added) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("pick error", e);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Remove a single image from the vault ────────────────────────────────
  const handleRemove = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove image?", "This removes it from your artwork vault.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeImageFromPool(uri),
      },
    ]);
  };

  // ── Crop a user-picked image ─────────────────────────────────────────────
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
        cropperToolbarTitle: "Crop artwork",
        cropperActiveWidgetColor: Colors.dark.accent,
        cropperStatusBarColor: "#000000",
        cropperToolbarColor: "#111111",
        cropperToolbarWidgetColor: "#FFFFFF",
      });
      await cropImageInPool(uri, result.path);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      if (e?.code !== "E_PICKER_CANCELLED") console.error("crop error", e);
    } finally {
      setCroppingUri(null);
    }
  }, [cropImageInPool]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Header ── */}
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <TouchableOpacity
          onPress={() => router.navigate("/(tabs)")}
          style={styles.iconCircle}
          hitSlop={10}
        >
          <ChevronLeft size={isCompact ? 18 : 20} color={Colors.dark.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.headerCount}>
          {imagePool.length > 0 ? `${imagePool.length} images` : "Artwork vault"}
        </Text>

        {/* Spacer to keep title centred */}
        <View style={styles.iconCircle} />
      </View>

      {/* ── Grid or empty state ── */}
      {imagePool.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <ImageIcon size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.emptyText}>No artwork yet</Text>
          <Text style={styles.emptyHint}>Tap + to add images from your gallery</Text>
        </View>
      ) : (
        <FlatList
          data={imagePool}
          keyExtractor={(item) => item}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: GAP,
            paddingBottom: bottomInset + tabBarH + 100,
            gap: GAP,
          }}
          columnWrapperStyle={{ gap: GAP }}
          renderItem={({ item }) => {
            const isCropping = croppingUri === item;
            const canCrop    = isUserPickedUri(item);

            return (
              <View style={[styles.thumb, { width: thumbSize, height: thumbSize }]}>

                <ThumbImg uri={item} size={thumbSize} />

                {/* Cropping spinner overlay */}
                {isCropping && (
                  <View style={styles.spinnerOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}

                {/* Crop — bottom-left, only for user-picked images */}
                {canCrop && !isCropping && (
                  <TouchableOpacity
                    style={[styles.overlayBtn, styles.cropBtnPos]}
                    onPress={() => handleCrop(item)}
                    hitSlop={10}
                  >
                    <View style={styles.overlayBtnInner}>
                      <Scissors size={11} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Remove — top-right */}
                <TouchableOpacity
                  style={[styles.overlayBtn, styles.removeBtnPos]}
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

      {/* ── Floating Action Button ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: bottomInset + tabBarH + 20 }]}
        onPress={handlePickFiles}
        disabled={isAdding}
        activeOpacity={0.82}
      >
        {isAdding
          ? <ActivityIndicator size="small" color="#fff" />
          : <Plus size={26} color="#fff" strokeWidth={2.5} />
        }
      </TouchableOpacity>

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

  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  thumb: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
    position: "relative",
  },
  thumbImg: { width: "100%", height: "100%" },

  failedThumb: {
    backgroundColor: Colors.dark.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  failedText: {
    color: Colors.dark.textTertiary,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },

  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  overlayBtn: { position: "absolute" },
  cropBtnPos:   { bottom: 7, left: 7 },
  removeBtnPos: { top: 7, right: 7 },
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

  fab: {
    position: "absolute",
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
});
