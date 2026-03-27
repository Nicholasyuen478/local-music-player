import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useState } from "react";

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
  SONGS: "cached_songs",
  IMAGE_POOL: "image_pool",
  IMAGE_FOLDER: "image_folder_uri",
  QUEUE: "playback_queue",
  CURRENT_INDEX: "current_index",
  SHUFFLE: "shuffle_enabled",
};

// SAF (Storage Access Framework) is only available in real native builds, not Expo Go
const SAF = FileSystem.StorageAccessFramework;
const SAF_AVAILABLE = !!SAF && typeof SAF?.requestDirectoryPermissionsAsync === "function";

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wav", ".opus", ".wma"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

function parseSongMeta(filename: string, uri: string, duration?: number): Song {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt.split(" - ");
  const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
  const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : nameWithoutExt;
  return { id: uri, title, artist, uri, filename, duration };
}

// Real APK build: use SAF to pick and scan a folder
async function scanMusicFolderSAF(folderUri: string): Promise<Song[]> {
  try {
    const files = await SAF.readDirectoryAsync(folderUri);
    const songs: Song[] = [];
    for (const fileUri of files) {
      const lower = fileUri.toLowerCase();
      if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
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

// Expo Go: open file picker, user navigates to folder and selects files
async function pickAudioViaDocumentPicker(): Promise<Song[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",          // Most reliable on all Android versions
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return [];

  return result.assets
    .filter((a) => {
      const name = (a.name || a.uri).toLowerCase();
      return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
    })
    .map((a) => {
      const filename = a.name || a.uri.split("/").pop() || "Unknown";
      return parseSongMeta(filename, a.uri);
    });
}

async function pickImagesViaDocumentPicker(): Promise<string[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets) return [];
  return result.assets
    .filter((a) => {
      const name = (a.name || a.uri).toLowerCase();
      return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
    })
    .map((a) => a.uri);
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
          setQueue(JSON.parse(savedQueue));
        } else {
          setQueue(parsed);
        }
        if (savedIndex) setCurrentIndex(parseInt(savedIndex, 10));
      }

      setIsSetupDone(!!folderUri && !!cachedSongs);
    } catch (e) {
      console.error("load error", e);
    } finally {
      setIsLoading(false);
    }
  }

  // Main pick entry: SAF folder in real APK, file picker in Expo Go
  const pickMusicFolder = useCallback(async (): Promise<boolean> => {
    try {
      if (SAF_AVAILABLE) {
        const perm = await SAF.requestDirectoryPermissionsAsync();
        if (!perm.granted) return false;
        const folderUri = perm.directoryUri;
        const found = await scanMusicFolderSAF(folderUri);
        if (found.length === 0) return false;
        setMusicFolderUri(folderUri);
        setSongs(found);
        setQueue(found);
        setCurrentIndex(0);
        setIsSetupDone(true);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, folderUri),
          AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found)),
          AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(found)),
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0"),
        ]);
        return true;
      } else {
        const found = await pickAudioViaDocumentPicker();
        if (found.length === 0) return false;
        setMusicFolderUri("picker");
        setSongs(found);
        setQueue(found);
        setCurrentIndex(0);
        setIsSetupDone(true);
        // Auto-load the first song so the player is ready
        player.replace({ uri: found[0].uri });
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, "picker"),
          AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found)),
          AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(found)),
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0"),
        ]);
        return true;
      }
    } catch (e) {
      console.error("pickMusicFolder error", e);
      return false;
    }
  }, [player]);

  // Add more files on top of existing songs (Expo Go)
  const addMoreSongs = useCallback(async () => {
    try {
      const found = await pickAudioViaDocumentPicker();
      if (found.length === 0) return;
      const merged = [...songs];
      for (const s of found) {
        if (!merged.find((x) => x.uri === s.uri)) merged.push(s);
      }
      setSongs(merged);
      setQueue(merged);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(merged)),
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(merged)),
      ]);
    } catch (e) {
      console.error("addMoreSongs error", e);
    }
  }, [songs]);

  // Rescan: re-read from SAF folder (real APK) or re-open picker (Expo Go)
  const rescanFolder = useCallback(async () => {
    if (!musicFolderUri) return;
    setIsLoading(true);
    try {
      if (SAF_AVAILABLE && musicFolderUri.startsWith("content://")) {
        const found = await scanMusicFolderSAF(musicFolderUri);
        setSongs(found);
        setQueue(found);
        await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
      } else {
        await addMoreSongs();
      }
    } catch (e) {
      console.error("rescanFolder error", e);
    } finally {
      setIsLoading(false);
    }
  }, [musicFolderUri, addMoreSongs]);

  // Reset to setup screen
  const resetSetup = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.MUSIC_FOLDER),
      AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
      AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
      AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
    ]);
    setIsSetupDone(false);
    setMusicFolderUri(null);
    setSongs([]);
    setQueue([]);
    setCurrentIndex(0);
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
    if (status.playing) player.pause();
    else player.play();
  }, [player, status.playing]);

  const playNext = useCallback(async () => {
    if (queue.length === 0) return;
    const nextIndex = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIndex);
    player.replace({ uri: queue[nextIndex].uri });
    player.play();
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(nextIndex));
  }, [player, queue, currentIndex]);

  const playPrev = useCallback(async () => {
    if (queue.length === 0) return;
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prevIndex);
    player.replace({ uri: queue[prevIndex].uri });
    player.play();
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(prevIndex));
  }, [player, queue, currentIndex]);

  const toggleShuffle = useCallback(async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    await AsyncStorage.setItem(STORAGE_KEYS.SHUFFLE, String(next));
    const newOrder = next ? shuffleArray(songs) : [...songs];
    const newIdx = newOrder.findIndex((s) => s.id === currentSong?.id);
    setQueue(newOrder);
    setCurrentIndex(newIdx >= 0 ? newIdx : 0);
    await AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newOrder));
  }, [shuffleEnabled, songs, currentSong]);

  useEffect(() => {
    if (status.didJustFinish) playNext();
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
        const perm = await SAF.requestDirectoryPermissionsAsync();
        if (perm.granted) {
          const files = await SAF.readDirectoryAsync(perm.directoryUri);
          const imgs = files.filter((f) =>
            IMAGE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext))
          );
          if (imgs.length > 0) {
            await addImagesToPool(imgs);
            return;
          }
        }
      }
      const uris = await pickImagesViaDocumentPicker();
      if (uris.length > 0) await addImagesToPool(uris);
    } catch (e) {
      console.error("pickImageFolder error", e);
    }
  }, [addImagesToPool]);

  const seekTo = useCallback((secs: number) => { player.seekTo(secs); }, [player]);

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
    pickMusicFolder,
    addMoreSongs,
    rescanFolder,
    resetSetup,
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
