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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { SongArtwork } from "@/components/SongArtwork";
import { SeekBar } from "@/components/SeekBar";
import { SetupScreen } from "@/components/SetupScreen";
import { useLayout } from "@/hooks/useLayout";

const SWIPE_THRESHOLD = 60;

export default function PlayerScreen() {
  const {
    width,
    isCompact,
    topInset,
    artSize,
    artPadV,
    controlsBottomPad,
    fontScale,
  } = useLayout();

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

  // ── Animated values ───────────────────────────────────────────────────
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // ── Stable refs for PanResponder callbacks ────────────────────────────
  const playNextRef = useRef(playNext);
  const playPrevRef = useRef(playPrev);

  useEffect(() => {
    playNextRef.current = playNext;
    playPrevRef.current = playPrev;
  }, [playNext, playPrev]);

  useEffect(() => {
    if (!isSetupDone || !currentSong || hasAutoPlayed.current) return;
    if (status.playing) {
      hasAutoPlayed.current = true;
      return;
    }
    hasAutoPlayed.current = true;
    togglePlayPause();
  }, [isSetupDone, currentSong]); // togglePlayPause intentionally omitted

  // ── Helpers ───────────────────────────────────────────────────────────
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

  // ── Early return AFTER all hooks ──────────────────────────────────────
  if (!isSetupDone) {
    return (
      <SetupScreen onScan={handleScan} isLoading={isScanning || isLoading} />
    );
  }

  // ── Responsive sizes ──────────────────────────────────────────────────
  const titleSize = Math.round(22 * fontScale);
  const artistSize = Math.round(14 * fontScale);
  const iconSize = isCompact ? 24 : 28;
  const playBtnSize = isCompact ? 56 : 64;
  const playIconSize = isCompact ? 28 : 32;

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

      {/* Artwork — fills remaining flex space, centered */}
      <View style={[styles.artWrapper, { paddingVertical: artPadV }]}>
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
      <View style={[styles.infoRow, isCompact && styles.infoRowCompact]}>
        <View style={styles.infoText}>
          <Text
            style={[styles.songTitle, { fontSize: titleSize }]}
            numberOfLines={1}
          >
            {currentSong?.title ?? (songs.length > 0 ? "—" : "No songs")}
          </Text>
          <Text
            style={[styles.songArtist, { fontSize: artistSize }]}
            numberOfLines={1}
          >
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
            size={isCompact ? 18 : 20}
            color={
              shuffleEnabled ? Colors.dark.accent : Colors.dark.textTertiary
            }
          />
        </TouchableOpacity>
      </View>

      {/* Seek bar */}
      <View style={[styles.seekSection, isCompact && styles.seekSectionCompact]}>
        <SeekBar
          duration={status.duration ?? 0}
          position={status.currentTime ?? 0}
          onSeek={seekTo}
        />
      </View>

      {/* Playback controls */}
      <View style={[styles.controls, { paddingBottom: controlsBottomPad }]}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.controlBtn}
          activeOpacity={0.7}
        >
          <SkipBack size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.85}
          style={[
            styles.playBtn,
            { width: playBtnSize, height: playBtnSize, borderRadius: playBtnSize / 2 },
          ]}
        >
          {status.playing ? (
            <Pause
              size={playIconSize}
              color={Colors.dark.background}
              fill={Colors.dark.background}
            />
          ) : (
            <Play
              size={playIconSize}
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
          <SkipForward size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
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
  infoRowCompact: {
    marginBottom: 2,
  },
  infoText: { flex: 1 },
  songTitle: {
    color: Colors.dark.text,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  songArtist: {
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
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
  seekSectionCompact: {
    marginBottom: 4,
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
    backgroundColor: Colors.dark.text,
    alignItems: "center",
    justifyContent: "center",
  },
});
