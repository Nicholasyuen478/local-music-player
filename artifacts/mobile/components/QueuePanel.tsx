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
  const itemH = isCompact ? 56 : 62;

  useEffect(() => {
    if (!visible || currentIndex <= 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: Math.max(0, currentIndex - 2),
        animated: false,
      });
    }, 360);
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
            { height: itemH },
            isCurrent && styles.rowCurrent,
          ]}
          onPress={() => handleSongPress(item, index)}
          activeOpacity={0.65}
        >
          <View style={styles.indexCol}>
            {isCurrent ? (
              <View style={styles.playingPill}>
                <View style={styles.playingDot} />
              </View>
            ) : (
              <Text style={[styles.indexNum, isPast && styles.indexNumPast]}>
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
    [currentIndex, handleSongPress, itemH, isCompact],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: topInset }]}>

        <View style={styles.handle} />

        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Playback Queue</Text>
            <Text style={styles.headerSub}>
              {queue.length} songs · playing #{currentIndex + 1}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={12}
          >
            <X size={20} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
        </View>

        {currentIndex > 0 && (
          <Text style={styles.sectionLabel}>
            {currentIndex} song{currentIndex > 1 ? "s" : ""} played
          </Text>
        )}

        {queue.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Music2 size={30} color={Colors.dark.accent} />
            </View>
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
              length: itemH,
              offset: itemH * index,
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
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  headerSub: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  sectionLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 24,
    paddingBottom: 6,
    paddingTop: 2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  rowCurrent: {
    backgroundColor: Colors.dark.accentDim,
  },

  indexCol: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  indexNum: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  indexNumPast: { opacity: 0.4 },
  playingPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(108,99,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  playingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },

  rowText: { flex: 1 },
  title: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  titleCompact: { fontSize: 13 },
  titleCurrent: { color: Colors.dark.text, fontFamily: "Inter_600SemiBold" },
  titlePast: { color: Colors.dark.textTertiary, opacity: 0.6 },
  artist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  artistCompact: { fontSize: 11 },
  artistPast: { opacity: 0.4 },
  activeBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.dark.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
