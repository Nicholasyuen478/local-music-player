import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import {
  ChevronDown,
  ChevronUp,
  Heart,
  ImageIcon,
  MicVocal,
  MoreVertical,
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
  Easing,
  Modal,
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
import { LyricsPanel } from "@/components/LyricsPanel";
import { useLayout } from "@/hooks/useLayout";
import { Event, useTrackPlayerEvents } from "react-native-track-player";

const SWIPE_THRESHOLD = 60;

export default function PlayerScreen() {
  const { width, height, isCompact, topInset, bottomInset } = useLayout();

  const [isScanning,   setIsScanning]   = useState(false);
  const [lyricsOpen,   setLyricsOpen]   = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const {
    currentSong,
    currentArtworkUri,
    songs,
    shuffleEnabled,
    favorites,
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
    toggleFavorite,
    seekTo,
  } = useMusicContext();

  const persistedArtUri   = useRef<string | null>(null);
  const prevSongId        = useRef<string | null>(null);
  const [artworkReady, setArtworkReady] = useState(false);

  if (currentSong?.id !== prevSongId.current) {
    prevSongId.current      = currentSong?.id ?? null;
    persistedArtUri.current = null;
  }
  if (currentArtworkUri) {
    persistedArtUri.current = currentArtworkUri;
  }

  useEffect(() => {
    setArtworkReady(false);
  }, [currentSong?.id]);

  useEffect(() => {
    if (!currentSong) return;
    const t = setTimeout(() => setArtworkReady(true), 80);
    return () => clearTimeout(t);
  }, [currentArtworkUri, currentSong?.id]);

  const displayArtworkUri = artworkReady
    ? currentArtworkUri
    : (currentArtworkUri ?? persistedArtUri.current);

  const isFavorite = currentSong ? favorites.includes(currentSong.uri) : false;

  const handleToggleFavorite = useCallback(() => {
    if (!currentSong) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(currentSong.uri);
  }, [currentSong, toggleFavorite]);

  // ── Native ID3 metadata (from react-native-track-player) ──────────────
  // Raw tags emitted by the audio engine for the currently playing file.
  const [nativeMeta, setNativeMeta] = useState<{ title: string; artist: string | null } | null>(null);

  // ── Lyrics-resolved metadata ────────────────────────────────────────────
  // The title+artist combo that successfully found lyrics — becomes the
  // highest-priority display label once lyrics are located.
  const [lyricsFoundMeta, setLyricsFoundMeta] = useState<{ title: string; artist: string } | null>(null);

  // Clear both on every track change — stale metadata must not bleed
  // into the new track's display or lyrics search.
  useEffect(() => {
    setNativeMeta(null);
    setLyricsFoundMeta(null);
  }, [currentSong?.id]);

  // Listen for native ID3 / common metadata emitted by the audio engine.
  useTrackPlayerEvents([Event.MetadataCommonReceived], (event) => {
    const { title, artist } = event.metadata ?? {};
    if (title) {
      setNativeMeta({ title, artist: artist ?? null });
    }
  });

  // ── Resolved title/artist ──────────────────────────────────────────────
  // Priority:
  //   1. Combo that found lyrics (most accurate for the content)
  //   2. Native ID3 / TrackPlayer event tags
  //   3. Filename parsed as %title%-%artist% (first dash = separator)
  //   4. Entire filename without extension as title
  //   5. "Unknown Artist" if no artist resolved
  const filenameNoExt = currentSong?.filename.replace(/\.[^/.]+$/, "").trim() ?? "";
  const dashIdx = filenameNoExt.indexOf("-");
  const filenameParsedTitle  = dashIdx > 0 ? filenameNoExt.slice(0, dashIdx).trim() : filenameNoExt;
  const filenameParsedArtist = dashIdx > 0 ? filenameNoExt.slice(dashIdx + 1).trim() : "";

  const displayTitle  = lyricsFoundMeta?.title  ?? nativeMeta?.title  ?? filenameParsedTitle;
  const rawArtist     = lyricsFoundMeta?.artist || nativeMeta?.artist || filenameParsedArtist;
  const displayArtist = currentSong ? (rawArtist || "Unknown Artist") : "";

  // ── Artwork size: hero element — 88% of screen width ──────────────────
  const playerArtSize = Math.min(
    Math.floor(width * 0.88),
    Math.floor(height * (isCompact ? 0.44 : 0.54)),
    420,
  );

  // Bottom padding: safe-area only (tab bar is hidden on player screen)
  const playerBottomPad = bottomInset + (isCompact ? 16 : 24);

  // ── Setup-page animations ─────────────────────────────────────────────
  const ring1    = useRef(new Animated.Value(0)).current;
  const ring2    = useRef(new Animated.Value(0)).current;
  const ring3    = useRef(new Animated.Value(0)).current;
  const orbScale = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Idle: staggered expanding rings
  useEffect(() => {
    const DURATION = 2800;
    const STEP = DURATION / 3;
    const makeLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1, duration: DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const l1 = makeLoop(ring1, 0);
    const l2 = makeLoop(ring2, STEP);
    const l3 = makeLoop(ring3, STEP * 2);
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, [ring1, ring2, ring3]);

  // Scanning: continuous spin + gentle breathing scale
  useEffect(() => {
    if (isScanning || isLoading) {
      spinAnim.setValue(0);
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1, duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      spin.start();
      breathe.start();
      return () => { spin.stop(); breathe.stop(); orbScale.setValue(1); };
    }
  }, [isScanning, isLoading, spinAnim, orbScale]);

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

  const handleMore = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDropdownOpen((v) => !v);
  }, []);

  // ── Responsive sizes ───────────────────────────────────────────────────
  const iconSize   = isCompact ? 24 : 28;
  const playBtnSz  = isCompact ? 68 : 76;
  const playIconSz = isCompact ? 30 : 36;

  // ══════════════════════════════════════════════════════════════════════
  // EMPTY STATE — no songs loaded yet
  // ══════════════════════════════════════════════════════════════════════

  // Blank guard only for the initial boot load, not for re-scans.
  // When isScanning is true the setup page shows with its scanning animation.
  if (isLoading && !isScanning) {
    return <View style={{ flex: 1, backgroundColor: Colors.dark.background }} />;
  }

  const isEmpty = !isSetupDone || songs.length === 0;

  if (isEmpty || isScanning) {
    const orbSize  = Math.min(width * 0.62, 240);
    const coreSize = orbSize * 0.48;
    const scanning = isScanning || isLoading;

    // Idle pulse rings
    const makeRingStyle = (anim: Animated.Value) => ({
      opacity:   anim.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [0, 0.55, 0.18, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.85] }) }],
    });

    // Spinning arc for loading
    const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

    return (
      <View style={[styles.setupContainer, { paddingTop: topInset, paddingBottom: playerBottomPad + 16 }]}>

        {/* Caption — centered, changes on scan */}
        <View style={styles.setupHeader}>
          <Text style={[styles.setupTitle, isCompact && styles.setupTitleCompact]}>
            {scanning ? "Finding\nyour music" : "Tap to\nscan"}
          </Text>
          <Text style={styles.setupSubtitle}>
            {scanning ? "Scanning device storage…" : "Tap the orb to scan your device"}
          </Text>
        </View>

        {/* Orb — tappable */}
        <TouchableOpacity
          onPress={handleScan}
          disabled={scanning}
          activeOpacity={0.88}
          style={[styles.setupOrb, { width: orbSize, height: orbSize }]}
        >
          {/* Idle: three staggered pulse rings */}
          {!scanning && (
            <>
              <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring1)]} />
              <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring2)]} />
              <Animated.View style={[styles.ring, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, makeRingStyle(ring3)]} />
            </>
          )}

          {/* Loading: spinning segmented arc */}
          {scanning && (
            <Animated.View
              style={[
                styles.spinArc,
                { width: orbSize, height: orbSize, borderRadius: orbSize / 2 },
                { transform: [{ rotate: spinDeg }] },
              ]}
            />
          )}

          {/* Outer glow halo */}
          <View style={[styles.orbHalo, { width: orbSize * 0.82, height: orbSize * 0.82, borderRadius: orbSize * 0.41 }]} />

          {/* Core — scales while scanning */}
          <Animated.View
            style={[
              styles.orbCore,
              { width: coreSize, height: coreSize, borderRadius: coreSize / 2 },
              { transform: [{ scale: orbScale }] },
              scanning && styles.orbCoreScanning,
            ]}
          >
            {/* Inner bright nucleus */}
            <View
              style={[
                styles.orbNucleus,
                {
                  width: coreSize * 0.46,
                  height: coreSize * 0.46,
                  borderRadius: coreSize * 0.23,
                },
                scanning && styles.orbNucleusScanning,
              ]}
            />
            {/* Icon */}
            <ScanSearch
              size={coreSize * 0.3}
              color={scanning ? "#fff" : "rgba(255,255,255,0.7)"}
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Hint label at bottom */}
        <Text style={styles.setupHint}>
          {scanning ? "" : "Reads metadata from audio files on your device"}
        </Text>

      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // PLAYER — songs available
  // ══════════════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Ambient blurred artwork background ── */}
      {displayArtworkUri && (
        <Image
          source={{ uri: displayArtworkUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      )}
      <BlurView
        intensity={100}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.ambientOverlay]}
      />

      {/* ── Top bar: chevron-down (→ Library) | more ── */}
      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <TouchableOpacity
          onPress={() => router.navigate("/(tabs)/library")}
          style={styles.utilBtnSmall}
          activeOpacity={0.6}
          hitSlop={10}
        >
          <ChevronDown size={22} color={Colors.dark.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleMore}
          style={styles.utilBtnSmall}
          activeOpacity={0.6}
          hitSlop={10}
        >
          <MoreVertical size={20} color={Colors.dark.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Dropdown options menu ── */}
      {dropdownOpen && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setDropdownOpen(false)}
            activeOpacity={1}
          />
          <View style={[styles.dropdown, { top: topInset + 44 }]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => { setDropdownOpen(false); handleScan(); }}
              activeOpacity={0.7}
            >
              <ScanSearch size={15} color="#fff" />
              <Text style={styles.dropdownText}>Scan library</Text>
            </TouchableOpacity>
            <View style={styles.dropdownSep} />
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => { setDropdownOpen(false); handleClearAll(); }}
              activeOpacity={0.7}
            >
              <Trash2 size={15} color={Colors.dark.danger} />
              <Text style={[styles.dropdownText, styles.dropdownTextDanger]}>Clear all songs</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Artwork — hero element ── */}
      <View style={styles.artOuter}>
        <Animated.View
          style={{
            width: playerArtSize,
            height: playerArtSize,
            transform: [{ translateX: slideX }],
            opacity: slideOpacity,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.65,
            shadowRadius: 40,
            elevation: 24,
          }}
          {...panResponder.panHandlers}
        >
          <SongArtwork
            artworkUri={displayArtworkUri}
            size={playerArtSize}
            borderRadius={24}
          />

          {/* ── Artwork quick-edit button — glassmorphism, bottom-right ── */}
          <TouchableOpacity
            style={styles.artEditBtnWrap}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/images");
            }}
            activeOpacity={0.8}
            hitSlop={14}
          >
            <BlurView intensity={50} tint="dark" style={styles.artEditBtn}>
              <ImageIcon size={14} color="#fff" />
            </BlurView>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Song info + heart + shuffle ── */}
      <View style={[styles.infoRow, isCompact && styles.infoRowCompact]}>
        <View style={styles.infoText}>
          <Text style={[styles.songTitle, isCompact && styles.songTitleCompact]} numberOfLines={1}>
            {displayTitle || "—"}
          </Text>
          <Text style={[styles.songArtist, isCompact && styles.songArtistCompact]} numberOfLines={1}>
            {displayArtist || `${songs.length} songs`}
          </Text>
        </View>

        {/* Heart / favourite button */}
        <TouchableOpacity
          onPress={handleToggleFavorite}
          style={styles.heartBtn}
          activeOpacity={0.7}
          hitSlop={10}
        >
          <Heart
            size={isCompact ? 20 : 22}
            color={isFavorite ? Colors.dark.accent : "rgba(255,255,255,0.45)"}
            fill={isFavorite ? Colors.dark.accent : "none"}
            strokeWidth={isFavorite ? 0 : 1.8}
          />
        </TouchableOpacity>

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
      <View style={styles.controls}>
        <TouchableOpacity onPress={handlePrev} style={styles.skipBtn} activeOpacity={0.65} hitSlop={8}>
          <SkipBack size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.82}
          style={[styles.playBtn, { width: playBtnSz, height: playBtnSz, borderRadius: playBtnSz / 2 }]}
        >
          {status.playing ? (
            <Pause size={playIconSz} color="#fff" fill="#fff" />
          ) : (
            <Play size={playIconSz} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={styles.skipBtn} activeOpacity={0.65} hitSlop={8}>
          <SkipForward size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>
      </View>

      {/* ── Lyrics strip ── */}
      <TouchableOpacity
        style={[styles.lyricsStrip, { marginBottom: playerBottomPad }]}
        onPress={() => setLyricsOpen(true)}
        activeOpacity={0.75}
      >
        <MicVocal size={12} color={Colors.dark.textTertiary} />
        <Text style={styles.lyricsStripLabel}>LYRICS</Text>
        <ChevronUp size={12} color={Colors.dark.textTertiary} />
      </TouchableOpacity>

      {/* ── Lyrics modal sheet ── */}
      <Modal
        visible={lyricsOpen}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setLyricsOpen(false)}
      >
        {/* Dimmed backdrop */}
        <TouchableOpacity
          style={styles.lyricsBackdrop}
          activeOpacity={1}
          onPress={() => setLyricsOpen(false)}
        />

        {/* Sheet */}
        <View style={[styles.lyricsSheet, { height: height * 0.62, paddingBottom: bottomInset }]}>
          {/* Drag handle */}
          <View style={styles.lyricsHandle} />

          {/* Header */}
          <View style={styles.lyricsSheetHeader}>
            <Text style={styles.lyricsSheetTitle}>Lyrics</Text>
            <TouchableOpacity onPress={() => setLyricsOpen(false)} hitSlop={12}>
              <Text style={styles.lyricsDoneBtn}>Done</Text>
            </TouchableOpacity>
          </View>

          {currentSong ? (
            <LyricsPanel
              filename={currentSong.filename}
              nativeTitle={nativeMeta?.title ?? null}
              nativeArtist={nativeMeta?.artist ?? null}
              trackId={currentSong.id}
              position={status.currentTime ?? 0}
              onMetaResolved={(t, a) => setLyricsFoundMeta({ title: t, artist: a })}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: Colors.dark.textTertiary, fontFamily: "Inter_400Regular" }}>
                No song playing
              </Text>
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // ── Ambient overlay — extra darkening so text stays legible ──────────
  ambientOverlay: {
    backgroundColor: "rgba(0,0,0,0.40)",
  },

  // ── Top bar ──────────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  topBarCompact: { paddingTop: 2, paddingBottom: 1 },

  utilBtnSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Artwork hero ──────────────────────────────────────────────────────
  artOuter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  // Image gallery edit button — wrapper (for hitSlop)
  artEditBtnWrap: {
    position: "absolute",
    bottom: 14,
    right: 14,
    zIndex: 10,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  // BlurView container inside the edit button
  artEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  // ── Options dropdown ──────────────────────────────────────────────────
  dropdown: {
    position: "absolute",
    right: 12,
    width: 200,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    zIndex: 200,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  dropdownText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  dropdownTextDanger: {
    color: Colors.dark.danger,
  },
  dropdownSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 12,
  },

  // ── Song info ─────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    marginTop: 8,
    marginBottom: 8,
    gap: 12,
  },
  infoRowCompact: { marginTop: 4, marginBottom: 4 },
  infoText: { flex: 1 },

  songTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.5,
  },
  songTitleCompact: { fontSize: 22 },
  songArtist: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    marginTop: 5,
  },
  songArtistCompact: { fontSize: 14, marginTop: 3 },

  heartBtn: { padding: 6, alignItems: "center", justifyContent: "center" },
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
  seekSection: { paddingHorizontal: 20, marginBottom: 10 },
  seekSectionCompact: { marginBottom: 6 },

  // ── Controls ──────────────────────────────────────────────────────────
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 6,
    gap: 36,
  },

  // ── Lyrics strip (tap to open sheet) ─────────────────────────────────
  lyricsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 52,
    marginTop: 20,
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.borderLight,
  },
  lyricsStripLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },

  // ── Lyrics bottom sheet ───────────────────────────────────────────────
  lyricsBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  lyricsSheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
    overflow: "hidden",
  },
  lyricsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  lyricsSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  lyricsSheetTitle: {
    color: Colors.dark.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  lyricsDoneBtn: {
    color: Colors.dark.accent,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  skipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  playBtn: {
    backgroundColor: "#FF8C00",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF8C00",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 12,
  },

  // ══ Setup / empty state ═══════════════════════════════════════════════
  setupContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "space-between",
  },

  setupHeader: {
    alignSelf: "stretch",
    paddingHorizontal: 32,
    paddingTop: 16,
    gap: 10,
  },
  setupTitle: {
    color: Colors.dark.text,
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  setupTitleCompact: { fontSize: 32, lineHeight: 38 },
  setupSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
  },

  setupOrb: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },

  // Idle pulse rings — fade-expand outward
  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
  },

  // Loading: spinning dashed arc
  spinArc: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: "transparent",
    borderTopColor: Colors.dark.accent,
    borderRightColor: "rgba(232,112,42,0.4)",
  },

  // Soft halo behind core
  orbHalo: {
    position: "absolute",
    backgroundColor: "rgba(232,112,42,0.07)",
    borderWidth: 1,
    borderColor: "rgba(232,112,42,0.18)",
  },

  // Glassy core circle
  orbCore: {
    backgroundColor: "rgba(232,112,42,0.20)",
    borderWidth: 1.5,
    borderColor: "rgba(232,112,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 10,
  },
  orbCoreScanning: {
    backgroundColor: "rgba(232,112,42,0.38)",
    borderColor: Colors.dark.accent,
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },

  // Bright nucleus dot
  orbNucleus: {
    position: "absolute",
    backgroundColor: "rgba(232,112,42,0.30)",
  },
  orbNucleusScanning: {
    backgroundColor: "rgba(232,112,42,0.55)",
  },

  setupHint: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
    textAlign: "center",
    paddingHorizontal: 40,
    minHeight: 16,
  },

});
