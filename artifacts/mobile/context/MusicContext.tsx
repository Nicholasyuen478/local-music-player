import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

export type Song = {
  id: string;
  title: string;
  artist: string;
  uri: string;
  filename: string;
  duration?: number;
};

const STORAGE_KEYS = {
  MUSIC_FOLDER: "music_folder_uri",
  MUSIC_ALBUM_ID: "music_album_id",
  SONGS: "cached_songs",
  IMAGE_POOL: "image_pool",
  IMAGE_FOLDER: "image_folder_uri",
  QUEUE: "playback_queue",
  CURRENT_INDEX: "current_index",
  SHUFFLE: "shuffle_enabled",
};

// StorageAccessFramework is only available in real (non-Expo Go) builds
const SAF = FileSystem.StorageAccessFramework;
const SAF_AVAILABLE = !!SAF && typeof SAF?.requestDirectoryPermissionsAsync === "function";

function parseSongMeta(filename: string, uri: string, duration?: number): Song {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt.split(" - ");
  const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
  const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : nameWithoutExt;
  return { id: uri, title, artist, uri, filename, duration };
}

async function scanMusicFolderSAF(folderUri: string): Promise<Song[]> {
  try {
    const files = await SAF.readDirectoryAsync(folderUri);
    const songs: Song[] = [];
    for (const fileUri of files) {
      const lower = fileUri.toLowerCase();
      if (lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac") ||
          lower.endsWith(".ogg") || lower.endsWith(".flac") || lower.endsWith(".wav")) {
        const filename = decodeURIComponent(
          fileUri.split("%2F").pop() || fileUri.split("/").pop() || fileUri
        );
        songs.push(parseSongMeta(filename, fileUri));
      }
    }
    return songs;
  } catch (e) {
    console.error("SAF scan error", e);
    return [];
  }
}

async function scanAlbum(album: MediaLibrary.Album): Promise<Song[]> {
  const all: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "audio",
      album: album.id,
      first: 500,
      after,
    });
    all.push(...page.assets);
    hasMore = page.hasNextPage;
    after = page.endCursor;
  }
  return all.map((a) => parseSongMeta(a.filename, a.uri, a.duration));
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const [MusicContextProvider, useMusicContext] = createContextHook(() => {
  const [musicFolderUri, setMusicFolderUri] = useState<string | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imagePool, setImagePool] = useState<string[]>([]);
  const [imageFolderUri, setImageFolderUri] = useState<string | null>(null);
  const [isSetupDone, setIsSetupDone] = useState(false);

  // Album (folder) picker state — used in Expo Go
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [albumPermissionDenied, setAlbumPermissionDenied] = useState(false);
  const [isScanningAlbum, setIsScanningAlbum] = useState(false);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const currentSong = queue[currentIndex] ?? null;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
    });
  }, []);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    setIsLoading(true);
    try {
      const [folderUri, cachedSongs, pool, imgFolder, savedQueue, savedIndex, savedShuffle] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.MUSIC_FOLDER),
          AsyncStorage.getItem(STORAGE_KEYS.SONGS),
          AsyncStorage.getItem(STORAGE_KEYS.IMAGE_POOL),
          AsyncStorage.getItem(STORAGE_KEYS.IMAGE_FOLDER),
          AsyncStorage.getItem(STORAGE_KEYS.QUEUE),
          AsyncStorage.getItem(STORAGE_KEYS.CURRENT_INDEX),
          AsyncStorage.getItem(STORAGE_KEYS.SHUFFLE),
        ]);

      if (folderUri) setMusicFolderUri(folderUri);
      if (pool) setImagePool(JSON.parse(pool));
      if (imgFolder) setImageFolderUri(imgFolder);
      if (savedShuffle) setShuffleEnabled(savedShuffle === "true");

      if (cachedSongs) {
        const parsed: Song[] = JSON.parse(cachedSongs);
        setSongs(parsed);
        if (savedQueue) {
          const q: Song[] = JSON.parse(savedQueue);
          setQueue(q);
        } else {
          setQueue(parsed);
        }
        if (savedIndex) setCurrentIndex(parseInt(savedIndex, 10));
      }

      setIsSetupDone(!!folderUri);
    } catch (e) {
      console.error("load error", e);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Folder / Album picking ──────────────────────────────────────────────

  // Main entry point — called when user taps "Choose Folder"
  const pickMusicFolder = useCallback(async (): Promise<boolean> => {
    if (SAF_AVAILABLE) {
      // Real APK: native folder picker
      try {
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return false;
        const folderUri = permissions.directoryUri;
        const found = await scanMusicFolderSAF(folderUri);
        if (found.length === 0) return false;
        setMusicFolderUri(folderUri);
        setSongs(found);
        setQueue(found);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, folderUri),
          AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found)),
        ]);
        setIsSetupDone(true);
        return true;
      } catch (e) {
        console.error("SAF pickMusicFolder error", e);
        return false;
      }
    } else {
      // Expo Go: request MediaLibrary permission then show in-app album browser
      try {
        const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          setAlbumPermissionDenied(false);
          // Fetch all albums (= folders) that contain audio files
          const allAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
          // Filter to only albums that actually have audio (assetCount > 0)
          // and sort by name
          const audioAlbums = allAlbums
            .filter((a) => (a.assetCount ?? 0) > 0)
            .sort((a, b) => a.title.localeCompare(b.title));
          setAlbums(audioAlbums);
          setShowAlbumPicker(true);
          return false; // not done yet — user still needs to pick an album
        } else {
          setAlbumPermissionDenied(true);
          setShowAlbumPicker(true); // show the picker UI with the permission error
          return false;
        }
      } catch (e) {
        console.error("MediaLibrary pickMusicFolder error", e);
        return false;
      }
    }
  }, []);

  // Called when user selects an album from the in-app browser
  const selectAlbum = useCallback(async (album: MediaLibrary.Album) => {
    setIsScanningAlbum(true);
    try {
      const found = await scanAlbum(album);
      if (found.length === 0) return;
      const folderKey = `album:${album.id}`;
      setMusicFolderUri(folderKey);
      setSongs(found);
      setQueue(found);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, folderKey),
        AsyncStorage.setItem(STORAGE_KEYS.MUSIC_ALBUM_ID, album.id),
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found)),
      ]);
      setShowAlbumPicker(false);
      setIsSetupDone(true);
    } catch (e) {
      console.error("selectAlbum error", e);
    } finally {
      setIsScanningAlbum(false);
    }
  }, []);

  const dismissAlbumPicker = useCallback(() => {
    setShowAlbumPicker(false);
  }, []);

  const openAppSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  // Rescan: reload songs from the saved folder/album
  const rescanFolder = useCallback(async () => {
    if (!musicFolderUri) return;
    setIsLoading(true);
    try {
      if (SAF_AVAILABLE && musicFolderUri.startsWith("content://")) {
        const found = await scanMusicFolderSAF(musicFolderUri);
        setSongs(found);
        setQueue(found);
        await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
      } else if (musicFolderUri.startsWith("album:")) {
        const albumId = await AsyncStorage.getItem(STORAGE_KEYS.MUSIC_ALBUM_ID);
        if (albumId) {
          const album = await MediaLibrary.getAlbumAsync(albumId);
          if (album) {
            const found = await scanAlbum(album);
            setSongs(found);
            setQueue(found);
            await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
          }
        }
      }
    } catch (e) {
      console.error("rescanFolder error", e);
    } finally {
      setIsLoading(false);
    }
  }, [musicFolderUri]);

  // Change folder — reset setup and re-open the picker
  const changeFolder = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.MUSIC_FOLDER),
      AsyncStorage.removeItem(STORAGE_KEYS.MUSIC_ALBUM_ID),
      AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
      AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
    ]);
    setIsSetupDone(false);
    setMusicFolderUri(null);
    setSongs([]);
    setQueue([]);
  }, []);

  // ── Playback ────────────────────────────────────────────────────────────

  const playSong = useCallback(
    async (song: Song, newQueue?: Song[], indexInQueue?: number) => {
      try {
        const q = newQueue ?? queue;
        const idx = indexInQueue ?? q.findIndex((s) => s.id === song.id);
        const resolvedIdx = idx >= 0 ? idx : 0;
        setCurrentIndex(resolvedIdx);
        if (newQueue) setQueue(newQueue);
        player.replace({ uri: song.uri });
        player.play();
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(q)),
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(resolvedIdx)),
        ]);
      } catch (e) {
        console.error("play error", e);
      }
    },
    [player, queue]
  );

  const togglePlayPause = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const playNext = useCallback(async () => {
    if (queue.length === 0) return;
    const nextIndex = (currentIndex + 1) % queue.length;
    const nextSong = queue[nextIndex];
    setCurrentIndex(nextIndex);
    player.replace({ uri: nextSong.uri });
    player.play();
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(nextIndex));
  }, [player, queue, currentIndex]);

  const playPrev = useCallback(async () => {
    if (queue.length === 0) return;
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    const prevSong = queue[prevIndex];
    setCurrentIndex(prevIndex);
    player.replace({ uri: prevSong.uri });
    player.play();
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(prevIndex));
  }, [player, queue, currentIndex]);

  const toggleShuffle = useCallback(async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    await AsyncStorage.setItem(STORAGE_KEYS.SHUFFLE, String(next));
    if (next) {
      const shuffled = shuffleArray(songs);
      setQueue(shuffled);
      const newIdx = shuffled.findIndex((s) => s.id === currentSong?.id);
      setCurrentIndex(newIdx >= 0 ? newIdx : 0);
      await AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(shuffled));
    } else {
      setQueue([...songs]);
      const newIdx = songs.findIndex((s) => s.id === currentSong?.id);
      setCurrentIndex(newIdx >= 0 ? newIdx : 0);
      await AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(songs));
    }
  }, [shuffleEnabled, songs, currentSong]);

  useEffect(() => {
    if (status.didJustFinish) {
      playNext();
    }
  }, [status.didJustFinish]);

  // ── Image pool ──────────────────────────────────────────────────────────

  const addImagesToPool = useCallback(
    async (uris: string[]) => {
      const next = [...new Set([...imagePool, ...uris])];
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool]
  );

  const removeImageFromPool = useCallback(
    async (uri: string) => {
      const next = imagePool.filter((u) => u !== uri);
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool]
  );

  const pickImageFolder = useCallback(async () => {
    try {
      if (SAF_AVAILABLE) {
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const folderUri = permissions.directoryUri;
          setImageFolderUri(folderUri);
          await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_FOLDER, folderUri);
          const files = await SAF.readDirectoryAsync(folderUri);
          const imgs = files.filter((f) => {
            const lower = f.toLowerCase();
            return lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
              lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".gif");
          });
          if (imgs.length > 0) {
            await addImagesToPool(imgs);
            return;
          }
        }
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const imgs = result.assets
          .filter((a) => {
            const n = (a.name || a.uri).toLowerCase();
            return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") ||
              n.endsWith(".webp") || n.endsWith(".gif");
          })
          .map((a) => a.uri);
        if (imgs.length > 0) await addImagesToPool(imgs);
      }
    } catch (e) {
      console.error("pickImageFolder error", e);
    }
  }, [addImagesToPool]);

  const seekTo = useCallback(
    (positionSecs: number) => {
      player.seekTo(positionSecs);
    },
    [player]
  );

  return {
    musicFolderUri,
    songs,
    queue,
    currentIndex,
    currentSong,
    shuffleEnabled,
    isLoading,
    isSetupDone,
    imagePool,
    imageFolderUri,
    status,
    player,
    SAF_AVAILABLE,
    // Album picker (Expo Go folder browser)
    albums,
    showAlbumPicker,
    albumPermissionDenied,
    isScanningAlbum,
    pickMusicFolder,
    selectAlbum,
    dismissAlbumPicker,
    openAppSettings,
    rescanFolder,
    changeFolder,
    playSong,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    addImagesToPool,
    removeImageFromPool,
    pickImageFolder,
    seekTo,
  };
});

export { MusicContextProvider, useMusicContext };
