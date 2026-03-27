import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Animated,
  FlatList,
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
import { QueueSheet } from "@/components/QueueSheet";

const SWIPE_THRESHOLD = 60; // px needed to trigger skip

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [showQueue, setShowQueue] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const {
    currentSong,
    queue,
    currentIndex,
    songs,
    shuffleEnabled,
    status,
    imagePool,
    isLoading,
    isSetupDone,
    SAF_AVAILABLE,
    pickMusicFolder,
    addMoreSongs,
    rescanFolder,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    seekTo,
    playSong,
  } = useMusicContext();

  const artSize = Math.min(width - 64, 320);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Swipe gesture on artwork ─────────────────────────────────────────────
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // Keep fresh refs so panResponder (created once) always calls latest playback fns
  const playNextRef = useRef(playNext);
  const playPrevRef = useRef(playPrev);
  useEffect(() => { playNextRef.current = playNext; playPrevRef.current = playPrev; }, [playNext, playPrev]);

  function animateSongChange(direction: "left" | "right", onComplete: () => void) {
    // Slide and fade out in swipe direction
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: direction === "left" ? -width : width,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(slideOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
      // Snap to opposite side
      slideX.setValue(direction === "left" ? width : -width);
      slideOpacity.setValue(0);
      // Slide in
      Animated.parallel([
        Animated.spring(slideX, {
          toValue: 0,
          speed: 20,
          bounciness: 4,
          useNativeDriver: true,
        }),
        Animated.timing(slideOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        slideX.setValue(dx * 0.4); // subtle follow
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx > SWIPE_THRESHOLD) {
          // Left-to-right → next song (as user specified)
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("right", () => playNextRef.current());
        } else if (dx < -SWIPE_THRESHOLD) {
          // Right-to-left → previous song
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateSongChange("left", () => playPrevRef.current());
        } else {
          // Snap back if not far enough
          Animated.spring(slideX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // ── Folder pick ──────────────────────────────────────────────────────────
  const handlePickFolder = useCallback(async () => {
    setIsPickingFolder(true);
    try {
      await pickMusicFolder();
    } catch (e) {
      console.error("handlePickFolder error", e);
    } finally {
      setIsPickingFolder(false);
    }
    return true;
  }, [pickMusicFolder]);

  const handleTopAction = useCallback(() => {
    if (SAF_AVAILABLE) rescanFolder();
    else addMoreSongs();
  }, [SAF_AVAILABLE, rescanFolder, addMoreSongs]);

  // ── Playback controls ────────────────────────────────────────────────────
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
    return (
      <SetupScreen
        onPickFolder={handlePickFolder}
        isLoading={isPickingFolder || isLoading}
        safAvailable={SAF_AVAILABLE}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundTertiary, Colors.dark.background]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleTopAction} style={styles.iconButton} activeOpacity={0.7}>
          <Feather
            name={SAF_AVAILABLE ? "refresh-cw" : "plus-circle"}
            size={20}
            color={Colors.dark.textSecondary}
          />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Now Playing</Text>
        <TouchableOpacity onPress={() => setShowQueue(true)} style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="list" size={22} color={Colors.dark.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Artwork — swipeable */}
      <View style={styles.artWrapper}>
        <Animated.View
          style={[
            styles.artShadow,
            {
              width: artSize,
              height: artSize,
              borderRadius: 20,
              transform: [{ translateX: slideX }],
              opacity: slideOpacity,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <SongArtwork
            imagePool={imagePool}
            songId={currentSong?.id}
            size={artSize}
            borderRadius={20}
          />

          {/* Swipe hint arrows */}
          <View style={styles.swipeHintRow} pointerEvents="none">
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.25)" />
            <Text style={styles.swipeHint}>swipe to skip</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.25)" />
          </View>
        </Animated.View>
      </View>

      {/* Song info */}
      <View style={styles.infoSection}>
        {currentSong ? (
          <>
            <Text style={styles.songTitle} numberOfLines={1}>{currentSong.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
          </>
        ) : (
          <>
            <Text style={styles.songTitle}>No song selected</Text>
            <Text style={styles.songArtist}>{songs.length} songs loaded — tap one in the queue</Text>
          </>
        )}
      </View>

      {/* Seek bar */}
      <View style={styles.seekSection}>
        <SeekBar
          duration={status.duration ?? 0}
          position={status.currentTime ?? 0}
          onSeek={seekTo}
        />
      </View>

      {/* Playback controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={handleShuffle} style={styles.controlIconBtn} activeOpacity={0.7}>
          <Ionicons
            name="shuffle"
            size={24}
            color={shuffleEnabled ? Colors.dark.accent : Colors.dark.textTertiary}
          />
          {shuffleEnabled && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePrev} style={styles.controlIconBtn} activeOpacity={0.7}>
          <Ionicons name="play-skip-back" size={32} color={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePlayPause} activeOpacity={0.8} style={styles.playBtn}>
          <LinearGradient
            colors={[Colors.dark.accent, Colors.dark.accentDark]}
            style={styles.playBtnGradient}
          >
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={34}
              color="#fff"
              style={{ marginLeft: status.playing ? 0 : 3 }}
            />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={styles.controlIconBtn} activeOpacity={0.7}>
          <Ionicons name="play-skip-forward" size={32} color={Colors.dark.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowQueue(true)} style={styles.controlIconBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="playlist-music" size={26} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Queue preview */}
      <View style={[styles.queuePreview, { paddingBottom: bottomInset + 16 }]}>
        <Text style={styles.queueLabel}>Up Next</Text>
        <FlatList
          data={queue.slice(currentIndex + 1, currentIndex + 4)}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.miniSongRow}
              onPress={() => {
                const idx = queue.findIndex((s) => s.id === item.id);
                playSong(item, queue, idx);
              }}
              activeOpacity={0.7}
            >
              <SongArtwork imagePool={imagePool} songId={item.id} size={36} borderRadius={6} />
              <View style={styles.miniSongInfo}>
                <Text style={styles.miniSongTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.miniSongArtist} numberOfLines={1}>{item.artist}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <Text style={styles.emptyQueue}>No more songs in queue</Text>
          )}
        />
      </View>

      <QueueSheet
        visible={showQueue}
        onClose={() => setShowQueue(false)}
        queue={queue}
        currentIndex={currentIndex}
        imagePool={imagePool}
        onSelectSong={(song, index) => {
          playSong(song, queue, index);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  artWrapper: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  artShadow: {
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 16,
    overflow: "hidden",
  },
  swipeHintRow: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  swipeHint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Inter_400Regular",
  },
  infoSection: { paddingHorizontal: 32, marginTop: 20, marginBottom: 8, gap: 6 },
  songTitle: { color: Colors.dark.text, fontSize: 22, fontFamily: "Inter_700Bold" },
  songArtist: { color: Colors.dark.textSecondary, fontSize: 15, fontFamily: "Inter_400Regular" },
  seekSection: { paddingHorizontal: 28, marginVertical: 8 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    marginTop: 12,
    marginBottom: 16,
  },
  controlIconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
    position: "absolute",
    bottom: 6,
  },
  playBtn: {
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  playBtnGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  queuePreview: {
    flex: 1,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 16,
  },
  queueLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  miniSongRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  miniSongInfo: { flex: 1 },
  miniSongTitle: { color: Colors.dark.textSecondary, fontSize: 14, fontFamily: "Inter_500Medium" },
  miniSongArtist: { color: Colors.dark.textTertiary, fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyQueue: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
