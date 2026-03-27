import { Music2 } from "lucide-react-native";
import React, { useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useMusicContext } from "@/context/MusicContext";
import { SongArtwork } from "@/components/SongArtwork";
import type { Song } from "@/context/MusicContext";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const {
    queue,
    currentIndex,
    currentSong,
    imagePool,
    isSetupDone,
    playSong,
  } = useMusicContext();

  const listRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 48 : insets.top;
  const bottomInset = Platform.OS === "web" ? 90 : insets.bottom;

  const renderItem = ({ item, index }: { item: Song; index: number }) => {
    const isActive = item.id === currentSong?.id;
    return (
      <TouchableOpacity
        style={[styles.row, isActive && styles.rowActive]}
        onPress={() => playSong(item, queue, index)}
        activeOpacity={0.6}
      >
        <SongArtwork imagePool={imagePool} songId={item.id} size={48} borderRadius={3} />
        <View style={styles.rowText}>
          <Text
            style={[styles.title, isActive && styles.titleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>
        {isActive && (
          <View style={styles.activeBar} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerCount}>
          {queue.length > 0 ? `${queue.length} songs` : ""}
        </Text>
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
          contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
          showsVerticalScrollIndicator={false}
          initialScrollIndex={
            currentIndex > 2 ? Math.max(0, currentIndex - 2) : 0
          }
          getItemLayout={(_, index) => ({
            length: 68,
            offset: 68 * index,
            index,
          })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    gap: 14,
    height: 68,
  },
  rowActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
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
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
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
    gap: 12,
    paddingBottom: 80,
  },
  emptyText: {
    color: Colors.dark.textTertiary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
