import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import { Check, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
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

type Props = {
  visible: boolean;
  uri: string | null;
  onSave: (croppedUri: string, originalUri: string) => void;
  onClose: () => void;
};

export function CropModal({ visible, uri, onSave, onClose }: Props) {
  const { width: SW, height: SH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerH = (Platform.OS === "web" ? 48 : insets.top) + 56;
  const hintH = 48;

  const canvasH = SH - headerH - hintH;
  const CROP_SIZE = Math.min(SW * 0.84, canvasH * 0.82);

  // Vertical center of the image canvas relative to full screen
  const canvasCenterY = headerH + canvasH / 2;

  const cropBoxLeft = (SW - CROP_SIZE) / 2;
  const cropBoxTop = canvasCenterY - CROP_SIZE / 2;
  const cropBoxRight = SW - cropBoxLeft - CROP_SIZE;
  const cropBoxBottom = SH - cropBoxTop - CROP_SIZE;

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const minScaleRef = useRef(1);
  const lastTouches = useRef<Array<{ x: number; y: number }>>([]);

  // Reset state when a new image is opened
  useEffect(() => {
    if (!uri || !visible) return;
    setImageSize(null);
    setIsSaving(false);
    setPanX(0);
    setPanY(0);
    panRef.current = { x: 0, y: 0 };

    RNImage.getSize(
      uri,
      (w, h) => {
        const minScale = Math.max(CROP_SIZE / w, CROP_SIZE / h);
        minScaleRef.current = minScale;
        scaleRef.current = minScale;
        setScale(minScale);
        setImageSize({ width: w, height: h });
      },
      (err) => console.error("CropModal getSize error", err)
    );
  }, [uri, visible, CROP_SIZE]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        lastTouches.current = Array.from(evt.nativeEvent.touches).map((t) => ({
          x: t.pageX,
          y: t.pageY,
        }));
      },
      onPanResponderMove: (evt) => {
        const touches = Array.from(evt.nativeEvent.touches).map((t) => ({
          x: t.pageX,
          y: t.pageY,
        }));

        if (touches.length === 1 && lastTouches.current.length >= 1) {
          // Single-finger pan
          const dx = touches[0].x - lastTouches.current[0].x;
          const dy = touches[0].y - lastTouches.current[0].y;
          panRef.current = {
            x: panRef.current.x + dx,
            y: panRef.current.y + dy,
          };
          setPanX(panRef.current.x);
          setPanY(panRef.current.y);
        } else if (touches.length === 2 && lastTouches.current.length === 2) {
          // Two-finger pinch zoom
          const prevDist = Math.hypot(
            lastTouches.current[1].x - lastTouches.current[0].x,
            lastTouches.current[1].y - lastTouches.current[0].y
          );
          const curDist = Math.hypot(
            touches[1].x - touches[0].x,
            touches[1].y - touches[0].y
          );
          if (prevDist > 0) {
            const ratio = curDist / prevDist;
            const newScale = Math.max(
              minScaleRef.current * 0.75,
              Math.min(minScaleRef.current * 8, scaleRef.current * ratio)
            );
            scaleRef.current = newScale;
            setScale(newScale);
          }
        }

        lastTouches.current = touches;
      },
      onPanResponderRelease: () => {
        lastTouches.current = [];
      },
      onPanResponderTerminate: () => {
        lastTouches.current = [];
      },
    })
  ).current;

  const handleApply = useCallback(async () => {
    if (!imageSize || !uri) return;
    setIsSaving(true);
    try {
      const { width: imgW, height: imgH } = imageSize;
      const displayW = imgW * scaleRef.current;
      const displayH = imgH * scaleRef.current;

      // Image top-left position on screen
      const imgLeft = SW / 2 + panRef.current.x - displayW / 2;
      const imgTop = canvasCenterY + panRef.current.y - displayH / 2;

      // Crop box coordinates in original image space
      const originX = Math.max(0, (cropBoxLeft - imgLeft) / scaleRef.current);
      const originY = Math.max(0, (cropBoxTop - imgTop) / scaleRef.current);
      const cropW = Math.min(CROP_SIZE / scaleRef.current, imgW - originX);
      const cropH = Math.min(CROP_SIZE / scaleRef.current, imgH - originY);

      if (cropW <= 0 || cropH <= 0) return;

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropW),
              height: Math.round(cropH),
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      onSave(result.uri, uri);
    } catch (e) {
      console.error("crop apply error", e);
    } finally {
      setIsSaving(false);
    }
  }, [imageSize, uri, SW, canvasCenterY, cropBoxLeft, cropBoxTop, CROP_SIZE, onSave]);

  const handleReset = useCallback(() => {
    panRef.current = { x: 0, y: 0 };
    setPanX(0);
    setPanY(0);
    if (imageSize) {
      const minScale = Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height);
      scaleRef.current = minScale;
      setScale(minScale);
    }
  }, [imageSize, CROP_SIZE]);

  const displayW = imageSize ? imageSize.width * scale : 0;
  const displayH = imageSize ? imageSize.height * scale : 0;

  const imgLeft = SW / 2 + panX - displayW / 2;
  const imgTop = canvasCenterY + panY - displayH / 2;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent transparent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 48 : insets.top }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Crop</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleReset} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApply}
              style={styles.headerBtn}
              disabled={!imageSize || isSaving}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Check size={22} color={imageSize ? "#fff" : "rgba(255,255,255,0.3)"} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Canvas — full screen, gesture handled here */}
        <View style={StyleSheet.absoluteFillObject} {...panResponder.panHandlers}>
          {/* Image */}
          {imageSize ? (
            <View
              style={{
                position: "absolute",
                width: displayW,
                height: displayH,
                left: imgLeft,
                top: imgTop,
              }}
              pointerEvents="none"
            >
              <Image source={{ uri }} style={{ width: displayW, height: displayH }} contentFit="fill" />
            </View>
          ) : (
            <View style={StyleSheet.absoluteFillObject}>
              <ActivityIndicator color="#fff" size="large" style={{ marginTop: SH / 2 }} />
            </View>
          )}

          {/* Dark overlay: top */}
          <View
            pointerEvents="none"
            style={[styles.overlay, { top: 0, left: 0, right: 0, height: cropBoxTop }]}
          />
          {/* Dark overlay: left */}
          <View
            pointerEvents="none"
            style={[styles.overlay, { top: cropBoxTop, left: 0, width: cropBoxLeft, height: CROP_SIZE }]}
          />
          {/* Dark overlay: right */}
          <View
            pointerEvents="none"
            style={[styles.overlay, { top: cropBoxTop, right: 0, width: cropBoxRight, height: CROP_SIZE }]}
          />
          {/* Dark overlay: bottom */}
          <View
            pointerEvents="none"
            style={[styles.overlay, { bottom: 0, left: 0, right: 0, top: cropBoxTop + CROP_SIZE }]}
          />

          {/* Crop box border corners */}
          <View
            pointerEvents="none"
            style={[
              styles.cropBoxFrame,
              { top: cropBoxTop, left: cropBoxLeft, width: CROP_SIZE, height: CROP_SIZE },
            ]}
          >
            {/* TL */}
            <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 }]} />
            {/* TR */}
            <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 }]} />
            {/* BL */}
            <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
            {/* BR */}
            <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 }]} />
          </View>
        </View>

        {/* Hint bar */}
        <View style={[styles.hint, { bottom: 0, height: hintH + insets.bottom }]}>
          <Text style={styles.hintText}>Drag to reposition  ·  Pinch to zoom</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_500Medium",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  resetText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  overlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  cropBoxFrame: {
    position: "absolute",
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#fff",
  },
  hint: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  hintText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
