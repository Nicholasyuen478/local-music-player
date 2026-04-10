import * as Haptics from "expo-haptics";
import { Check, ChevronLeft, Clock, Heart, ListMusic, Music2, Search, X } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  BackHandler,
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

// ─── Filter modes ─────────────────────────────────────────────────────────────
type FilterMode = "liked" | "recent" | "songs";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

function formatDuration(secs?: number): string {
  if (!secs || !isFinite(secs) || secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LibraryScreen() {
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const {
    songs,
    currentSong,
    isSetupDone,
    recentlyPlayed,
    favorites,
    playFromContext,
    removeSongs,
  } = useMusicContext();

  const [filterMode,  setFilterMode]  = useState<FilterMode>("songs");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode,  setSelectMode]  = useState(false);
  const [searchText,  setSearchText]  = useState("");
  const [showQueue,   setShowQueue]   = useState(false);

  const listRef     = useRef<FlatList>(null);
  const isListReady = useRef(false);
  const searchRef   = useRef<TextInput>(null);

  const itemH = isCompact ? 62 : 72;

  // ── Hardware back → return to Player ───────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.navigate("/(tabs)");
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // ── Base list for each filter mode ─────────────────────────────────────
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const baseList = useMemo<Song[]>(() => {
    if (filterMode === "liked") {
      return songs.filter((s) => favSet.has(s.uri));
    }
    if (filterMode === "recent") {
      return recentlyPlayed;
    }
    return songs;
  }, [filterMode, songs, recentlyPlayed, favSet]);

  // ── Search filter ───────────────────────────────────────────────────────
  const displayedSongs = useMemo<Song[]>(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((s) =>
      stripExtension(s.filename).toLowerCase().includes(q),
    );
  }, [baseList, searchText]);

  // ── Header count ────────────────────────────────────────────────────────
  const headerCount = useMemo(() => {
    const n = displayedSongs.length;
    if (filterMode === "liked")  return n > 0 ? `${n} liked` : "";
    if (filterMode === "recent") return n > 0 ? `${n} recent` : "";
    const total = songs.length;
    if (!total) return "";
    return n < total && searchText.trim() ? `${n} / ${total}` : `${total} songs`;
  }, [filterMode, displayedSongs.length, songs.length, searchText]);

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
        playFromContext(item, displayedSongs);
      }
    },
    [selectMode, playFromContext, displayedSongs],
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

  // ── Row renderer ────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Song }) => {
      const isActive   = item.id === currentSong?.id;
      const isSelected = selectedIds.has(item.id);
      const cleanName  = stripExtension(item.filename);
      const duration   = formatDuration(item.duration);

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
              style={[styles.fileName, isActive && !selectMode && styles.fileNameActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cleanName}
            </Text>
            {duration ? (
              <Text style={styles.duration} numberOfLines={1}>
                {duration}
              </Text>
            ) : null}
          </View>

          {isActive && !selectMode && <View style={styles.activeBar} />}
        </TouchableOpacity>
      );
    },
    [currentSong, selectedIds, selectMode, handlePress, handleLongPress, itemH],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: itemH, offset: itemH * index, index }),
    [itemH],
  );

  const listBottomPad = bottomInset + tabBarH + 16 + (selectMode ? 72 : 0);

  // ── Empty state copy ────────────────────────────────────────────────────
  const emptyState = useMemo(() => {
    if (!isSetupDone || songs.length === 0) {
      return { icon: <Music2 size={32} color={Colors.dark.accent} />, title: "No songs loaded", hint: "Scan your device from the Player tab" };
    }
    if (filterMode === "liked" && displayedSongs.length === 0 && !searchText.trim()) {
      return { icon: <Heart size={32} color={Colors.dark.accent} />, title: "No liked songs yet", hint: "Tap the ♥ on the player to save favourites" };
    }
    if (filterMode === "recent" && displayedSongs.length === 0 && !searchText.trim()) {
      return { icon: <Clock size={32} color={Colors.dark.accent} />, title: "No recent plays", hint: "Songs appear here after you play them" };
    }
    if (displayedSongs.length === 0) {
      return { icon: <Search size={32} color={Colors.dark.textTertiary} />, title: "No results", hint: `"${searchText}"` };
    }
    return null;
  }, [isSetupDone, songs.length, filterMode, displayedSongs.length, searchText]);

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
            <TouchableOpacity
              onPress={() => router.navigate("/(tabs)")}
              style={styles.iconCircle}
              hitSlop={10}
            >
              <ChevronLeft size={isCompact ? 18 : 20} color={Colors.dark.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerCount}>{headerCount}</Text>
            <TouchableOpacity onPress={() => setShowQueue(true)} style={styles.iconCircle} hitSlop={8}>
              <ListMusic size={isCompact ? 15 : 16} color={Colors.dark.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Filter pills: Liked · Recent · Songs ── */}
      {!selectMode && (
        <View style={[styles.filterBar, isCompact && styles.filterBarCompact]}>
          {(["liked", "recent", "songs"] as FilterMode[]).map((mode) => {
            const active = filterMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilterMode(mode);
                  setSearchText("");
                  setTimeout(() => {
                    listRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }, 0);
                }}
                activeOpacity={0.75}
              >
                {mode === "liked"  && <Heart  size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} fill={active ? Colors.dark.accent : "none"} />}
                {mode === "recent" && <Clock  size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} />}
                {mode === "songs"  && <Music2 size={12} color={active ? Colors.dark.accent : Colors.dark.textTertiary} />}
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {mode === "liked" ? "Liked" : mode === "recent" ? "Recent" : "Songs"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Search bar ── */}
      {!selectMode && (
        <View style={[styles.searchRow, isCompact && styles.searchRowCompact]}>
          <Search size={14} color={Colors.dark.textTertiary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, isCompact && styles.searchInputCompact]}
            placeholder="Search by filename…"
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
      {emptyState ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>{emptyState.icon}</View>
          <Text style={styles.emptyText}>{emptyState.title}</Text>
          <Text style={styles.emptyHint}>{emptyState.hint}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
        <View style={[styles.actionBar, { bottom: tabBarH, paddingBottom: bottomInset + 8 }]}>
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

  // ── Song rows ─────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowActive: {
    backgroundColor: "rgba(232,112,42,0.07)",
  },
  rowSelected: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.dark.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  rowText: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  fileName: {
    color: Colors.dark.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  fileNameActive: {
    color: Colors.dark.accent,
  },
  duration: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  activeBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },

  // ── Empty state ───────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
    paddingBottom: 80,
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
    textAlign: "center",
  },
  emptyHint: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Select-mode action bar ─────────────────────────────────────────────
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Colors.dark.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  removeBtn: {
    backgroundColor: Colors.dark.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  removeBtnDisabled: { opacity: 0.4 },
  removeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
