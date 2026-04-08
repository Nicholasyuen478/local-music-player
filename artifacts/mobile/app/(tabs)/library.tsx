import * as Haptics from "expo-haptics";
import { Check, ListMusic, Music2, Search, X } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
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
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import type { Song } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";
import QueuePanel from "@/components/QueuePanel";

// ─── Alphabet strip config ──────────────────────────────────────────────────
const LETTERS = [
  "#","A","B","C","D","E","F","G","H","I","J","K","L",
  "M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
];
const STRIP_W   = 28;    // wider → easier to grab
const BUBBLE_SZ = 52;    // floating letter popup

function firstLetterKey(title: string): string {
  const ch = title.trim()[0]?.toUpperCase() ?? "";
  return /^[A-Z]$/.test(ch) ? ch : "#";
}

export default function LibraryScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const {
    songs,
    currentSong,
    isSetupDone,
    playSongFromLibrary,
    removeSongs,
  } = useMusicContext();

  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [selectMode,   setSelectMode]   = useState(false);
  const [searchText,   setSearchText]   = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [showQueue,    setShowQueue]    = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [bubbleY,      setBubbleY]      = useState(0);

  // ── Refs ────────────────────────────────────────────────────────────────
  const listRef        = useRef<FlatList>(null);
  const isListReady    = useRef(false);
  const searchRef      = useRef<TextInput>(null);
  // Height of the alphabet strip itself (set by onLayout) — used by PanResponder
  const stripHeightRef = useRef(0);
  const lastHapticRef  = useRef<string | null>(null);
  // Measured height of the sticky area ABOVE the list (header + optional search bar)
  // Used to position the strip's top edge correctly.
  const aboveListHRef  = useRef(0);

  const itemH = isCompact ? 56 : 64;

  // ── Filtered songs ──────────────────────────────────────────────────────
  const displayedSongs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q),
    );
  }, [songs, searchText]);

  const showAlphaBar = !searchActive && displayedSongs.length > 0;

  // ── Section-first-index map ─────────────────────────────────────────────
  const sectionMap = useMemo(() => {
    const map = new Map<string, number>();
    displayedSongs.forEach((song, idx) => {
      const l = firstLetterKey(song.title);
      if (!map.has(l)) map.set(l, idx);
    });
    return map;
  }, [displayedSongs]);

  const availableLetters = useMemo(() => new Set(sectionMap.keys()), [sectionMap]);
  const sectionMapRef    = useRef(sectionMap);
  sectionMapRef.current  = sectionMap;

  // ── Select mode ─────────────────────────────────────────────────────────
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

  // ── Search ──────────────────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setSearchActive(true);
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
    searchRef.current?.blur();
  }, []);

  // ── Auto-scroll to current song on focus ────────────────────────────────
  const scrollToCurrent = useCallback(() => {
    if (selectMode || searchActive) return;
    if (!listRef.current || !isListReady.current || !currentSong) return;
    const idx = songs.findIndex((s) => s.id === currentSong.id);
    if (idx > 0) {
      listRef.current.scrollToIndex({ index: Math.max(0, idx - 2), animated: true });
    }
  }, [songs, currentSong, selectMode, searchActive]);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(scrollToCurrent, 100);
      return () => clearTimeout(t);
    }, [scrollToCurrent]),
  );

  // ── Strip gesture (PanResponder) ────────────────────────────────────────
  //
  // locationY is relative to the STRIP view's own origin — no measure() needed.
  //
  const handleStripTouch = useCallback((locationY: number) => {
    if (stripHeightRef.current === 0) return;

    const ratio  = Math.max(0, Math.min(1, locationY / stripHeightRef.current));
    const idx    = Math.min(Math.floor(ratio * LETTERS.length), LETTERS.length - 1);
    const letter = LETTERS[idx];

    // Haptic only when letter changes
    if (letter !== lastHapticRef.current) {
      lastHapticRef.current = letter;
      if (sectionMapRef.current.has(letter)) Haptics.selectionAsync();
    }

    // Position bubble relative to strip top — clamped so it stays in view
    const clampedY = Math.max(0, Math.min(
      locationY - BUBBLE_SZ / 2,
      stripHeightRef.current - BUBBLE_SZ,
    ));
    setActiveLetter(letter);
    setBubbleY(clampedY);

    const target = sectionMapRef.current.get(letter);
    if (target !== undefined) {
      listRef.current?.scrollToIndex({ index: target, animated: false });
    }
  }, []);

  // Keep ref in sync so PanResponder callbacks always have the latest version
  const handleStripTouchRef    = useRef(handleStripTouch);
  handleStripTouchRef.current  = handleStripTouch;

  const stripPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:     (e) => handleStripTouchRef.current(e.nativeEvent.locationY),
      onPanResponderMove:      (e) => handleStripTouchRef.current(e.nativeEvent.locationY),
      onPanResponderRelease:   ()  => { setActiveLetter(null); lastHapticRef.current = null; },
      onPanResponderTerminate: ()  => { setActiveLetter(null); lastHapticRef.current = null; },
    }),
  ).current;

  // ── Song row ────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Song }) => {
      const isActive   = item.id === currentSong?.id;
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          style={[
            styles.row,
            { height: itemH },
            isActive && !selectMode && styles.rowActive,
            isSelected && styles.rowSelected,
          ]}
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={350}
          activeOpacity={0.65}
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
    [currentSong, selectedIds, selectMode, handlePress, handleLongPress, itemH, isCompact],
  );

  const listPaddingRight = showAlphaBar ? STRIP_W + 2 : 0;
  const listBottomPad    = bottomInset + tabBarH + 16 + (selectMode ? 72 : 0);

  // Strip position: top = header (+ optional search bar) height, measured dynamically
  const [aboveListH, setAboveListH] = useState(46);
  const stripBottom = tabBarH + bottomInset;

  const letterFontSz = isCompact ? 10 : 11;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* ── Sticky area above the list (header + search) ── */}
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setAboveListH(h);
          aboveListHRef.current = h;
        }}
      >
        {/* Header */}
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
                    ? `${displayedSongs.length} / ${songs.length}`
                    : `${songs.length} songs`
                  : ""}
              </Text>
              <View style={styles.headerActions}>
                {/* Back to Player */}
                <TouchableOpacity
                  onPress={() => router.navigate("/(tabs)/")}
                  style={styles.iconCircle}
                  hitSlop={8}
                >
                  <Music2
                    size={isCompact ? 15 : 16}
                    color={currentSong ? Colors.dark.accent : Colors.dark.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openSearch}
                  style={styles.iconCircle}
                  hitSlop={8}
                >
                  <Search size={isCompact ? 15 : 16} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowQueue(true)}
                  style={styles.iconCircle}
                  hitSlop={8}
                >
                  <ListMusic size={isCompact ? 15 : 16} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Search bar */}
        {searchActive && (
          <View style={[styles.searchRow, isCompact && styles.searchRowCompact]}>
            <Search size={14} color={Colors.dark.textTertiary} />
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, isCompact && styles.searchInputCompact]}
              placeholder="Title or artist…"
              placeholderTextColor={Colors.dark.textTertiary}
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={closeSearch} hitSlop={10}>
              <X size={16} color={Colors.dark.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Song list ── */}
      {!isSetupDone || songs.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Music2 size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.emptyText}>No songs loaded</Text>
          <Text style={styles.emptyHint}>Scan your device from the Player tab</Text>
        </View>
      ) : displayedSongs.length === 0 ? (
        <View style={styles.empty}>
          <Search size={32} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No results</Text>
          <Text style={styles.emptyHint}>"{searchText}"</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingBottom: listBottomPad,
            paddingRight: listPaddingRight,
          }}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: itemH,
            offset: itemH * index,
            index,
          })}
          onLayout={() => {
            isListReady.current = true;
            scrollToCurrent();
          }}
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

      {/* ── Vertical alpha index strip ── */}
      {showAlphaBar && (
        <View
          style={[
            styles.alphaStrip,
            {
              top:    aboveListH,
              bottom: stripBottom,
              width:  STRIP_W,
            },
          ]}
          onLayout={(e) => { stripHeightRef.current = e.nativeEvent.layout.height; }}
          {...stripPanResponder.panHandlers}
        >
          {LETTERS.map((letter) => {
            const available = availableLetters.has(letter);
            const isActive  = activeLetter === letter;

            return (
              <View key={letter} style={styles.letterSlot}>
                {isActive ? (
                  // Active: filled accent pill showing the letter clearly
                  <View style={styles.activeLetterPill}>
                    <Text style={[styles.activeLetterText, { fontSize: letterFontSz + 1 }]}>
                      {letter}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.letterText,
                      { fontSize: letterFontSz },
                      available ? styles.letterAvailable : styles.letterUnavailable,
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

      {/* ── Floating bubble — appears beside strip while dragging ── */}
      {activeLetter !== null && (
        <View
          style={[
            styles.bubble,
            {
              // Position bubble in screen coordinates:
              // topInset + aboveListH puts us at the strip's top edge,
              // then bubbleY is the offset within the strip.
              top:   topInset + aboveListH + bubbleY,
              right: STRIP_W + 16,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.bubbleText}>{activeLetter}</Text>
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
            activeOpacity={0.75}
          >
            <Text style={styles.removeBtnText}>
              Remove {selectedIds.size > 0 ? selectedIds.size : ""}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Queue panel ── */}
      <QueuePanel visible={showQueue} onClose={() => setShowQueue(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // ── Header ────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerCompact: { paddingTop: 6, paddingBottom: 6 },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: { padding: 6 },
  cancelText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Search bar ────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  searchRowCompact: { paddingVertical: 7, marginBottom: 6 },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  searchInputCompact: { fontSize: 13 },

  // ── Song rows ─────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowActive:   { backgroundColor: "rgba(108,99,255,0.07)" },
  rowSelected: { backgroundColor: "rgba(108,99,255,0.12)" },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
  titleActive:  { color: Colors.dark.text, fontFamily: "Inter_600SemiBold" },
  artist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  artistCompact: { fontSize: 11, marginTop: 2 },
  activeBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },

  // ── Empty states ──────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.accentDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  emptyHint: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Select action bar ─────────────────────────────────────────────────
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: Colors.dark.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  removeBtn: {
    backgroundColor: Colors.dark.danger,
    borderRadius: 50,
    paddingVertical: 15,
    alignItems: "center",
  },
  removeBtnDisabled: { opacity: 0.4 },
  removeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Vertical alpha strip ──────────────────────────────────────────────
  //
  // Sits absolutely on the right edge, from below the header to above the
  // tab bar. Has a semi-transparent pill background so users notice it.
  //
  alphaStrip: {
    position: "absolute",
    right: 0,
    // Subtle floating pill background
    backgroundColor: "rgba(28,28,46,0.88)",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    // Shadow on left edge so it floats over the list
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 20,
  },
  letterSlot: {
    flex: 1,
    width: STRIP_W,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 9,
  },
  letterText: {
    fontFamily: "Inter_600SemiBold",
    lineHeight: 13,
    textAlign: "center",
  },
  letterAvailable:   { color: "rgba(255,255,255,0.70)" },
  letterUnavailable: { color: "rgba(255,255,255,0.18)" },

  // Active letter — shown as a small filled accent-purple circle
  activeLetterPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  activeLetterText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    lineHeight: 14,
    textAlign: "center",
  },

  // ── Floating letter bubble ────────────────────────────────────────────
  bubble: {
    position: "absolute",
    width: BUBBLE_SZ,
    height: BUBBLE_SZ,
    borderRadius: BUBBLE_SZ / 2,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 12,
  },
  bubbleText: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
});
