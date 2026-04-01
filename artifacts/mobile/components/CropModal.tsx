import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useRef, useState, useCallback } from "react";
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

  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const currentPanX = useRef(0);
  const currentPanY = useRef(0);
  const offsetX = useRef(0);
  const offsetY = useRef(0);

  const aspect = imageNaturalSize.w / imageNaturalSize.h;
  let dispW = width;
  let dispH = width / aspect;
  if (dispH < height) {
    dispH = height;
    dispW = height * aspect;
  }

  const imgLeft = (width - dispW) / 2;
  const imgTop = (height - dispH) / 2;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
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
      const px = currentPanX.current;
      const py = currentPanY.current;

      const actualImgLeft = imgLeft + px;
      const actualImgTop = imgTop + py;

      const scaleX = imageNaturalSize.w / dispW;
      const scaleY = imageNaturalSize.h / dispH;

      let cropX = (frameLeft - actualImgLeft) * scaleX;
      let cropY = (frameTop - actualImgTop) * scaleY;
      let cropW = cropFrameSize * scaleX;
      let cropH = cropFrameSize * scaleY;

      cropX = Math.max(0, Math.min(cropX, imageNaturalSize.w - 10));
      cropY = Math.max(0, Math.min(cropY, imageNaturalSize.h - 10));
      cropW = Math.max(10, Math.min(cropW, imageNaturalSize.w - cropX));
      cropH = Math.max(10, Math.min(cropH, imageNaturalSize.h - cropY));

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: cropX,
              originY: cropY,
              width: cropW,
              height: cropH,
            },
          },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(result.uri, uri);
    } catch (e) {
      console.error("crop error", e);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [uri, isSaving, imageNaturalSize, dispW, dispH, imgLeft, imgTop, frameLeft, frameTop, cropFrameSize, onSave, onClose]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    panX.setValue(0);
    panY.setValue(0);
    currentPanX.current = 0;
    currentPanY.current = 0;
    onClose();
  }, [onClose]);

  if (!uri) return null;

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
        <Animated.View
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
          {...panResponder.panHandlers}
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

        <View style={[styles.darkTop, { height: frameTop }]} />
        <View
          style={[styles.darkBottom, { top: frameTop + cropFrameSize }]}
        />
        <View
          style={[
            styles.darkSide,
            { top: frameTop, width: frameLeft, height: cropFrameSize },
          ]}
        />
        <View
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

        <View
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

        <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 }]}>
          <Text style={styles.hint}>Drag to reposition</Text>
        </View>

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
  imageWrapper: {
    position: "absolute",
  },
  darkTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  darkBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  darkSide: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  cropFrame: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
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
