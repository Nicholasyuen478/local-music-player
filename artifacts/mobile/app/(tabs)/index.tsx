import * as Haptics from "expo-haptics";
import {
  Pause,
  Play,
  ScanSearch,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react-native";
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { SongArtwork } from "@/components/SongArtwork";
import { SeekBar } from "@/components/SeekBar";
import { SetupScreen } from "@/components/SetupScreen";

const SWIPE_THRESHOLD = 60;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [isScanning, setIsScanning] = useState(false);
  const hasAutoPlayed = useRef(false);

  const {
    currentSong,
    queue,
    songs,
    shuffleEnabled,
    status,
    imagePool,
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

  // ── Derived values (no hooks, safe anywhere) ─────────────────────────
  const artSize = Math.min(width - 48, 340);
  const topInset = Platform.OS === "web" ? 48 : insets.top;
  const bottomInset = Platform.OS === "web" ? 90 : insets.bottom;

  // ── Animated values ───────────────────────────────────────────────────
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // ── Stable refs for PanResponder callbacks ────────────────────────────
  const playNextRef = useRef(playNext);
  const playPrevRef = useRef(playPrev);

  // ✅ HOOK — must be above early return
  useEffect(() => {
    playNextRef.current = playNext;
    playPrevRef.current = playPrev;
  }, [playNext, playPrev]);

  // ✅ HOOK — auto-play on first load (moved above early return)
  useEffect(() => {
    if (!isSetupDone || !currentSong || hasAutoPlayed.current) return;
    if (status.playing) {
      hasAutoPlayed.current = true;
      return;
    }
    hasAutoPlayed.current = true;
    togglePlayPause();
  }, [isSetupDone, currentSong]); // togglePlayPause intentionally omitted

  // ── Helpers (not hooks) ───────────────────────────────────────────────
  function animateSongChange(
    direction: "left" | "right",
    onComplete: () => void,
  ) {
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: direction === "left" ? -width : width,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
      slideX.setValue(direction === "left" ? width : -width);
      slideOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slideX, {
          toValue: 0,
          speed: 22,
          bounciness: 3,
          useNativeDriver: true,
        }),
        Animated.timing(slideOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  // ── PanResponder (useRef is a hook — already at top level via .current) ──
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        slideX.setValue(dx * 0.35);
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx > SWIPE_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("right", () => playPrevRef.current());
        } else if (dx < -SWIPE_THRESHOLD) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("left", () => playNextRef.current());
        } else {
          Animated.spring(slideX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // ── Callbacks ─────────────────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    Alert.alert("Clear library", "Remove all songs and return to setup?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
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
        Alert.alert(
          "Add artwork",
          "Pick images from your gallery to use as song artwork?",
          [
            { text: "Skip", style: "cancel" },
            {
              text: "Choose images",
              onPress: async () => {
                await pickImageFolder();
              },
            },
          ],
        );
      }
    } catch (e) {
      console.error("scan error", e);
    } finally {
      setIsScanning(false);
    }
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

  // ✅ Early return AFTER all hooks
  if (!isSetupDone) {
    return (
      <SetupScreen onScan={handleScan} isLoading={isScanning || isLoading} />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Top utility bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleClearAll}
          style={styles.iconBtn}
          activeOpacity={0.6}
        >
          <Trash2 size={18} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleScan}
          style={styles.iconBtn}
          activeOpacity={0.6}
          disabled={isScanning}
        >
          <ScanSearch
            size={18}
            color={isScanning ? Colors.dark.accent : Colors.dark.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* Artwork */}
      <View style={styles.artWrapper}>
        <Animated.View
          style={{
            width: artSize,
            height: artSize,
            transform: [{ translateX: slideX }],
            opacity: slideOpacity,
            borderRadius: 4,
            overflow: "hidden",
          }}
          {...panResponder.panHandlers}
        >
          <SongArtwork
            imagePool={imagePool}
            songId={currentSong?.id}
            size={artSize}
            borderRadius={4}
          />
        </Animated.View>
      </View>

      {/* Song info */}
      <View style={styles.infoRow}>
        <View style={styles.infoText}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {currentSong?.title ?? (songs.length > 0 ? "—" : "No songs")}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {currentSong?.artist ??
              (songs.length > 0 ? `${songs.length} songs` : "")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleShuffle}
          style={styles.shuffleBtn}
          activeOpacity={0.7}
        >
          <Shuffle
            size={20}
            color={
              shuffleEnabled ? Colors.dark.accent : Colors.dark.textTertiary
            }
          />
        </TouchableOpacity>
      </View>

      {/* Seek bar */}
      <View style={styles.seekSection}>
        <SeekBar
          duration={status.duration ?? 0}
          position={status.currentTime ?? 0}
          onSeek={seekTo}
        />
      </View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: bottomInset + 80 }]}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.controlBtn}
          activeOpacity={0.7}
        >
          <SkipBack
            size={28}
            color={Colors.dark.text}
            fill={Colors.dark.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.85}
          style={styles.playBtn}
        >
          {status.playing ? (
            <Pause
              size={32}
              color={Colors.dark.background}
              fill={Colors.dark.background}
            />
          ) : (
            <Play
              size={32}
              color={Colors.dark.background}
              fill={Colors.dark.background}
              style={{ marginLeft: 3 }}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          style={styles.controlBtn}
          activeOpacity={0.7}
        >
          <SkipForward
            size={28}
            color={Colors.dark.text}
            fill={Colors.dark.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  artWrapper: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    flex: 1,
    justifyContent: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 4,
    gap: 12,
  },
  infoText: { flex: 1 },
  songTitle: {
    color: Colors.dark.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  songArtist: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  shuffleBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  seekSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 40,
  },
  controlBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.text,
    alignItems: "center",
    justifyContent: "center",
  },
});