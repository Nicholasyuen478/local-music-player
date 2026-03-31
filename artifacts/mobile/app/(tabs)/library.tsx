import * as Haptics from "expo-haptics";
import { Check, Music2 } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router"; //
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import type { Song } from "@/context/MusicContext";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const {
    queue,
    currentIndex,
    currentSong,
    isSetupDone,
    playSong,
    removeSongs,
  } = useMusicContext();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const listRef = useRef<FlatList>(null);
  const isListReady = useRef(false); // 

  const topInset = Platform.OS === "web" ? 48 : insets.top;
  const bottomInset = Platform.OS === "web" ? 90 : insets.bottom;

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
    (item: Song, index: number) => {
      if (selectMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          if (next.size === 0) setSelectMode(false);
          return next;
        });
      } else {
        playSong(item, queue, index);
      }
    },
    [selectMode, playSong, queue]
  );

  const handleRemove = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      `Remove ${count} song${count > 1 ? "s" : ""}?`,
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeSongs([...selectedIds]);
            exitSelectMode();
          },
        },
      ]
    );
  }, [selectedIds, removeSongs, exitSelectMode]);

  // ✅ Helper function to scroll to current
  const scrollToCurrent = useCallback(() => {
    if (currentIndex > 0 && listRef.current && isListReady.current) {
      listRef.current.scrollToIndex({
        index: Math.max(0, currentIndex - 2),
        animated: true, // Optional: true makes it feel nicer when switching tabs
      });
    }
  }, [currentIndex]);

  // ✅ 1. Scroll when list first renders (initial mount)
  const handleListLayout = useCallback(() => {
    isListReady.current = true;
    scrollToCurrent();
  }, [scrollToCurrent]);

  // ✅ 2. Scroll every time user navigates back to this tab
  useFocusEffect(
    useCallback(() => {
      // Small timeout ensures the tab transition finishes before scrolling
      const timer = setTimeout(() => {
        scrollToCurrent();
      }, 100);
      return () => clearTimeout(timer);
    }, [scrollToCurrent])
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => {
      const isActive = item.id === currentSong?.id;
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          style={[
            styles.row,
            isActive && !selectMode && styles.rowActive,
            isSelected && styles.rowSelected,
          ]}
          onPress={() => handlePress(item, index)}
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
              style={[styles.title, isActive && !selectMode && styles.titleActive]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
          {isActive && !selectMode && <View style={styles.activeBar} />}
        </TouchableOpacity>
      );
    },
    [currentSong, selectedIds, selectMode, handlePress, handleLongPress]
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        {selectMode ? (
          <>
            <Text style={styles.headerCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={exitSelectMode} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.headerCount}>
            {queue.length > 0 ? `${queue.length} songs` : ""}
          </Text>
        )}
      </View>

      {!isSetupDone || queue.length === 0 ? (
        <View style={styles.empty}>
          <Music2 size={40} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyText}>No songs loaded</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={queue}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingBottom: (selectMode ? 80 : 0) + bottomInset + 16,
          }}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
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
        />
      )}

      {/* Select mode action bar */}
      {selectMode && (
        <View style={[styles.actionBar, { paddingBottom: bottomInset + 8 }]}>
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
    </View>
  );
}

const ITEM_HEIGHT = 56;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerBtn: { paddingVertical: 4 },
  cancelText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    height: ITEM_HEIGHT,
    gap: 14,
  },
  rowActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rowSelected: {
    backgroundColor: "rgba(108,99,255,0.08)",
  },
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
  titleActive: {
    color: Colors.dark.text,
  },
  artist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  activeBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },
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
  },
  actionBar: {
    position: "absolute",
    bottom: 52,
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
});