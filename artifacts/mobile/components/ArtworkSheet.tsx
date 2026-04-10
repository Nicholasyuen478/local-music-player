import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import {
  ImagePlus,
  LayoutGrid,
  Shuffle as DiceIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";

const THUMB = 72;
const DISMISS_VELOCITY = 600;
const DISMISS_DISTANCE = 160;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ArtworkSheet({ visible, onClose }: Props) {
  const { bottomInset } = useLayout();
  const {
    imagePool,
    currentSong,
    reRollArtwork,
    assignArtwork,
    pickImageFolder,
  } = useMusicContext();

  // ── Slide animation ────────────────────────────────────────────────────────
  const slideY = useRef(new Animated.Value(600)).current;
  const [uploading, setUploading] = React.useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, {
        toValue: 0,
        speed: 18,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    } else {
      slideY.setValue(600);
    }
  }, [visible, slideY]);

  const dismiss = useCallback(() => {
    Animated.timing(slideY, {
      toValue: 600,
      duration: 240,
      useNativeDriver: true,
    }).start(onClose);
  }, [slideY, onClose]);

  // ── Drag to dismiss ────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 8,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) slideY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY) {
          Animated.timing(slideY, { toValue: 600, duration: 220, useNativeDriver: true })
            .start(onClose);
        } else {
          Animated.spring(slideY, { toValue: 0, speed: 18, bounciness: 2, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleReRoll = useCallback(() => {
    if (!imagePool.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    reRollArtwork();
    dismiss();
  }, [imagePool.length, reRollArtwork, dismiss]);

  const handleChoose = useCallback((uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    assignArtwork(uri);
    dismiss();
  }, [assignArtwork, dismiss]);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    try {
      const added = await pickImageFolder();
      if (added) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        dismiss();
      }
    } finally {
      setUploading(false);
    }
  }, [pickImageFolder, dismiss]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={dismiss}
      />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: bottomInset + 12 },
          { transform: [{ translateY: slideY }] },
        ]}
        {...panResponder.panHandlers}
      >
        <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheetContent}>

          {/* Handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.sheetTitle}>Artwork</Text>

          {/* ── Row 1: Re-Roll ── */}
          <TouchableOpacity
            style={[styles.row, !imagePool.length && styles.rowDisabled]}
            onPress={handleReRoll}
            disabled={!imagePool.length}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <DiceIcon size={20} color={imagePool.length ? Colors.dark.accent : Colors.dark.textTertiary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, !imagePool.length && styles.rowLabelDisabled]}>
                Re-Roll Artwork
              </Text>
              <Text style={styles.rowHint}>
                {imagePool.length
                  ? "Pick a new random image from your gallery"
                  : "Add images to your gallery first"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* ── Choose from Gallery — horizontal scroll ── */}
          {imagePool.length > 0 && (
            <View style={styles.gallerySection}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <LayoutGrid size={20} color={Colors.dark.accent} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Choose from Gallery</Text>
                  <Text style={styles.rowHint}>Tap an image to assign it</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {imagePool.map((uri) => (
                  <TouchableOpacity
                    key={uri}
                    onPress={() => handleChoose(uri)}
                    activeOpacity={0.75}
                    style={styles.thumb}
                  >
                    <Image
                      source={{ uri }}
                      style={styles.thumbImg}
                      contentFit="cover"
                      transition={120}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sep} />

          {/* ── Row 3: Upload New Photo ── */}
          <TouchableOpacity
            style={styles.row}
            onPress={handleUpload}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.dark.accent} />
                : <ImagePlus size={20} color={Colors.dark.accent} />
              }
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>
                {uploading ? "Saving…" : "Upload New Photo"}
              </Text>
              <Text style={styles.rowHint}>Add from your camera roll</Text>
            </View>
          </TouchableOpacity>

        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetContent: {
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 16,
  },
  sheetTitle: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: 24,
    marginBottom: 6,
  },

  // ── Action rows ────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 16,
  },
  rowDisabled: { opacity: 0.45 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowLabelDisabled: { color: Colors.dark.textTertiary },
  rowHint: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  // ── Gallery horizontal scroll ─────────────────────────────────────────
  gallerySection: { marginBottom: 4 },
  galleryScroll: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    gap: 10,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  thumbImg: { width: "100%", height: "100%" },

  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 24,
    marginVertical: 4,
  },
});
