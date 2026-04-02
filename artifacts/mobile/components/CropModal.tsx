import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
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

  const cropFrameSize = width - CROP_FRAME_PADDING * 2;
  const frameLeft = CROP_FRAME_PADDING;
  const frameTop = (height - cropFrameSize) / 2;

  // Memoised layout — recomputed whenever image dimensions or screen size change
  const layout = useMemo(() => {
    const aspect = imageNaturalSize.w / imageNaturalSize.h;
    let dispW = width;
    let dispH = width / aspect;
    if (dispH < height) {
      dispH = height;
      dispW = height * aspect;
    }
    const imgLeft = (width - dispW) / 2;
    const imgTop = (height - dispH) / 2;
    return { dispW, dispH, imgLeft, imgTop };
  }, [imageNaturalSize, width, height]);

  // Refs so the PanResponder closure always reads the latest layout values
  const dispWRef = useRef(layout.dispW);
  const dispHRef = useRef(layout.dispH);
  const imgLeftRef = useRef(layout.imgLeft);
  const imgTopRef = useRef(layout.imgTop);

  // Keep refs in sync with memoised layout on every render
  dispWRef.current = layout.dispW;
  dispHRef.current = layout.dispH;
  imgLeftRef.current = layout.imgLeft;
  imgTopRef.current = layout.imgTop;

  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const currentPanX = useRef(0);
  const currentPanY = useRef(0);
  const offsetX = useRef(0);
  const offsetY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        offsetX.current = currentPanX.current;
        offsetY.current = currentPanY.current;
      },
      onPanResponderMove: (_, { dx, dy }) => {
        currentPanX.current = offsetX.current + dx;
        currentPanY.current = offsetY.current + dy;
        panX.setValue(currentPanX.current);
        panY.setValue(currentPanY.current);
      },
      onPanResponderRelease: () => {},
    }),
  ).current;

  const handleDone = useCallback(async () => {
    if (!uri || isSaving) return;
    setIsSaving(true);
    try {
      // Read from refs — always fresh even if this callback was closed over stale values
      const dW = dispWRef.current;
      const dH = dispHRef.current;
      const iL = imgLeftRef.current;
      const iT = imgTopRef.current;
      const px = currentPanX.current;
      const py = currentPanY.current;

      const naturalW = imageNaturalSize.w;
      const naturalH = imageNaturalSize.h;

      const actualImgLeft = iL + px;
      const actualImgTop = iT + py;

      const scaleX = naturalW / dW;
      const scaleY = naturalH / dH;

      let cropX = (frameLeft - actualImgLeft) * scaleX;
      let cropY = (frameTop - actualImgTop) * scaleY;
      let cropW = cropFrameSize * scaleX;
      let cropH = cropFrameSize * scaleY;

      cropX = Math.max(0, Math.min(cropX, naturalW - 10));
      cropY = Math.max(0, Math.min(cropY, naturalH - 10));
      cropW = Math.max(10, Math.min(cropW, naturalW - cropX));
      cropH = Math.max(10, Math.min(cropH, naturalH - cropY));

      // SDK 52 builder API
      const context = ImageManipulator.manipulate(uri);
      context.crop({ originX: cropX, originY: cropY, width: cropW, height: cropH });
      const imageRef = await context.renderAsync();
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
    panX.setValue(0);
    panY.setValue(0);
    currentPanX.current = 0;
    currentPanY.current = 0;
    onClose();
  }, [onClose]);

  if (!uri) return null;

  const { dispW, dispH, imgLeft, imgTop } = layout;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onShow={() => {
        panX.setValue(0);
        panY.setValue(0);
        currentPanX.current = 0;
        currentPanY.current = 0;
      }}
    >
      <View style={styles.container}>
        {/* Full-screen gesture catcher — must be behind overlay views but receive touches */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.gestureLayer]}
          {...panResponder.panHandlers}
        />

        {/* The image moves with pan */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.imageWrapper,
            {
              width: dispW,
              height: dispH,
              left: imgLeft,
              top: imgTop,
              transform: [{ translateX: panX }, { translateY: panY }],
            },
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

        {/* Dark overlay quadrants */}
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

        {/* Crop frame corners */}
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

        {/* Top hint */}
        <View
          pointerEvents="none"
          style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 }]}
        >
          <Text style={styles.hint}>Drag to reposition</Text>
        </View>

        {/* Bottom buttons — above gesture layer so they receive taps */}
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.btn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDone}
            style={[styles.btn, styles.doneBtn, isSaving && styles.btnDisabled]}
            disabled={isSaving}
          >
            <Text style={styles.doneText}>{isSaving ? "Saving…" : "Done"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  gestureLayer: {
    zIndex: 1,
  },
  imageWrapper: {
    position: "absolute",
    zIndex: 0,
  },
  darkTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 2,
  },
  darkBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 2,
  },
  darkSide: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 2,
  },
  cropFrame: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    zIndex: 3,
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
    zIndex: 4,
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
    zIndex: 5,
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
