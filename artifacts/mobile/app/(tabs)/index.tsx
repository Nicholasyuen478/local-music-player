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

  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const playNextRef = useRef(playNext);
  const playPrevRef = useRef(playPrev);
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

  if (!isSetupDone) {
    return <SetupScreen onScan={handleScan} isLoading={isScanning || isLoading} />;
  }

  const titleSize  = Math.round(22 * fontScale);
  const artistSize = Math.round(14 * fontScale);
  const iconSize   = isCompact ? 24 : 28;
  const playBtnSz  = isCompact ? 60 : 70;
  const playIconSz = isCompact ? 28 : 34;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Top utility bar ── */}
      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <TouchableOpacity
          onPress={handleClearAll}
          style={styles.utilBtn}
          activeOpacity={0.6}
          hitSlop={8}
        >
          <Trash2 size={17} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleScan}
          style={styles.utilBtn}
          activeOpacity={0.6}
          disabled={isScanning}
          hitSlop={8}
        >
          <ScanSearch
            size={17}
            color={isScanning ? Colors.dark.accent : Colors.dark.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Artwork ── */}
      <View style={[styles.artWrapper, { paddingVertical: artPadV }]}>
        <Animated.View
          style={{
            width: artSize,
            height: artSize,
            transform: [{ translateX: slideX }],
            opacity: slideOpacity,
            borderRadius: 20,
            overflow: "hidden",
            // Subtle shadow for depth
            shadowColor: Colors.dark.accent,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 12,
          }}
          {...panResponder.panHandlers}
        >
          <SongArtwork
            artworkUri={currentArtworkUri}
            size={artSize}
            borderRadius={20}
          />
        </Animated.View>
      </View>

      {/* ── Song info + shuffle ── */}
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
            {currentSong?.artist ?? (songs.length > 0 ? `${songs.length} songs` : "")}
          </Text>
        </View>

        {/* Shuffle button — shows indicator dot when active */}
        <View style={styles.shuffleWrap}>
          <TouchableOpacity
            onPress={handleShuffle}
            style={[
              styles.shuffleBtn,
              shuffleEnabled && styles.shuffleBtnActive,
            ]}
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
      <View style={[styles.controls, { paddingBottom: controlsBottomPad }]}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.skipBtn}
          activeOpacity={0.65}
          hitSlop={8}
        >
          <SkipBack size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.82}
          style={[
            styles.playBtn,
            { width: playBtnSz, height: playBtnSz, borderRadius: playBtnSz / 2 },
          ]}
        >
          {status.playing ? (
            <Pause size={playIconSz} color={Colors.dark.background} fill={Colors.dark.background} />
          ) : (
            <Play size={playIconSz} color={Colors.dark.background} fill={Colors.dark.background} style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          style={styles.skipBtn}
          activeOpacity={0.65}
          hitSlop={8}
        >
          <SkipForward size={iconSize} color={Colors.dark.text} fill={Colors.dark.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 4,
  },
  topBarCompact: { paddingTop: 2, paddingBottom: 2 },

  utilBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },

  artWrapper: {
    alignItems: "center",
    paddingHorizontal: 20,
    flex: 1,
    justifyContent: "center",
  },

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

  shuffleWrap: {
    alignItems: "center",
  },
  shuffleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  shuffleBtnActive: {
    backgroundColor: Colors.dark.accentDim,
  },
  shuffleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
    marginTop: 2,
  },

  seekSection: {
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  seekSectionCompact: { marginBottom: 2 },

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
    // Shadow on play button
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
});
