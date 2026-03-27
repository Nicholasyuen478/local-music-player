import { Feather, Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

type Props = {
  visible: boolean;
  albums: MediaLibrary.Album[];
  permissionDenied: boolean;
  isScanning: boolean;
  onSelectAlbum: (album: MediaLibrary.Album) => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
};

export function AlbumPickerModal({
  visible,
  albums,
  permissionDenied,
  isScanning,
  onSelectAlbum,
  onDismiss,
  onOpenSettings,
}: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return albums;
    const q = search.toLowerCase();
    return albums.filter((a) => a.title.toLowerCase().includes(q));
  }, [albums, search]);

  function handleSelect(album: MediaLibrary.Album) {
    setSelectedId(album.id);
    onSelectAlbum(album);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
      <View style={[styles.root, { paddingTop: Platform.OS === "web" ? 60 : insets.top }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundTertiary, Colors.dark.background]}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={24} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Choose a Folder</Text>
          <View style={{ width: 36 }} />
        </View>

        {permissionDenied ? (
          /* Permission was denied */
          <View style={styles.centered}>
            <Feather name="lock" size={52} color={Colors.dark.textTertiary} style={{ marginBottom: 20 }} />
            <Text style={styles.deniedTitle}>Permission Required</Text>
            <Text style={styles.deniedBody}>
              Allow this app to access your media library so it can show your music folders.
            </Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={onOpenSettings} activeOpacity={0.8}>
              <LinearGradient
                colors={[Colors.dark.accent, Colors.dark.accentDark]}
                style={styles.settingsBtnGradient}
              >
                <Feather name="settings" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.settingsBtnText}>Open App Settings</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : isScanning ? (
          /* Scanning selected album */
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.dark.accent} />
            <Text style={styles.scanningText}>Scanning folder…</Text>
          </View>
        ) : (
          <>
            {/* Search bar */}
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={Colors.dark.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search folders…"
                placeholderTextColor={Colors.dark.textTertiary}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} activeOpacity={0.7}>
                  <Feather name="x" size={16} color={Colors.dark.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.hint}>
              {filtered.length} folder{filtered.length !== 1 ? "s" : ""} found — tap one to load its music
            </Text>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.albumRow, isSelected && styles.albumRowSelected]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.folderIcon, isSelected && styles.folderIconSelected]}>
                      <Feather
                        name="folder"
                        size={22}
                        color={isSelected ? "#fff" : Colors.dark.accent}
                      />
                    </View>
                    <View style={styles.albumInfo}>
                      <Text style={styles.albumTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.albumCount}>
                        {item.assetCount ?? "?"} items
                      </Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={18}
                      color={isSelected ? Colors.dark.accent : Colors.dark.textTertiary}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={() => (
                <View style={styles.empty}>
                  <Feather name="folder" size={40} color={Colors.dark.textTertiary} style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyText}>No folders found</Text>
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                </View>
              )}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.text,
    padding: 0,
  },
  hint: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  albumRowSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: `${Colors.dark.accent}18`,
  },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: `${Colors.dark.accent}22`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  folderIconSelected: {
    backgroundColor: Colors.dark.accent,
  },
  albumInfo: {
    flex: 1,
    gap: 3,
  },
  albumTitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.text,
  },
  albumCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textTertiary,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  scanningText: {
    marginTop: 16,
    fontSize: 15,
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  deniedTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    marginBottom: 12,
    textAlign: "center",
  },
  deniedBody: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  settingsBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  settingsBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  settingsBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.dark.textTertiary,
    fontFamily: "Inter_400Regular",
  },
});
