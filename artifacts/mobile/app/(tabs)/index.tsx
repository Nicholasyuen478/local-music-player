import * as Haptics from "expo-haptics";
import {
  ChevronDown,
  ImageIcon,
  Pause,
  Play,
  ScanSearch,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react-native";
import { router } from "expo-router";
import React, { useState, useCallback, useRef, useEffect } from "react";
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

  // ── Setup-page pulse rings ─────────────────────────────────────────────
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const DURATION = 2600;
    const STEP = DURATION / 3;

    const makeLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: DURATION, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    const l1 = makeLoop(ring1, 0);
    const l2 = makeLoop(ring2, STEP);
    const l3 = makeLoop(ring3, STEP * 2);
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, [ring1, ring2, ring3]);

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
    const orbSize = Math.min(width * 0.55, 220);

    const makeRingStyle = (anim: Animated.Value) => ({
      opacity: anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.45, 0] }),
      transform: [{
        scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.7] }),
      }],
    });

    return (
      <View style={[styles.setupContainer, { paddingTop: topInset, paddingBottom: playerBottomPad + 24 }]}>

        {/* Bold title — top aligned like the reference */}
        <View style={styles.setupHeader}>
          <Text style={[styles.setupTitle, isCompact && styles.setupTitleCompact]}>
            Scan your{"\n"}music
          </Text>
          <Text style={styles.setupSubtitle}>Tap to start</Text>
        </View>

        {/* Pulsing orb */}
        <View style={[styles.setupOrb, { width: orbSize, height: orbSize }]}>
          {/* Pulse rings */}
          <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring1)]} />
          <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring2)]} />
          <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring3)]} />
          {/* Core glow */}
          <View style={[styles.orbCore, { width: orbSize * 0.52, height: orbSize * 0.52, borderRadius: orbSize * 0.26 }]}>
            <View style={[styles.orbInner, { width: orbSize * 0.32, height: orbSize * 0.32, borderRadius: orbSize * 0.16 }]} />
          </View>
        </View>

        {/* Single scan button */}
        <TouchableOpacity
          style={[styles.setupBtn, (isScanning || isLoading) && styles.setupBtnScanning]}
          onPress={handleScan}
          disabled={isScanning || isLoading}
          activeOpacity={0.82}
        >
          <ScanSearch size={18} color={(isScanning || isLoading) ? Colors.dark.accent : "#fff"} />
          <Text style={[styles.setupBtnText, (isScanning || isLoading) && styles.setupBtnTextScanning]}>
            {isScanning || isLoading ? "Scanning…" : "Scan songs from device"}
          </Text>
        </TouchableOpacity>

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

  // ══ Setup / empty state ═══════════════════════════════════════════════
  setupContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: "space-between",
  },

  setupHeader: {
    paddingHorizontal: 28,
    paddingTop: 12,
    gap: 8,
  },
  setupTitle: {
    color: Colors.dark.text,
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    lineHeight: 42,
  },
  setupTitleCompact: { fontSize: 28, lineHeight: 34 },
  setupSubtitle: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
  },

  setupOrb: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
  },
  orbCore: {
    backgroundColor: "rgba(108,99,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(108,99,255,0.35)",
  },
  orbInner: {
    backgroundColor: Colors.dark.accent,
    opacity: 0.55,
  },

  setupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 50,
    backgroundColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  setupBtnScanning: {
    backgroundColor: Colors.dark.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  setupBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  setupBtnTextScanning: {
    color: Colors.dark.accent,
  },

});
