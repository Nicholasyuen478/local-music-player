import { Music } from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Song } from "@/context/MusicContext";
import { SongArtwork } from "@/components/SongArtwork";

type Props = {
  visible: boolean;
  onClose: () => void;
  queue: Song[];
  currentIndex: number;
  imagePool: string[];
  onSelectSong: (song: Song, index: number) => void;
};

export function QueueSheet({ visible, onClose, queue, currentIndex, imagePool, onSelectSong }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Queue</Text>
            <Text style={styles.headerCount}>{queue.length} songs</Text>
          </View>
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            renderItem={({ item, index }) => {
              const isCurrent = index === currentIndex;
              return (
                <TouchableOpacity
                  style={[styles.songRow, isCurrent && styles.songRowActive]}
                  onPress={() => {
                    onSelectSong(item, index);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <SongArtwork imagePool={imagePool} songId={item.id} size={44} borderRadius={8} />
                  <View style={styles.songInfo}>
                    <Text
                      style={[styles.songTitle, isCurrent && styles.songTitleActive]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.songArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  {isCurrent && (
                    <Music size={18} color={Colors.dark.accent} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.overlay,
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: "75%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  headerCount: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  list: {
    paddingHorizontal: 16,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  songRowActive: {
    backgroundColor: Colors.dark.surface,
  },
  songInfo: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  songTitleActive: {
    color: Colors.dark.text,
  },
  songArtist: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
