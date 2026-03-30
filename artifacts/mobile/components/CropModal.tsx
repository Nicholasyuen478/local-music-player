/**
 * CropModal — square image crop editor (fully patched).
 *
 * Bug fixes:
 *   1. clampPan reads cropSzRef inside a stable ref callback, never stale.
 *   2. expo-image uses contentFit="contain" with explicit dimensions to avoid
 *      EXIF-rotation stretching; the outer View clips to displayW/displayH.
 *   3. panRef and lastTouches are defensively reset on every touch count change
 *      (1↔2 transition) to prevent position jumps.
 */

import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import { Check, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

const CORNER_LEN = 22;
const CORNER_W = 2.5;
const GRID_COLOR = "rgba(255,255,255,0.22)";
const DIM_COLOR = "rgba(0,0,0,0.62)";
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export function CropModal({ visible, uri, onSave, onClose }: Props) {
  const { width: SW, height: SH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const CROP_SIZE = Math.min(SW * 0.84, 320);
  const BOX_LEFT = (SW - CROP_SIZE) / 2;
  const BOX_TOP = (SH - CROP_SIZE) / 2;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayW, setDisplayW] = useState(0);
  const [displayH, setDisplayH] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const imgWRef = useRef(0);
  const imgHRef = useRef(0);
  const scaleRef = useRef(1);
  const minScaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const cropSzRef = useRef(CROP_SIZE);
  const displayWRef = useRef(0); // BUG 1 FIX: keep display dims in refs
  const displayHRef = useRef(0); // so clampPan never reads stale state
  const lastTouches = useRef<Array<{ x: number; y: number }>>([]);
  const lastTouchCount = useRef(0); // BUG 3 FIX: track previous touch count
  const lastTapAt = useRef(0);

  useEffect(() => {
    cropSzRef.current = CROP_SIZE;
  }, [CROP_SIZE]);

  useEffect(() => {
    if (!uri || !visible) return;
    setLoading(true);
    setSaving(false);
    panRef.current = { x: 0, y: 0 };
    lastTouches.current = [];
    lastTouchCount.current = 0;
    setPanX(0);
    setPanY(0);

    RNImage.getSize(
      uri,
      (w, h) => {
        const CS = cropSzRef.current;
        const minScale = Math.max(CS / w, CS / h);
        imgWRef.current = w;
        imgHRef.current = h;
        minScaleRef.current = minScale;
        scaleRef.current = minScale;
        const dw = w * minScale;
        const dh = h * minScale;
        displayWRef.current = dw; // BUG 1 FIX
        displayHRef.current = dh;
        setDisplayW(dw);
        setDisplayH(dh);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [uri, visible]);

  /**
   * BUG 1 FIX: clampPan reads only refs (cropSzRef, displayWRef, displayHRef),
   * never React state, so it is always current inside PanResponder callbacks.
   */
  function clampPan(px: number, py: number): { x: number; y: number } {
    const CS = cropSzRef.current;
    const dW = displayWRef.current;
    const dH = displayHRef.current;
    const maxX = Math.max(0, (dW - CS) / 2);
    const maxY = Math.max(0, (dH - CS) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  }

  // Helper: commit new pan to both ref and state
  function applyPan(x: number, y: number) {
    const clamped = clampPan(x, y);
    panRef.current = clamped;
    setPanX(clamped.x);
    setPanY(clamped.y);
  }

  // Helper: commit new scale + re-clamp pan
  function applyScale(newScale: number) {
    const w = imgWRef.current;
    const h = imgHRef.current;
    scaleRef.current = newScale;
    const dw = w * newScale;
    const dh = h * newScale;
    displayWRef.current = dw; // BUG 1 FIX: keep refs in sync
    displayHRef.current = dh;
    setDisplayW(dw);
    setDisplayH(dh);
    applyPan(panRef.current.x, panRef.current.y);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,

      onPanResponderGrant: (evt) => {
        lastTouches.current = Array.from(evt.nativeEvent.touches).map((t) => ({
          x: t.pageX,
          y: t.pageY,
        }));
        lastTouchCount.current = lastTouches.current.length;
      },

      onPanResponderMove: (evt) => {
        const touches = Array.from(evt.nativeEvent.touches).map((t) => ({
          x: t.pageX,
          y: t.pageY,
        }));
        const prev = lastTouches.current;
        const prevCount = lastTouchCount.current;

        /**
         * BUG 3 FIX: When the finger count changes (e.g. user lifts one finger
         * during a pinch), reset lastTouches to the current positions so the
         * next delta is computed from a clean baseline — preventing a position
         * jump caused by mismatched indices.
         */
        if (touches.length !== prevCount) {
          lastTouches.current = touches;
          lastTouchCount.current = touches.length;
          return; // skip this frame, establish new baseline
        }

        if (touches.length === 1 && prev.length >= 1) {
          const dx = touches[0].x - prev[0].x;
          const dy = touches[0].y - prev[0].y;
          applyPan(panRef.current.x + dx, panRef.current.y + dy);
        } else if (touches.length === 2 && prev.length >= 2) {
          const prevDist = Math.hypot(
            prev[1].x - prev[0].x,
            prev[1].y - prev[0].y
          );
          const curDist = Math.hypot(
            touches[1].x - touches[0].x,
            touches[1].y - touches[0].y
          );
          if (prevDist > 0) {
            const newScale = Math.max(
              minScaleRef.current,
              Math.min(
                minScaleRef.current * 7,
                scaleRef.current * (curDist / prevDist)
              )
            );
            applyScale(newScale);
          }
        }

        lastTouches.current = touches;
        lastTouchCount.current = touches.length;
      },

      onPanResponderRelease: (_, gs) => {
        lastTouches.current = [];
        lastTouchCount.current = 0;
        const now = Date.now();
        if (
          now - lastTapAt.current < 280 &&
          Math.abs(gs.dx) < 6 &&
          Math.abs(gs.dy) < 6
        ) {
          // Double-tap: reset to fit
          const CS = cropSzRef.current;
          const w = imgWRef.current;
          const h = imgHRef.current;
          const minScale = Math.max(CS / w, CS / h);
          applyScale(minScale); // also resets pan via applyPan inside
          panRef.current = { x: 0, y: 0 };
          setPanX(0);
          setPanY(0);
        }
        lastTapAt.current = now;
      },

      onPanResponderTerminate: () => {
        lastTouches.current = [];
        lastTouchCount.current = 0;
      },
    })
  ).current;

  const handleApply = useCallback(async () => {
    if (!uri || !imgWRef.current || !imgHRef.current) return;
    setSaving(true);
    try {
      const imgW = imgWRef.current;
      const imgH = imgHRef.current;
      const sc = scaleRef.current;
      const CS = cropSzRef.current;
      const px = panRef.current.x;
      const py = panRef.current.y;

      const originX = imgW / 2 - px / sc - CS / (2 * sc);
      const originY = imgH / 2 - py / sc - CS / (2 * sc);
      const side = CS / sc;

      const ox = Math.max(0, Math.round(originX));
      const oy = Math.max(0, Math.round(originY));
      const ow = Math.min(Math.round(side), imgW - ox);
      const oh = Math.min(Math.round(side), imgH - oy);

      if (ow < 1 || oh < 1) return;

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: ox, originY: oy, width: ow, height: oh } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );
      onSave(result.uri, uri);
    } catch (e) {
      console.error("crop apply error", e);
    } finally {
      setSaving(false);
    }
  }, [uri, onSave]);

  const handleReset = useCallback(() => {
    const CS = cropSzRef.current;
    const w = imgWRef.current;
    const h = imgHRef.current;
    if (!w || !h) return;
    const minScale = Math.max(CS / w, CS / h);
    panRef.current = { x: 0, y: 0 };
    setPanX(0);
    setPanY(0);
    applyScale(minScale);
  }, []);

  const imgLeft = SW / 2 + panX - displayW / 2;
  const imgTop = SH / 2 + panY - displayH / 2;

  const headerPT = Platform.OS === "web" ? 48 : insets.top;
  const footerPB = Math.max(Platform.OS === "web" ? 0 : insets.bottom, 12);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* ── Image layer ─────────────────────────────────────
            BUG 2 FIX: Use contentFit="cover" (not "fill") inside a View
            clipped to displayW×displayH. "fill" ignores aspect ratio and
            stretches EXIF-rotated images. "cover" respects the intrinsic
            aspect ratio as decoded (post-EXIF), and the parent View clips
            to the exact display rect we calculated.
        ────────────────────────────────────────────────── */}
        {!loading && displayW > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.abs,
              {
                left: imgLeft,
                top: imgTop,
                width: displayW,
                height: displayH,
                overflow: "hidden", // BUG 2 FIX: clips any edge bleed
              },
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: displayW, height: displayH }}
              contentFit="cover" // BUG 2 FIX: was "fill"
            />
          </View>
        )}

        {loading && (
          <View
            style={[styles.abs, styles.fill, styles.center]}
            pointerEvents="none"
          >
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}

        {/* ── Dark overlay panels ──────────────────────────── */}
        <View pointerEvents="none" style={[styles.abs, { top: 0, left: 0, right: 0, height: BOX_TOP, backgroundColor: DIM_COLOR }]} />
        <View pointerEvents="none" style={[styles.abs, { top: BOX_TOP + CROP_SIZE, left: 0, right: 0, bottom: 0, backgroundColor: DIM_COLOR }]} />
        <View pointerEvents="none" style={[styles.abs, { top: BOX_TOP, left: 0, width: BOX_LEFT, height: CROP_SIZE, backgroundColor: DIM_COLOR }]} />
        <View pointerEvents="none" style={[styles.abs, { top: BOX_TOP, left: BOX_LEFT + CROP_SIZE, right: 0, height: CROP_SIZE, backgroundColor: DIM_COLOR }]} />

        {/* ── Crop box decoration ──────────────────────────── */}
        <View
          pointerEvents="none"
          style={[styles.abs, { top: BOX_TOP, left: BOX_LEFT, width: CROP_SIZE, height: CROP_SIZE }]}
        >
          <View style={[styles.gridLine, styles.gridV, { left: "33.33%" }]} />
          <View style={[styles.gridLine, styles.gridV, { left: "66.66%" }]} />
          <View style={[styles.gridLine, styles.gridH, { top: "33.33%" }]} />
          <View style={[styles.gridLine, styles.gridH, { top: "66.66%" }]} />
          {/* TL */}
          <View style={[styles.cBar, { top: 0, left: 0, width: CORNER_LEN, height: CORNER_W }]} />
          <View style={[styles.cBar, { top: 0, left: 0, width: CORNER_W, height: CORNER_LEN }]} />
          {/* TR */}
          <View style={[styles.cBar, { top: 0, right: 0, width: CORNER_LEN, height: CORNER_W }]} />
          <View style={[styles.cBar, { top: 0, right: 0, width: CORNER_W, height: CORNER_LEN }]} />
          {/* BL */}
          <View style={[styles.cBar, { bottom: 0, left: 0, width: CORNER_LEN, height: CORNER_W }]} />
          <View style={[styles.cBar, { bottom: 0, left: 0, width: CORNER_W, height: CORNER_LEN }]} />
          {/* BR */}
          <View style={[styles.cBar, { bottom: 0, right: 0, width: CORNER_LEN, height: CORNER_W }]} />
          <View style={[styles.cBar, { bottom: 0, right: 0, width: CORNER_W, height: CORNER_LEN }]} />
        </View>

        {/* ── Gesture capture (full screen) ───────────────── */}
        <View style={[styles.abs, styles.fill]} {...panResponder.panHandlers} />

        {/* ── Header ──────────────────────────────────────── */}
        <View
          pointerEvents="box-none"
          style={[styles.abs, styles.header, { paddingTop: headerPT }]}
        >
          <TouchableOpacity onPress={onClose} style={styles.hBtn} hitSlop={HIT}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.hTitle}>Crop</Text>
          <TouchableOpacity
            onPress={handleApply}
            disabled={loading || saving}
            style={styles.hBtn}
            hitSlop={HIT}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Check size={22} color={loading ? "rgba(255,255,255,0.3)" : "#fff"} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Footer ──────────────────────────────────────── */}
        <View
          pointerEvents="box-none"
          style={[styles.abs, styles.footer, { paddingBottom: footerPB }]}
        >
          <TouchableOpacity onPress={handleReset} hitSlop={HIT}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            Drag · Pinch to zoom · Double-tap to reset
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  abs: { position: "absolute" },
  fill: { top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  hBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  hTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium" },

  footer: {
    bottom: 0, left: 0, right: 0,
    alignItems: "center",
    paddingTop: 14,
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  resetText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 4,
  },
  hintText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  gridLine: { position: "absolute", backgroundColor: GRID_COLOR },
  gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  cBar: { position: "absolute", backgroundColor: "#fff" },
});