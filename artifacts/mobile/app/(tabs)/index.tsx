import * as Haptics from "expo-haptics";
import {
  ChevronDown,
  ImageIcon,
  Library,
  Pause,
  Play,
  ScanSearch,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react-native";
import { router } from "expo-router";
import React, { useState, useCallback, useRef } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { SongArtwork } from "@/components/SongArtwork";
import { SeekBar } from "@/components/SeekBar";
import { useLayout } from "@/hooks/useLayout";

const SWIPE_THRESHOLD = 60;

export default function PlayerScreen() {
  const { width, height, isCompact, topInset, bottomInset, fontScale } = useLayout();

  const [isScanning, setIsScanning] = useState(false);

  const {
    currentSong,
    currentArtworkUri,
    songs,
    shuffleEnabled,
    status,
    isLoading,
    isSetupDone,
    hasCustomImages,
    scanDeviceMusic,
    resetSetup,
    pickImageFolder,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    seekTo,
  } = useMusicContext();

  // ── Immersive artwork size: no tab bar stealing space ──────────────────
  // Target ~60% of screen height, capped by screen width so the square fits.
  const playerArtSize = Math.min(
    width - 44,                                      // 22 dp margins per side
    Math.floor(height * (isCompact ? 0.46 : 0.56)), // soft vertical ceiling
    340,                                             // absolute max
  );

  // Bottom padding: just safe-area + breathing room, no tab bar
  const playerBottomPad = bottomInset + (isCompact ? 14 : 24);

  // ── Swipe animation ────────────────────────────────────────────────────
  const slideX       = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const playNextRef  = useRef(playNext);
  const playPrevRef  = useRef(playPrev);
  playNextRef.current = playNext;
  playPrevRef.current = playPrev;

  function animateSongChange(direction: "left" | "right", onComplete: () => void) {
    Animated.parallel([
      Animated.timing(slideX, { toValue: direction === "left" ? -width : width, duration: 200, useNativeDriver: true }),
      Animated.timing(slideOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      onComplete();
      slideX.setValue(direction === "left" ? width : -width);
      slideOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, speed: 22, bounciness: 3, useNativeDriver: true }),
        Animated.timing(slideOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => { slideX.setValue(dx * 0.35); },
      onPanResponderRelease: (_, { dx }) => {
        if (dx > SWIPE_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("right", () => playPrevRef.current());
        } else if (dx < -SWIPE_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("left", () => playNextRef.current());
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    Alert.alert("Clear library", "Remove all songs and return to setup?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          resetSetup();
        },
      },
    ]);
  }, [resetSetup]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const success = await scanDeviceMusic();
      if (success && !hasCustomImages) {
        Alert.alert("Add artwork", "Pick images from your gallery to use as song artwork?", [
          { text: "Skip", style: "cancel" },
          { text: "Choose images", onPress: async () => { await pickImageFolder(); } },
        ]);
      }
    } catch (e) { console.error("scan error", e); }
    finally { setIsScanning(false); }
    return true;
  }, [scanDeviceMusic, pickImageFolder, hasCustomImages]);

  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  }, [togglePlayPause]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateSongChange("left", () => playNext());
  }, [playNext]);

  const handlePrev = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateSongChange("right", () => playPrev());
  }, [playPrev]);

  const handleShuffle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleShuffle();
  }, [toggleShuffle]);

  // ── Responsive sizes ───────────────────────────────────────────────────
  const titleSize  = Math.round(22 * fontScale);
  const artistSize = Math.round(14 * fontScale);
  const iconSize   = isCompact ? 24 : 28;
  const playBtnSz  = isCompact ? 60 : 70;
  const playIconSz = isCompact ? 28 : 34;

  // ══════════════════════════════════════════════════════════════════════
  // EMPTY STATE — no songs loaded yet
  // ══════════════════════════════════════════════════════════════════════
  const isEmpty = !isSetupDone || songs.length === 0;

  if (isEmpty) {
    const emptyArtSize = Math.min(width - 80, 240);
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>

        {/* Top bar — scan button only in empty state */}
        <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
          <View style={styles.utilBtn} />
          <TouchableOpacity
            onPress={handleScan}
            style={styles.utilBtn}
            activeOpacity={0.6}
            disabled={isScanning || isLoading}
            hitSlop={8}
          >
            <ScanSearch
              size={17}
              color={(isScanning || isLoading) ? Colors.dark.accent : Colors.dark.textTertiary}
            />
          </TouchableOpacity>
        </View>

        {/* Empty art placeholder */}
        <View style={styles.emptyArtWrap}>
          <View style={[styles.emptyArtShadow, {
            width: emptyArtSize,
            height: emptyArtSize,
            borderRadius: 24,
            shadowRadius: 30,
          }]}>
            <SongArtwork artworkUri={null} size={emptyArtSize} borderRadius={24} />
          </View>
        </View>

        {/* CTA copy */}
        <View style={styles.emptyCopy}>
          <Text style={[styles.emptyTitle, isCompact && styles.emptyTitleCompact]}>
            No Song Selected
          </Text>
          <Text style={styles.emptySubtitle}>
            Add your music library to get started
          </Text>
        </View>

        {/* Primary: Browse Library */}
        <View style={[styles.emptyActions, { paddingBottom: playerBottomPad + 16 }]}>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => router.navigate("/(tabs)/library")}
            activeOpacity={0.82}
          >
            <Library size={18} color="#fff" />
            <Text style={styles.browseBtnText}>Browse Library</Text>
          </TouchableOpacity>

          {/* Secondary: scan inline */}
          <TouchableOpacity
            onPress={handleScan}
            disabled={isScanning || isLoading}
            activeOpacity={0.7}
            style={styles.scanLink}
          >
            <ScanSearch size={14} color={Colors.dark.textTertiary} />
            <Text style={styles.scanLinkText}>
              {isScanning || isLoading ? "Scanning…" : "Scan device"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // PLAYER — songs available
  // ══════════════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Top bar: chevron-down (→ Library) | scan + trash ── */}
      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <TouchableOpacity
          onPress={() => router.navigate("/(tabs)/library")}
          style={styles.utilBtn}
          activeOpacity={0.6}
          hitSlop={8}
        >
          <ChevronDown size={20} color={Colors.dark.textTertiary} />
        </TouchableOpacity>

        <View style={styles.topRight}>
          <TouchableOpacity
            onPress={handleScan}
            style={styles.utilBtnSmall}
            activeOpacity={0.6}
            disabled={isScanning}
            hitSlop={8}
          >
            <ScanSearch
              size={16}
              color={isScanning ? Colors.dark.accent : Colors.dark.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClearAll}
            style={styles.utilBtnSmall}
            activeOpacity={0.6}
            hitSlop={8}
          >
            <Trash2 size={16} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Artwork — hero element ── */}
      <View style={styles.artOuter}>
        {/*
          overflow: 'hidden' is intentionally ABSENT from the Animated.View
          so the image-edit button in the bottom-right corner isn't clipped.
          SongArtwork handles its own internal clipping.
        */}
        <Animated.View
          style={{
            width: playerArtSize,
            height: playerArtSize,
            transform: [{ translateX: slideX }],
            opacity: slideOpacity,
            borderRadius: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            elevation: 16,
          }}
          {...panResponder.panHandlers}
        >
          <SongArtwork
            artworkUri={currentArtworkUri}
            size={playerArtSize}
            borderRadius={20}
          />

          {/* ── Image gallery edit button — bottom-right of artwork ── */}
          <TouchableOpacity
            style={styles.artEditBtn}
            onPress={() => router.navigate("/(tabs)/images")}
            activeOpacity={0.8}
            hitSlop={14}
          >
            <ImageIcon size={13} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Song info + shuffle ── */}
      <View style={[styles.infoRow, isCompact && styles.infoRowCompact]}>
        <View style={styles.infoText}>
          <Text
            style={[styles.songTitle, { fontSize: titleSize }]}
            numberOfLines={1}
          >
            {currentSong?.title ?? "—"}
          </Text>
          <Text
            style={[styles.songArtist, { fontSize: artistSize }]}
            numberOfLines={1}
          >
            {currentSong?.artist ?? `${songs.length} songs`}
          </Text>
        </View>

        <View style={styles.shuffleWrap}>
          <TouchableOpacity
            onPress={handleShuffle}
            style={[styles.shuffleBtn, shuffleEnabled && styles.shuffleBtnActive]}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Shuffle
              size={isCompact ? 17 : 19}
              color={shuffleEnabled ? Colors.dark.accent : Colors.dark.textTertiary}
            />
          </TouchableOpacity>
          {shuffleEnabled && <View style={styles.shuffleDot} />}
        </View>
      </View>

      {/* ── Seek bar ── */}
      <View style={[styles.seekSection, isCompact && styles.seekSectionCompact]}>
        <SeekBar
          duration={status.duration ?? 0}
          position={status.currentTime ?? 0}
          onSeek={seekTo}
        />
      </View>

      {/* ── Playback controls ── */}
      <View style={[styles.controls, { paddingBottom: playerBottomPad }]}>
        <TouchableOpacity onPress={handlePrev} style={styles.skipBtn} activeOpacity={0.65} hitSlop={8}>
          <SkipBack size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.82}
          style={[styles.playBtn, { width: playBtnSz, height: playBtnSz, borderRadius: playBtnSz / 2 }]}
        >
          {status.playing ? (
            <Pause size={playIconSz} color={Colors.dark.background} fill={Colors.dark.background} />
          ) : (
            <Play size={playIconSz} color={Colors.dark.background} fill={Colors.dark.background} style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={styles.skipBtn} activeOpacity={0.65} hitSlop={8}>
          <SkipForward size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // ── Top bar ──────────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  topBarCompact: { paddingTop: 2, paddingBottom: 2 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 4 },

  utilBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  utilBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Artwork hero ──────────────────────────────────────────────────────
  artOuter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  // Image gallery edit button — overlaid bottom-right of artwork
  artEditBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // ── Song info ─────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    marginBottom: 6,
    gap: 12,
  },
  infoRowCompact: { marginBottom: 2 },
  infoText: { flex: 1 },

  songTitle: {
    color: Colors.dark.text,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  songArtist: {
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },

  shuffleWrap: { alignItems: "center" },
  shuffleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  shuffleBtnActive: { backgroundColor: Colors.dark.accentDim },
  shuffleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
    marginTop: 2,
  },

  // ── Seek bar ──────────────────────────────────────────────────────────
  seekSection: { paddingHorizontal: 20, marginBottom: 6 },
  seekSectionCompact: { marginBottom: 2 },

  // ── Controls ──────────────────────────────────────────────────────────
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 36,
  },
  skipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.surfaceSecondary,
  },
  playBtn: {
    backgroundColor: Colors.dark.text,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  // ══ Empty state ══════════════════════════════════════════════════════
  emptyArtWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyArtShadow: {
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.20,
    elevation: 10,
  },

  emptyCopy: {
    alignItems: "center",
    paddingHorizontal: 40,
    marginBottom: 32,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptyTitleCompact: { fontSize: 19 },
  emptySubtitle: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  emptyActions: {
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 50,
    width: "100%",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  browseBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  scanLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  scanLinkText: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
