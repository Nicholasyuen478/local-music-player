import * as Haptics from "expo-haptics";
import { Check, ListMusic, Music2, Search, X } from "lucide-react-native";
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
  ScrollView,
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

// ─── Alphabet config ────────────────────────────────────────────────────────
const LETTERS = [
  "#","A","B","C","D","E","F","G","H","I","J","K","L",
  "M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
];

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

  const [selectedIds,   setSelectedIds]  = useState<Set<string>>(new Set());
  const [selectMode,    setSelectMode]   = useState(false);
  const [searchText,    setSearchText]   = useState("");
  const [searchActive,  setSearchActive] = useState(false);
  const [showQueue,     setShowQueue]    = useState(false);
  const [activeLetter,  setActiveLetter] = useState<string | null>(null);

  const listRef      = useRef<FlatList>(null);
  const alphaListRef = useRef<ScrollView>(null);
  const isListReady  = useRef(false);
  const searchRef    = useRef<TextInput>(null);
  const activeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemH = isCompact ? 56 : 64;
  const pillH = isCompact ? 32 : 36;
  const pillW = isCompact ? 28 : 32;

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

  // ── Letter tap handler ──────────────────────────────────────────────────
  const handleLetterPress = useCallback(
    (letter: string) => {
      Haptics.selectionAsync();

      setActiveLetter(letter);
      if (activeTimer.current) clearTimeout(activeTimer.current);
      activeTimer.current = setTimeout(() => setActiveLetter(null), 900);

      const target = sectionMap.get(letter);
      if (target !== undefined) {
        listRef.current?.scrollToIndex({ index: target, animated: true });
      }
    },
    [sectionMap],
  );

  // cleanup timer on unmount
  useEffect(() => () => { if (activeTimer.current) clearTimeout(activeTimer.current); }, []);

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
      { text: "Remove", style: "destructive", onPress: async () => {
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

  const listBottomPad = bottomInset + tabBarH + 16 + (selectMode ? 72 : 0);

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
                  ? `${displayedSongs.length} / ${songs.length}`
                  : `${songs.length} songs`
                : ""}
            </Text>
            <View style={styles.headerActions}>
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

      {/* ── Search bar ── */}
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

      {/* ── Horizontal alphabet index bar ── */}
      {showAlphaBar && (
        <View style={styles.alphaBarShadowWrap}>
          <ScrollView
            ref={alphaListRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.alphaBar}
            contentContainerStyle={[
              styles.alphaBarContent,
              isCompact && styles.alphaBarContentCompact,
            ]}
          >
            {LETTERS.map((letter) => {
              const available = availableLetters.has(letter);
              const isActive  = activeLetter === letter;

              return (
                <TouchableOpacity
                  key={letter}
                  onPress={available ? () => handleLetterPress(letter) : undefined}
                  activeOpacity={0.55}
                  style={[
                    styles.alphaPill,
                    { width: pillW, height: pillH },
                    isActive && styles.alphaPillActive,
                    !available && styles.alphaPillDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.alphaPillText,
                      isCompact && styles.alphaPillTextCompact,
                      isActive && styles.alphaPillTextActive,
                      !available && styles.alphaPillTextDisabled,
                    ]}
                  >
                    {letter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

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
          contentContainerStyle={{ paddingBottom: listBottomPad }}
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

  // ── Alphabet bar ──────────────────────────────────────────────────────
  //   Shadow wrapper provides the drop-shadow between the bar and the list.
  alphaBarShadowWrap: {
    backgroundColor: Colors.dark.background,
    // Android shadow via elevation
    elevation: 5,
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    zIndex: 10,
  },
  alphaBar: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  alphaBarContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  alphaBarContentCompact: { paddingVertical: 4 },

  alphaPill: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  alphaPillActive: {
    backgroundColor: Colors.dark.accent,
    // Glow around active pill
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  alphaPillDisabled: {
    opacity: 0.25,
  },
  alphaPillText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 16,
  },
  alphaPillTextCompact: { fontSize: 12 },
  alphaPillTextActive: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  alphaPillTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },

  // ── Song rows ─────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowActive: { backgroundColor: "rgba(108,99,255,0.07)" },
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
  titleActive: { color: Colors.dark.text, fontFamily: "Inter_600SemiBold" },
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

  // ── Select mode action bar ────────────────────────────────────────────
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
});
