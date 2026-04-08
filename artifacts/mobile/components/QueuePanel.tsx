import { X, Music2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import type { Song } from "@/context/MusicContext";
import { useLayout } from "@/hooks/useLayout";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function QueuePanel({ visible, onClose }: Props) {
  const { queue, currentIndex, playSong } = useMusicContext();
  const { topInset, bottomInset, tabBarH, isCompact } = useLayout();
  const listRef = useRef<FlatList>(null);
  const itemHeight = isCompact ? 52 : 56;

  // Auto-scroll to current song when panel opens
  useEffect(() => {
    if (!visible || currentIndex <= 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: Math.max(0, currentIndex - 2),
        animated: false,
      });
    }, 350); // wait for modal slide-up
    return () => clearTimeout(timer);
  }, [visible, currentIndex]);

  const handleSongPress = useCallback(
    async (song: Song, index: number) => {
      await playSong(song, queue, index);
      onClose();
    },
    [playSong, queue, onClose],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => {
      const isCurrent = index === currentIndex;
      const isPast = index < currentIndex;

      return (
        <TouchableOpacity
          style={[
            styles.row,
            { height: itemHeight },
            isCurrent && styles.rowCurrent,
            isPast && styles.rowPast,
          ]}
          onPress={() => handleSongPress(item, index)}
          activeOpacity={0.6}
        >
          <View style={styles.indexCol}>
            {isCurrent ? (
              <View style={styles.playingDot} />
            ) : (
              <Text
                style={[styles.indexNum, isPast && styles.indexNumPast]}
              >
                {index + 1}
              </Text>
            )}
          </View>
          <View style={styles.rowText}>
            <Text
              style={[
                styles.title,
                isCurrent && styles.titleCurrent,
                isPast && styles.titlePast,
                isCompact && styles.titleCompact,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.artist,
                isPast && styles.artistPast,
                isCompact && styles.artistCompact,
              ]}
              numberOfLines={1}
            >
              {item.artist}
            </Text>
          </View>
          {isCurrent && <View style={styles.activeBar} />}
        </TouchableOpacity>
      );
    },
    [currentIndex, handleSongPress, itemHeight, isCompact],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: topInset }]}>

        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Playback Queue</Text>
            <Text style={styles.headerSub}>
              {queue.length} songs · #{currentIndex + 1} playing
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={10}
          >
            <X size={20} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Section labels */}
        {currentIndex > 0 && (
          <Text style={styles.sectionLabel}>
            {currentIndex} song{currentIndex > 1 ? "s" : ""} before
          </Text>
        )}

        {queue.length === 0 ? (
          <View style={styles.empty}>
            <Music2 size={36} color={Colors.dark.textTertiary} />
            <Text style={styles.emptyText}>Queue is empty</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={queue}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: bottomInset + tabBarH + 16,
            }}
            getItemLayout={(_, index) => ({
              length: itemHeight,
              offset: itemHeight * index,
              index,
            })}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  headerSub: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginTop: 2,
  },
  sectionLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 24,
    paddingBottom: 4,
  },

  // ── Song rows ───────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  rowCurrent: {
    backgroundColor: "rgba(108,99,255,0.1)",
  },
  rowPast: {
    opacity: 0.45,
  },
  indexCol: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  indexNum: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  indexNumPast: {
    color: "rgba(255,255,255,0.3)",
  },
  playingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.dark.accent,
  },
  rowText: { flex: 1 },
  title: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  titleCompact: { fontSize: 13 },
  titleCurrent: { color: Colors.dark.text },
  titlePast: { color: Colors.dark.textTertiary },
  artist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  artistCompact: { fontSize: 11 },
  artistPast: { color: "rgba(255,255,255,0.25)" },
  activeBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },

  // ── Empty state ─────────────────────────────────────────────────────────
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
});
