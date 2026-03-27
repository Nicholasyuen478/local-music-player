import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

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

async function scanMusicFolder(folderUri: string): Promise<Song[]> {
  try {
    if (Platform.OS === "android" && folderUri.startsWith("content://")) {
      const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
      const songs: Song[] = [];
      for (const fileUri of files) {
        const lower = fileUri.toLowerCase();
        if (lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".ogg") || lower.endsWith(".flac") || lower.endsWith(".wav")) {
          const filename = decodeURIComponent(fileUri.split("%2F").pop() || fileUri.split("/").pop() || fileUri);
          const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
          const parts = nameWithoutExt.split(" - ");
          const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
          const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : nameWithoutExt;
          songs.push({
            id: fileUri,
            title,
            artist,
            uri: fileUri,
            filename,
          });
        }
      }
      return songs;
    } else {
      const info = await FileSystem.getInfoAsync(folderUri);
      if (!info.exists || !info.isDirectory) return [];
      const files = await FileSystem.readDirectoryAsync(folderUri);
      const songs: Song[] = [];
      for (const filename of files) {
        const lower = filename.toLowerCase();
        if (lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".ogg") || lower.endsWith(".flac") || lower.endsWith(".wav")) {
          const uri = folderUri.endsWith("/") ? `${folderUri}${filename}` : `${folderUri}/${filename}`;
          const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
          const parts = nameWithoutExt.split(" - ");
          const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
          const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : nameWithoutExt;
          songs.push({
            id: uri,
            title,
            artist,
            uri,
            filename,
          });
        }
      }
      return songs;
    }
  } catch (e) {
    console.error("scan error", e);
    return [];
  }
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
      const [folderUri, cachedSongs, pool, imgFolder, savedQueue, savedIndex, savedShuffle] = await Promise.all([
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

  const pickMusicFolder = useCallback(async () => {
    if (Platform.OS === "android") {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return false;
      const folderUri = permissions.directoryUri;
      setMusicFolderUri(folderUri);
      await AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, folderUri);
      const found = await scanMusicFolder(folderUri);
      setSongs(found);
      setQueue(found);
      await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
      setIsSetupDone(true);
      return true;
    } else {
      const { status: perm } = await MediaLibrary.requestPermissionsAsync();
      if (perm !== "granted") return false;
      const media = await MediaLibrary.getAssetsAsync({ mediaType: "audio", first: 500 });
      const found: Song[] = media.assets.map((a) => ({
        id: a.id,
        title: a.filename.replace(/\.[^/.]+$/, ""),
        artist: "Unknown Artist",
        uri: a.uri,
        filename: a.filename,
        duration: a.duration,
      }));
      setSongs(found);
      setQueue(found);
      await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
      await AsyncStorage.setItem(STORAGE_KEYS.MUSIC_FOLDER, "media-library");
      setMusicFolderUri("media-library");
      setIsSetupDone(true);
      return true;
    }
  }, []);

  const rescanFolder = useCallback(async () => {
    if (!musicFolderUri) return;
    setIsLoading(true);
    try {
      const found = await scanMusicFolder(musicFolderUri);
      setSongs(found);
      setQueue(found);
      await AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(found));
    } finally {
      setIsLoading(false);
    }
  }, [musicFolderUri]);

  const playSong = useCallback(async (song: Song, newQueue?: Song[], indexInQueue?: number) => {
    try {
      const q = newQueue ?? queue;
      const idx = indexInQueue ?? q.findIndex((s) => s.id === song.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
      if (newQueue) setQueue(newQueue);
      player.replace({ uri: song.uri });
      player.play();
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(q)),
        AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(idx >= 0 ? idx : 0)),
      ]);
    } catch (e) {
      console.error("play error", e);
    }
  }, [player, queue]);

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

  const addImagesToPool = useCallback(async (uris: string[]) => {
    const next = [...new Set([...imagePool, ...uris])];
    setImagePool(next);
    await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
  }, [imagePool]);

  const removeImageFromPool = useCallback(async (uri: string) => {
    const next = imagePool.filter((u) => u !== uri);
    setImagePool(next);
    await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
  }, [imagePool]);

  const pickImageFolder = useCallback(async () => {
    if (Platform.OS === "android") {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return;
      const folderUri = permissions.directoryUri;
      setImageFolderUri(folderUri);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_FOLDER, folderUri);
      try {
        const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
        const imgs = files.filter((f) => {
          const lower = f.toLowerCase();
          return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".gif");
        });
        await addImagesToPool(imgs);
      } catch (e) {
        console.error("image folder scan error", e);
      }
    } else {
      const { status: perm } = await MediaLibrary.requestPermissionsAsync();
      if (perm !== "granted") return;
      const media = await MediaLibrary.getAssetsAsync({ mediaType: "photo", first: 100 });
      const uris = media.assets.map((a) => a.uri);
      await addImagesToPool(uris);
    }
  }, [addImagesToPool]);

  const seekTo = useCallback((positionSecs: number) => {
    player.seekTo(positionSecs);
  }, [player]);

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
    pickMusicFolder,
    rescanFolder,
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
