import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultArtworkUris } from "@/constants/defaultArtworks";

export type Song = {
  id: string;
  title: string;
  artist: string;
  uri: string;
  filename: string;
  duration?: number;
};

const STORAGE_KEYS = {
  SONGS: "cached_songs",
  IMAGE_POOL: "image_pool",
  IMAGE_POOL_CUSTOM: "image_pool_custom",
  IMAGE_FOLDER: "image_folder_uri",
  QUEUE: "playback_queue",
  CURRENT_INDEX: "current_index",
  SHUFFLE: "shuffle_enabled",
};

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wav", ".opus", ".wma"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

// Paths that indicate a system sound (ringtone, notification, alarm, etc.)
const SKIP_PATH_FRAGMENTS = [
  "/ringtones/",
  "/ringtone/",
  "/notifications/",
  "/notification/",
  "/alarms/",
  "/alarm/",
  "system/media",
  "system/sounds",
  "/android/media/",
  "com.android",
  "/soundfx/",
  "/ui/",
];

// Minimum duration to be considered music (skip short sound effects)
const MIN_DURATION_SECS = 30;

function parseSongMeta(filename: string, uri: string, duration?: number): Song {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt.split(" - ");
  const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
  const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : nameWithoutExt;
  return { id: uri, title, artist, uri, filename, duration };
}

async function scanDeviceAudio(): Promise<Song[]> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") return [];

  const songs: Song[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 300,
      after: cursor,
    });

    for (const asset of page.assets) {
      // Skip very short files — sound effects, notifications, UI sounds
      if ((asset.duration ?? 0) < MIN_DURATION_SECS) continue;

      // Skip system/notification/ringtone paths
      const uriLower = asset.uri.toLowerCase();
      if (SKIP_PATH_FRAGMENTS.some((frag) => uriLower.includes(frag))) continue;

      // Skip unsupported extensions
      const fn = asset.filename.toLowerCase();
      if (!AUDIO_EXTENSIONS.some((ext) => fn.endsWith(ext))) continue;

      songs.push(parseSongMeta(asset.filename, asset.uri, asset.duration));
    }

    hasMore = page.hasNextPage;
    cursor = page.endCursor;
  }

  return songs;
}

async function pickImagesViaGallery(): Promise<string[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets) return [];
  return result.assets.map((a) => a.uri);
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
  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imagePool, setImagePool] = useState<string[]>([]);
  const [imageFolderUri, setImageFolderUri] = useState<string | null>(null);
  const [isSetupDone, setIsSetupDone] = useState(false);
  const [hasCustomImages, setHasCustomImages] = useState(false);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const currentSong = queue[currentIndex] ?? null;

  // Background audio + lock screen controls
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,         // iOS: play through silent switch
      shouldPlayInBackground: true,    // Android: keep playing when screen locks
      interruptionMode: "doNotMix",    // pause/stop others instead of ducking
      staysActiveInBackground: true,   // iOS: keep audio session alive in background
    });
  }, []);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    setIsLoading(true);
    try {
      const [cachedSongs, pool, customFlag, imgFolder, savedQueue, savedIndex, savedShuffle] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SONGS),
          AsyncStorage.getItem(STORAGE_KEYS.IMAGE_POOL),
          AsyncStorage.getItem(STORAGE_KEYS.IMAGE_POOL_CUSTOM),
          AsyncStorage.getItem(STORAGE_KEYS.IMAGE_FOLDER),
          AsyncStorage.getItem(STORAGE_KEYS.QUEUE),
          AsyncStorage.getItem(STORAGE_KEYS.CURRENT_INDEX),
          AsyncStorage.getItem(STORAGE_KEYS.SHUFFLE),
        ]);

      if (imgFolder) setImageFolderUri(imgFolder);
      if (savedShuffle) setShuffleEnabled(savedShuffle === "true");
      if (customFlag === "true") setHasCustomImages(true);

      if (pool) {
        setImagePool(JSON.parse(pool));
      } else {
        const defaults = await getDefaultArtworkUris();
        setImagePool(defaults);
      }

      if (cachedSongs) {
        const parsed: Song[] = JSON.parse(cachedSongs);
        const q: Song[] = savedQueue ? JSON.parse(savedQueue) : parsed;
        const idx = savedIndex ? parseInt(savedIndex, 10) : 0;
        setSongs(parsed);
        setQueue(q);
        setCurrentIndex(idx);
        const song = q[idx];
        if (song?.uri) {
          player.replace({ uri: song.uri });
        }
        setIsSetupDone(true);
      }
    } catch (e) {
      console.error("load error", e);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Device scan ──────────────────────────────────────────────────────────
  // Run once on first launch (manual trigger), can be re-triggered manually.
  // Does NOT run automatically on every restart.

  const scanDeviceMusic = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const found = await scanDeviceAudio();
      if (found.length === 0) return false;

      // Merge with existing songs (add new, keep existing)
      setSongs((prev) => {
        const merged = [...prev];
        for (const s of found) {
          if (!merged.find((x) => x.uri === s.uri)) merged.push(s);
        }
        const next = merged;
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(next));
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(next));
        setQueue(next);
        const newIdx = 0;
        setCurrentIndex(newIdx);
        AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");
        if (next[0]?.uri) {
          player.replace({ uri: next[0].uri });
        }
        return next;
      });

      setIsSetupDone(true);
      return true;
    } catch (e) {
      console.error("scanDeviceMusic error", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [player]);

  const removeSongs = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const newSongs = songs.filter((s) => !idSet.has(s.id));
      const newQueue = queue.filter((s) => !idSet.has(s.id));

      let newIdx = currentIndex;
      if (idSet.has(currentSong?.id ?? "")) {
        newIdx = 0;
      } else {
        newIdx = newQueue.findIndex((s) => s.id === currentSong?.id);
        if (newIdx < 0) newIdx = 0;
      }

      setSongs(newSongs);
      setQueue(newQueue);
      setCurrentIndex(newIdx);

      if (newSongs.length === 0) {
        setIsSetupDone(false);
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
          AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
          AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
        ]);
        return;
      }

      const newCurrentSong = newQueue[newIdx];
      if (idSet.has(currentSong?.id ?? "") && newCurrentSong?.uri) {
        player.replace({ uri: newCurrentSong.uri });
      }

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(newSongs)),
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newQueue)),
        AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(newIdx)),
      ]);
    },
    [songs, queue, currentIndex, currentSong, player]
  );

  const resetSetup = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
      AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
      AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
    ]);
    setIsSetupDone(false);
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

  const playNextRef = useRef(playNext);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  useEffect(() => {
    if (status.didJustFinish) {
      playNextRef.current();
    }
  }, [status.didJustFinish]);

  // ── Image pool ──────────────────────────────────────────────────────────

  const addImagesToPool = useCallback(
    async (uris: string[], isCustom = true) => {
      const next = [...new Set([...imagePool, ...uris])];
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
      if (isCustom) {
        setHasCustomImages(true);
        await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL_CUSTOM, "true");
      }
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
      const uris = await pickImagesViaGallery();
      if (uris.length > 0) {
        await addImagesToPool(uris, true);
        return true;
      }
      return false;
    } catch (e) {
      console.error("pickImageFolder error", e);
      return false;
    }
  }, [addImagesToPool]);

  // Replace an existing pool image URI with a new (cropped) one
  const cropImageInPool = useCallback(
    async (oldUri: string, newUri: string) => {
      const next = imagePool.map((u) => (u === oldUri ? newUri : u));
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool]
  );

  const seekTo = useCallback((secs: number) => { player.seekTo(secs); }, [player]);

  return {
    songs,
    queue,
    currentIndex,
    currentSong,
    shuffleEnabled,
    isLoading,
    isSetupDone,
    imagePool,
    imageFolderUri,
    hasCustomImages,
    status,
    player,
    scanDeviceMusic,
    removeSongs,
    resetSetup,
    playSong,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    addImagesToPool,
    removeImageFromPool,
    pickImageFolder,
    cropImageInPool,
    seekTo,
  };
});

export { MusicContextProvider, useMusicContext };
