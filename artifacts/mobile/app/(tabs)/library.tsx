import * as Haptics from "expo-haptics";
import { Check, ChevronRight, Clock, ListMusic, Music2, Search, Users, X } from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
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

// ─── Constants ────────────────────────────────────────────────────────────────
const UNKNOWN_ARTIST = "Unknown Artist";

// ─── Filter modes ────────────────────────────────────────────────────────────
type FilterMode = "songs" | "artists" | "recent";

// ─── Row types (flat array driving the FlatList) ──────────────────────────────
type SectionRow = { kind: "section"; artist: string; key: string };
type SongRow    = { kind: "song";    data: Song;    key: string };
type ListRow    = SectionRow | SongRow;

export default function LibraryScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const {
    songs,
    currentSong,
    isSetupDone,
    recentlyPlayed,
    playSongFromLibrary,
    removeSongs,
  } = useMusicContext();

  const [filterMode,      setFilterMode]      = useState<FilterMode>("songs");
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [selectMode,      setSelectMode]      = useState(false);
  const [searchText,      setSearchText]      = useState("");
  const [showQueue,       setShowQueue]       = useState(false);
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set());

  const listRef     = useRef<FlatList>(null);
  const isListReady = useRef(false);
  const searchRef   = useRef<TextInput>(null);

  const itemH = isCompact ? 56 : 64;

  // ── Filtered songs (search applied) ────────────────────────────────────
  const displayedSongs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q),
    );
  }, [songs, searchText]);

  // ── Artist → songs map (search-filtered, used in Artists mode) ─────────
  const artistSongsMap = useMemo<Map<string, Song[]>>(() => {
    if (filterMode !== "artists") return new Map();
    const q = searchText.trim().toLowerCase();
    const source = q
      ? songs.filter((s) => s.artist.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
      : songs;
    // Sort A-Z, then by title within artist. Unknown Artist always goes last.
    const sorted = [...source].sort((a, b) => {
      const aUnk = a.artist === UNKNOWN_ARTIST;
      const bUnk = b.artist === UNKNOWN_ARTIST;
      if (aUnk && !bUnk) return 1;
      if (!aUnk && bUnk) return -1;
      const c = a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" });
      return c !== 0 ? c : a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    const map = new Map<string, Song[]>();
    for (const song of sorted) {
      if (!map.has(song.artist)) map.set(song.artist, []);
      map.get(song.artist)!.push(song);
    }
    return map;
  }, [filterMode, songs, searchText]);

  // ── List rows based on current filter mode ──────────────────────────────
  const listRows = useMemo<ListRow[]>(() => {
    if (filterMode === "songs") {
      return displayedSongs.map((s) => ({ kind: "song", data: s, key: s.id }));
    }

    if (filterMode === "artists") {
      const rows: ListRow[] = [];
      for (const [artist, artistSongs] of artistSongsMap) {
        rows.push({ kind: "section", artist, key: `hdr-${artist}` });
        if (expandedArtists.has(artist)) {
          for (const song of artistSongs) {
            rows.push({ kind: "song", data: song, key: song.id });
          }
        }
      }
      return rows;
    }

    if (filterMode === "recent") {
      const q = searchText.trim().toLowerCase();
      const filtered = q
        ? recentlyPlayed.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.artist.toLowerCase().includes(q),
          )
        : recentlyPlayed;
      return filtered.map((s) => ({ kind: "song", data: s, key: `recent-${s.id}` }));
    }

    return [];
  }, [filterMode, displayedSongs, artistSongsMap, expandedArtists, recentlyPlayed, searchText]);

  // ── Header count string ─────────────────────────────────────────────────
  const headerCount = useMemo(() => {
    const hasQuery = searchText.trim().length > 0;
    if (filterMode === "songs") {
      return songs.length > 0
        ? hasQuery && displayedSongs.length !== songs.length
          ? `${displayedSongs.length} / ${songs.length}`
          : `${songs.length} songs`
        : "";
    }
    if (filterMode === "artists") {
      const n = artistSongsMap.size;
      return n > 0 ? `${n} artist${n !== 1 ? "s" : ""}` : "";
    }
    if (filterMode === "recent") {
      return recentlyPlayed.length > 0 ? `${recentlyPlayed.length} recent` : "";
    }
    return "";
  }, [filterMode, displayedSongs, songs, recentlyPlayed, artistSongsMap, searchText]);

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

  // ── Artist group expand / select-all ────────────────────────────────────
  const toggleArtist = useCallback((artist: string) => {
    Haptics.selectionAsync();
    setExpandedArtists((prev) => {
      const next = new Set(prev);
      if (next.has(artist)) next.delete(artist);
      else next.add(artist);
      return next;
    });
  }, []);

  const handleArtistGroupLongPress = useCallback(
    (artist: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const artistSongs = artistSongsMap.get(artist) ?? [];
      if (artistSongs.length === 0) return;
      // Expand so the user can see the highlighted songs
      setExpandedArtists((prev) => {
        const next = new Set(prev);
        next.add(artist);
        return next;
      });
      setSelectMode(true);
      setSelectedIds(new Set(artistSongs.map((s) => s.id)));
    },
    [artistSongsMap],
  );

  // ── Search clear ────────────────────────────────────────────────────────
  const clearSearch = useCallback(() => {
    setSearchText("");
    searchRef.current?.blur();
  }, []);

  // ── Auto-scroll to current song (Songs mode only) ───────────────────────
  const scrollToCurrent = useCallback(() => {
    if (filterMode !== "songs") return;
    if (selectMode || searchText) return;
    if (!listRef.current || !isListReady.current || !currentSong) return;
    const idx = songs.findIndex((s) => s.id === currentSong.id);
    if (idx > 0) {
      listRef.current.scrollToIndex({ index: Math.max(0, idx - 2), animated: true });
    }
  }, [songs, currentSong, filterMode, selectMode, searchText]);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(scrollToCurrent, 100);
      return () => clearTimeout(t);
    }, [scrollToCurrent]),
  );

  // ── Row renderers ───────────────────────────────────────────────────────
  const renderSongRow = useCallback(
    (item: Song, customKey?: string) => {
      const isActive   = item.id === currentSong?.id;
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          key={customKey ?? item.id}
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

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === "section") {
        const isExpanded  = expandedArtists.has(item.artist);
        const groupSongs  = artistSongsMap.get(item.artist) ?? [];
        const count       = groupSongs.length;
        const allSelected = selectMode && count > 0 && groupSongs.every((s) => selectedIds.has(s.id));

        return (
          <TouchableOpacity
            style={[
              styles.sectionHeader,
              allSelected && styles.sectionHeaderSelected,
            ]}
            onPress={() => toggleArtist(item.artist)}
            onLongPress={() => handleArtistGroupLongPress(item.artist)}
            delayLongPress={350}
            activeOpacity={0.7}
          >
            <View style={styles.sectionContent}>
              <Text style={[styles.sectionText, isCompact && styles.sectionTextCompact]} numberOfLines={1}>
                {item.artist}
              </Text>
              <Text style={styles.sectionCount}>{count}</Text>
            </View>
            <View style={{ transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}>
              <ChevronRight size={15} color={Colors.dark.accent} />
            </View>
          </TouchableOpacity>
        );
      }
      return renderSongRow(item.data, item.key);
    },
    [
      renderSongRow, isCompact,
      expandedArtists, artistSongsMap, selectMode, selectedIds,
      toggleArtist, handleArtistGroupLongPress,
    ],
  );

  // getItemLayout only for uniform-height modes
  const getItemLayout = useMemo(() => {
    if (filterMode === "artists") return undefined;
    return (_: unknown, index: number) => ({
      length: itemH,
      offset: itemH * index,
      index,
    });
  }, [filterMode, itemH]);

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
            <Text style={styles.headerCount}>{headerCount}</Text>
            <TouchableOpacity onPress={() => setShowQueue(true)} style={styles.iconCircle} hitSlop={8}>
              <ListMusic size={isCompact ? 15 : 16} color={Colors.dark.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Filter pills ── */}
      {!selectMode && (
        <View style={[styles.filterBar, isCompact && styles.filterBarCompact]}>
          {(["songs", "artists", "recent"] as FilterMode[]).map((mode) => {
            const active = filterMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilterMode(mode);
                  setSearchText("");
                  setExpandedArtists(new Set());
                }}
                activeOpacity={0.75}
              >
                {mode === "songs"   && <Music2 size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} />}
                {mode === "artists" && <Users  size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} />}
                {mode === "recent"  && <Clock  size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} />}
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {mode === "songs" ? "Songs" : mode === "artists" ? "Artists" : "Recent"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Search bar (always visible when not selecting) ── */}
      {!selectMode && (
        <View style={[styles.searchRow, isCompact && styles.searchRowCompact]}>
          <Search size={14} color={Colors.dark.textTertiary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, isCompact && styles.searchInputCompact]}
            placeholder={filterMode === "artists" ? "Search artist or title…" : "Title or artist…"}
            placeholderTextColor={Colors.dark.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch} hitSlop={10}>
              <X size={16} color={Colors.dark.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Content ── */}
      {!isSetupDone || songs.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Music2 size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.emptyText}>No songs loaded</Text>
          <Text style={styles.emptyHint}>Scan your device from the Player tab</Text>
        </View>
      ) : filterMode === "recent" && recentlyPlayed.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Clock size={32} color={Colors.dark.accent} />
          </View>
          <Text style={styles.emptyText}>No recent plays</Text>
          <Text style={styles.emptyHint}>Songs appear here after you play them</Text>
        </View>
      ) : listRows.length === 0 ? (
        <View style={styles.empty}>
          <Search size={32} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No results</Text>
          <Text style={styles.emptyHint}>"{searchText}"</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={listRows}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: listBottomPad }}
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
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
            style={[styles.removeBtn, selectedIds.size === 0 && styles.removeBtnDisabled]}
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headerCompact: { paddingTop: 6, paddingBottom: 4 },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
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

  // ── Filter pills ──────────────────────────────────────────────────────
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
  },
  filterBarCompact: { paddingBottom: 6 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  filterPillActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  filterText: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  filterTextActive: { color: Colors.dark.accent },

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

  // ── Artist section headers (collapsible groups) ────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  sectionHeaderSelected: {
    backgroundColor: Colors.dark.accentDim,
  },
  sectionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 8,
  },
  sectionText: {
    color: Colors.dark.accent,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  sectionTextCompact: { fontSize: 11 },
  sectionCount: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  // ── Song rows ─────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowActive:   { backgroundColor: "rgba(232,112,42,0.07)" },
  rowSelected: { backgroundColor: "rgba(232,112,42,0.12)" },

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
});
