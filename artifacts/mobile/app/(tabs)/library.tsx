import * as Haptics from "expo-haptics";
import {
  Check,
  ListMusic,
  Music2,
  Search,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import type { Song } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";
import QueuePanel from "@/components/QueuePanel";

// ── Alphabet index bar ────────────────────────────────────────────────────────
const LETTERS = [
  "#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
];
const STRIP_W = 18;
const BUBBLE_SIZE = 42;

function firstLetterKey(title: string): string {
  const ch = title.trim()[0]?.toUpperCase() ?? "";
  return /^[A-Z]$/.test(ch) ? ch : "#";
}

export default function LibraryScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const {
    songs,      // A-Z sorted master list — what the library displays
    currentSong,
    isSetupDone,
    playSongFromLibrary,
    removeSongs,
  } = useMusicContext();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [bubbleY, setBubbleY] = useState(0);

  const listRef = useRef<FlatList>(null);
  const isListReady = useRef(false);
  const searchRef = useRef<TextInput>(null);

  // Alpha strip height from onLayout — no measure() needed
  const stripHeightRef = useRef(0);
  const lastHapticLetter = useRef<string | null>(null);

  const itemHeight = isCompact ? 52 : 56;

  // ── Filtered list for search ──────────────────────────────────────────────
  // Library always shows songs sorted A-Z (songs is the master A-Z list).
  const displayedSongs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q),
    );
  }, [songs, searchText]);

  // Alpha bar is always visible when the library is shown without a search
  // (songs are always A-Z so jumping by letter always makes sense)
  const showAlphaBar = !searchActive && displayedSongs.length > 0;

  // ── Section map: first display-index per starting letter ─────────────────
  const sectionMap = useMemo(() => {
    const map = new Map<string, number>();
    displayedSongs.forEach((song, idx) => {
      const letter = firstLetterKey(song.title);
      if (!map.has(letter)) map.set(letter, idx);
    });
    return map;
  }, [displayedSongs]);

  const availableLetters = useMemo(
    () => new Set(sectionMap.keys()),
    [sectionMap],
  );

  const sectionMapRef = useRef(sectionMap);
  sectionMapRef.current = sectionMap;

  // ── Select mode ───────────────────────────────────────────────────────────
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleLongPress = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handlePress = useCallback(
    (item: Song) => {
      if (selectMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          if (next.size === 0) setSelectMode(false);
          return next;
        });
      } else {
        playSongFromLibrary(item);
      }
    },
    [selectMode, playSongFromLibrary],
  );

  const handleRemove = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(`Remove ${count} song${count > 1 ? "s" : ""}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeSongs([...selectedIds]);
          exitSelectMode();
        },
      },
    ]);
  }, [selectedIds, removeSongs, exitSelectMode]);

  // ── Search helpers ────────────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setSearchActive(true);
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
    searchRef.current?.blur();
  }, []);

  // ── Auto-scroll to current song in library (A-Z) ─────────────────────────
  const scrollToCurrent = useCallback(() => {
    if (selectMode || searchActive) return;
    if (!listRef.current || !isListReady.current || !currentSong) return;
    const idx = songs.findIndex((s) => s.id === currentSong.id);
    if (idx > 0) {
      listRef.current.scrollToIndex({
        index: Math.max(0, idx - 2),
        animated: true,
      });
    }
  }, [songs, currentSong, selectMode, searchActive]);

  const handleListLayout = useCallback(() => {
    isListReady.current = true;
    scrollToCurrent();
  }, [scrollToCurrent]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(scrollToCurrent, 100);
      return () => clearTimeout(timer);
    }, [scrollToCurrent]),
  );

  // ── Alpha strip gesture ───────────────────────────────────────────────────
  const handleStripTouch = useCallback(
    (locationY: number) => {
      if (stripHeightRef.current === 0) return;
      const ratio = Math.max(0, Math.min(1, locationY / stripHeightRef.current));
      const idx = Math.min(
        Math.floor(ratio * LETTERS.length),
        LETTERS.length - 1,
      );
      const letter = LETTERS[idx];

      if (letter !== lastHapticLetter.current) {
        lastHapticLetter.current = letter;
        if (sectionMapRef.current.has(letter)) Haptics.selectionAsync();
      }

      setActiveLetter(letter);
      setBubbleY(Math.max(0, locationY - BUBBLE_SIZE / 2));

      const targetIdx = sectionMapRef.current.get(letter);
      if (targetIdx !== undefined) {
        listRef.current?.scrollToIndex({ index: targetIdx, animated: false });
      }
    },
    [],
  );

  const handleStripTouchRef = useRef(handleStripTouch);
  handleStripTouchRef.current = handleStripTouch;

  const stripPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        handleStripTouchRef.current(e.nativeEvent.locationY),
      onPanResponderMove: (e) =>
        handleStripTouchRef.current(e.nativeEvent.locationY),
      onPanResponderRelease: () => {
        setActiveLetter(null);
        lastHapticLetter.current = null;
      },
      onPanResponderTerminate: () => {
        setActiveLetter(null);
        lastHapticLetter.current = null;
      },
    }),
  ).current;

  // ── Song row ──────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Song }) => {
      const isActive = item.id === currentSong?.id;
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          style={[
            styles.row,
            { height: itemHeight, paddingVertical: isCompact ? 8 : 10 },
            isActive && !selectMode && styles.rowActive,
            isSelected && styles.rowSelected,
          ]}
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={350}
          activeOpacity={0.6}
        >
          {selectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Check size={11} color="#000" strokeWidth={3} />}
            </View>
          )}
          <View style={styles.rowText}>
            <Text
              style={[
                styles.title,
                isActive && !selectMode && styles.titleActive,
                isCompact && styles.titleCompact,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[styles.artist, isCompact && styles.artistCompact]}
              numberOfLines={1}
            >
              {item.artist}
            </Text>
          </View>
          {isActive && !selectMode && <View style={styles.activeBar} />}
        </TouchableOpacity>
      );
    },
    [
      currentSong, selectedIds, selectMode,
      handlePress, handleLongPress, itemHeight, isCompact,
    ],
  );

  const listBottomPad = bottomInset + tabBarH + 16 + (selectMode ? 72 : 0);
  const letterSize = isCompact ? 9 : 10;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Header ── */}
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        {selectMode ? (
          <>
            <Text style={styles.headerCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={exitSelectMode} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.headerCount}>
              {songs.length > 0
                ? searchActive && displayedSongs.length !== songs.length
                  ? `${displayedSongs.length} of ${songs.length} songs`
                  : `${songs.length} songs`
                : ""}
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={openSearch}
                style={styles.headerBtn}
                hitSlop={8}
              >
                <Search
                  size={isCompact ? 16 : 18}
                  color={Colors.dark.textTertiary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowQueue(true)}
                style={styles.headerBtn}
                hitSlop={8}
              >
                <ListMusic
                  size={isCompact ? 16 : 18}
                  color={Colors.dark.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Search bar ── */}
      {searchActive && (
        <View style={[styles.searchRow, isCompact && styles.searchRowCompact]}>
          <Search size={14} color={Colors.dark.textTertiary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, isCompact && styles.searchInputCompact]}
            placeholder="Song title or artist…"
            placeholderTextColor={Colors.dark.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={closeSearch} hitSlop={8}>
            <X size={16} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {!isSetupDone || songs.length === 0 ? (
        <View style={styles.empty}>
          <Music2 size={40} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No songs loaded</Text>
        </View>
      ) : displayedSongs.length === 0 ? (
        <View style={styles.empty}>
          <Search size={36} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No results for "{searchText}"</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingBottom: listBottomPad,
            paddingRight: showAlphaBar ? STRIP_W + 4 : 0,
          }}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: itemHeight,
            offset: itemHeight * index,
            index,
          })}
          onLayout={handleListLayout}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: Math.max(0, index - 2),
                animated: false,
              });
            }, 100);
          }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Alphabet index strip (always shown when not searching) ── */}
      {showAlphaBar && (
        <View
          style={styles.alphaStrip}
          onLayout={(e) => {
            stripHeightRef.current = e.nativeEvent.layout.height;
          }}
          {...stripPanResponder.panHandlers}
        >
          {LETTERS.map((letter) => {
            const available = availableLetters.has(letter);
            const isActive = activeLetter === letter;
            return (
              <View key={letter} style={styles.alphaSlot}>
                {isActive ? (
                  <View style={styles.alphaDot} />
                ) : (
                  <Text
                    style={[
                      styles.alphaLetter,
                      { fontSize: letterSize },
                      available ? styles.alphaAvailable : styles.alphaUnavailable,
                    ]}
                  >
                    {letter}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Letter bubble — floats beside the strip while dragging */}
      {activeLetter !== null && (
        <View
          style={[styles.alphaBubble, { top: bubbleY, right: STRIP_W + 10 }]}
          pointerEvents="none"
        >
          <Text style={styles.alphaBubbleText}>{activeLetter}</Text>
        </View>
      )}

      {/* ── Select mode action bar ── */}
      {selectMode && (
        <View
          style={[
            styles.actionBar,
            { bottom: tabBarH, paddingBottom: bottomInset + 8 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.removeBtn,
              selectedIds.size === 0 && styles.removeBtnDisabled,
            ]}
            onPress={handleRemove}
            disabled={selectedIds.size === 0}
            activeOpacity={0.7}
          >
            <Text style={styles.removeBtnText}>
              Remove {selectedIds.size > 0 ? selectedIds.size : ""}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Playback queue slide-up panel ── */}
      <QueuePanel
        visible={showQueue}
        onClose={() => setShowQueue(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerCompact: { paddingTop: 4, paddingBottom: 6 },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: { padding: 4 },
  cancelText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // ── Search bar ──────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    gap: 8,
  },
  searchRowCompact: { marginBottom: 6, paddingVertical: 6 },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  searchInputCompact: { fontSize: 13 },

  // ── Song rows ───────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  rowActive: { backgroundColor: "rgba(255,255,255,0.04)" },
  rowSelected: { backgroundColor: "rgba(108,99,255,0.08)" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.dark.textTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  rowText: { flex: 1 },
  title: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  titleCompact: { fontSize: 14 },
  titleActive: { color: Colors.dark.text },
  artist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  artistCompact: { fontSize: 11, marginTop: 1 },
  activeBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },

  // ── Empty states ────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
  },
  emptyText: {
    color: Colors.dark.textTertiary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },

  // ── Select mode action bar ──────────────────────────────────────────────
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Colors.dark.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  removeBtn: {
    backgroundColor: Colors.dark.danger,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: "center",
  },
  removeBtnDisabled: { opacity: 0.4 },
  removeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Alpha strip ─────────────────────────────────────────────────────────
  alphaStrip: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: STRIP_W,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    zIndex: 10,
  },
  alphaSlot: {
    flex: 1,
    width: STRIP_W,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 8,
  },
  alphaLetter: {
    fontFamily: "Inter_500Medium",
    lineHeight: 12,
  },
  alphaAvailable: { color: "rgba(255,255,255,0.55)" },
  alphaUnavailable: { color: "rgba(255,255,255,0.14)" },
  alphaDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.dark.accent,
  },

  // ── Bubble popup ────────────────────────────────────────────────────────
  alphaBubble: {
    position: "absolute",
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 8,
  },
  alphaBubbleText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
});
