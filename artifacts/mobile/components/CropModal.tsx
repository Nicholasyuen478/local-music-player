import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CROP_FRAME_PADDING = 40;

type Props = {
  visible: boolean;
  uri: string | null;
  onSave: (croppedUri: string, originalUri: string) => void;
  onClose: () => void;
};

export function CropModal({ visible, uri, onSave, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [imageNaturalSize, setImageNaturalSize] = useState({ w: 1, h: 1 });
  const [isSaving, setIsSaving] = useState(false);

  // ── Crop frame geometry (fixed, screen-centered square) ───────────────
  const cropFrameSize = width - CROP_FRAME_PADDING * 2;
  const frameLeft = CROP_FRAME_PADDING;
  const frameTop = (height - cropFrameSize) / 2;

  // ── Image display geometry ────────────────────────────────────────────
  const layout = useMemo(() => {
    const aspect = imageNaturalSize.w / imageNaturalSize.h;
    let dispW = width;
    let dispH = width / aspect;
    if (dispH < height) {
      dispH = height;
      dispW = height * aspect;
    }
    return {
      dispW,
      dispH,
      imgLeft: (width - dispW) / 2,
      imgTop: (height - dispH) / 2,
    };
  }, [imageNaturalSize, width, height]);

  // Keep a ref so handleDone can always read the latest layout
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // ── Gesture state (RNGH shared values — run on UI thread) ─────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    });

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // ── Reset state when the modal opens ─────────────────────────────────
  const handleShow = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    startX.value = 0;
    startY.value = 0;
  }, []);

  // ── Save / crop ───────────────────────────────────────────────────────
  const handleDone = useCallback(async () => {
    if (!uri || isSaving) return;
    setIsSaving(true);
    try {
      const { dispW, dispH, imgLeft, imgTop } = layoutRef.current;
      // Read pan offset from shared values (JS-thread read is safe here)
      const px = translateX.value;
      const py = translateY.value;

      const { w: naturalW, h: naturalH } = imageNaturalSize;

      const actualImgLeft = imgLeft + px;
      const actualImgTop = imgTop + py;

      const scaleX = naturalW / dispW;
      const scaleY = naturalH / dispH;

      let cropX = (frameLeft - actualImgLeft) * scaleX;
      let cropY = (frameTop - actualImgTop) * scaleY;
      let cropW = cropFrameSize * scaleX;
      let cropH = cropFrameSize * scaleY;

      // Clamp to image bounds
      cropX = Math.max(0, Math.min(cropX, naturalW - 10));
      cropY = Math.max(0, Math.min(cropY, naturalH - 10));
      cropW = Math.max(10, Math.min(cropW, naturalW - cropX));
      cropH = Math.max(10, Math.min(cropH, naturalH - cropY));

      // ✅ Correct SDK 52 builder API — crop must be CHAINED, not called and discarded
      const imageRef = await ImageManipulator.manipulate(uri)
        .crop({ originX: cropX, originY: cropY, width: cropW, height: cropH })
        .renderAsync();

      const saved = await imageRef.saveAsync({
        compress: 0.92,
        format: SaveFormat.JPEG,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(saved.uri, uri);
    } catch (e) {
      console.error("crop error", e);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [uri, isSaving, imageNaturalSize, frameLeft, frameTop, cropFrameSize, onSave, onClose]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  if (!uri) return null;

  const { dispW, dispH, imgLeft, imgTop } = layout;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;
  const topPad = Platform.OS === "web" ? 16 : insets.top + 8;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onShow={handleShow}
    >
      {/*
        GestureHandlerRootView is required inside Modal because the Modal
        renders in a separate native window outside the app's root GHRV.
      */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          {/* ── Pannable image (gesture covers full screen) ── */}
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.gestureArea]}>
              <Animated.View
                style={[
                  styles.imageWrapper,
                  { width: dispW, height: dispH, left: imgLeft, top: imgTop },
                  imageAnimStyle,
                ]}
              >
                <Image
                  source={{ uri }}
                  style={{ width: dispW, height: dispH }}
                  resizeMode="cover"
                  onLoad={({ nativeEvent: { source } }) =>
                    setImageNaturalSize({ w: source.width, h: source.height })
                  }
                />
              </Animated.View>
            </Animated.View>
          </GestureDetector>

          {/* ── Dark overlay quadrants (non-interactive) ── */}
          <View
            pointerEvents="none"
            style={[styles.darkTop, { height: frameTop }]}
          />
          <View
            pointerEvents="none"
            style={[styles.darkBottom, { top: frameTop + cropFrameSize }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.darkSide,
              { top: frameTop, width: frameLeft, height: cropFrameSize },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.darkSide,
              {
                top: frameTop,
                left: frameLeft + cropFrameSize,
                right: 0,
                height: cropFrameSize,
              },
            ]}
          />

          {/* ── Crop frame ── */}
          <View
            pointerEvents="none"
            style={[
              styles.cropFrame,
              {
                top: frameTop,
                left: frameLeft,
                width: cropFrameSize,
                height: cropFrameSize,
              },
            ]}
          >
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* ── Hint text ── */}
          <View
            pointerEvents="none"
            style={[styles.topBar, { paddingTop: topPad }]}
          >
            <Text style={styles.hint}>Drag to reposition</Text>
          </View>

          {/* ── Action buttons — rendered OUTSIDE GestureDetector, get taps reliably ── */}
          <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.btn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDone}
              style={[styles.btn, styles.doneBtn, isSaving && styles.btnDisabled]}
              disabled={isSaving}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.doneText}>{isSaving ? "Saving…" : "Done"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: "#000" },
  gestureArea: { zIndex: 0 },
  imageWrapper: { position: "absolute" },
  darkTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 1,
    pointerEvents: "none",
  },
  darkBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 1,
  },
  darkSide: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 1,
  },
  cropFrame: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    zIndex: 2,
  },
  corner: {
    position: "absolute",
    width: 18,
    height: 18,
    borderColor: "#fff",
  },
  cornerTL: {
    top: -1.5,
    left: -1.5,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: -1.5,
    right: -1.5,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: -1.5,
    left: -1.5,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: -1.5,
    right: -1.5,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 3,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 3,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  doneBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.4 },
  cancelText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
  },
  doneText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
