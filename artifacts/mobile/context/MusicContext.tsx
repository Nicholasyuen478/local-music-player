import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import TrackPlayer, {
  Capability,
  RepeatMode,
  State,
  Track,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from "react-native-track-player";

import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultArtworkUris } from "@/constants/defaultArtworks";

export function stableImageIndex(id: string, poolSize: number): number {
  if (poolSize === 0) return 0;
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) + id.charCodeAt(i)) & 0x7fffffff;
  }
  return h % poolSize;
}

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

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".wav",
  ".opus",
  ".wma",
  ".ape",
  ".alac",
  ".dsf",
  ".dsd",
]);

/**
 * Path fragments that indicate system / UI / non-music audio.
 * Matched case-insensitively against the full URI.
 */
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
  "/voice_memo",
  "/voicerecord",
  "/audiorecord",
  "/whatsapp/",
  "/telegram/",
  "/viber/",
  "/line/",
  "/signal/",
  "/zedge/",
  "/soundboard",
  "/callrecord",
  "/call_record",
  "/recorder/",
  "/.trash",
  "/.nomedia",
];

/**
 * Filename patterns (without extension) that are typical of non-music files.
 * Matched case-insensitively.
 */
const SKIP_FILENAME_PATTERNS = [
  /^notification[_\s-]/i,
  /^alarm[_\s-]/i,
  /^ringtone[_\s-]/i,
  /^rington[_\s-]/i,
  /^tone[_\s-]/i,
  /^alert[_\s-]/i,
  /^msg[_\s-]/i,
  /^sms[_\s-]/i,
  /^beep/i,
  /^click/i,
  /^error\d*/i,
  /^dtmf/i,
  /^silence/i,
];

/**
 * Minimum track length to be treated as a music file.
 * Filters out sound effects, notification sounds, short jingles, etc.
 */
const MIN_DURATION_SECS = 60;

function parseSongMeta(filename: string, uri: string, duration?: number): Song {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  let title = nameWithoutExt;
  let artist = "Unknown Artist";

  if (nameWithoutExt.includes(" - ")) {
    const lastSepIndex = nameWithoutExt.lastIndexOf(" - ");
    title = nameWithoutExt.substring(0, lastSepIndex).trim();
    artist = nameWithoutExt.substring(lastSepIndex + 3).trim();
  } else if (nameWithoutExt.includes("-")) {
    const lastDashIndex = nameWithoutExt.lastIndexOf("-");
    title = nameWithoutExt.substring(0, lastDashIndex).trim();
    artist = nameWithoutExt.substring(lastDashIndex + 1).trim();
  }

  if (!title) title = nameWithoutExt;
  if (!artist) artist = "Unknown Artist";

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
      // 1. Duration gate — skip short clips, sound effects, jingles
      if ((asset.duration ?? 0) < MIN_DURATION_SECS) continue;

      // 2. Path gate — skip system / messaging-app / recorder paths
      const uriLower = asset.uri.toLowerCase();
      if (SKIP_PATH_FRAGMENTS.some((frag) => uriLower.includes(frag))) continue;

      // 3. Extension gate — only known audio containers
      const fn = asset.filename.toLowerCase();
      const dotIdx = fn.lastIndexOf(".");
      if (dotIdx < 0 || !AUDIO_EXTENSIONS.has(fn.slice(dotIdx))) continue;

      // 4. Filename pattern gate — skip obvious non-music names
      const nameNoExt = fn.slice(0, dotIdx);
      if (SKIP_FILENAME_PATTERNS.some((re) => re.test(nameNoExt))) continue;

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

function songToTrack(song: Song, imagePool?: string[]): Track {
  const artwork =
    imagePool && imagePool.length > 0
      ? imagePool[stableImageIndex(song.id, imagePool.length)]
      : undefined;
  return {
    id: song.id,
    url: song.uri,
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    artwork,
  };
}

let playerSetup = false;

async function setupPlayer() {
  if (playerSetup) return;
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      waitForBuffer: true,
    });
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1,
    });
    await TrackPlayer.setRepeatMode(RepeatMode.Queue);
    playerSetup = true;
  } catch (e: any) {
    if (e?.message?.includes("already been initialized")) {
      playerSetup = true;
    } else {
      throw e;
    }
  }
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
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const imagePoolRef = useRef<string[]>([]);
  useEffect(() => {
    imagePoolRef.current = imagePool;
  }, [imagePool]);

  const playbackState = usePlaybackState();
  const progress = useProgress(250);
  const activeTrack = useActiveTrack();

  const isPlaying = playbackState.state === State.Playing;

  const currentSong = queue[currentIndex] ?? null;

  useEffect(() => {
    setupPlayer()
      .then(() => setIsPlayerReady(true))
      .catch((e) => {
        console.error("player setup error", e);
        setIsPlayerReady(true);
      });
  }, []);

  useEffect(() => {
    if (!isPlayerReady) return;
    loadPersistedData();
  }, [isPlayerReady]);

  async function loadPersistedData() {
    setIsLoading(true);
    try {
      const [
        cachedSongs,
        pool,
        customFlag,
        imgFolder,
        savedQueue,
        savedIndex,
        savedShuffle,
      ] = await Promise.all([
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
        const parsed = JSON.parse(pool) as string[];
        imagePoolRef.current = parsed;
        setImagePool(parsed);
      } else {
        const defaults = await getDefaultArtworkUris();
        imagePoolRef.current = defaults;
        setImagePool(defaults);
      }

      if (cachedSongs) {
        const parsed: Song[] = JSON.parse(cachedSongs);
        const q: Song[] = savedQueue ? JSON.parse(savedQueue) : parsed;
        const idx = savedIndex ? parseInt(savedIndex, 10) : 0;
        setSongs(parsed);
        setQueue(q);
        setCurrentIndex(idx);

        const tracks = q.map((s) => songToTrack(s, imagePoolRef.current));
        await TrackPlayer.setQueue(tracks);
        if (idx > 0 && idx < tracks.length) {
          await TrackPlayer.skip(idx);
        }

        setIsSetupDone(true);
      }
    } catch (e) {
      console.error("load error", e);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!activeTrack?.id || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.id === activeTrack.id);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
      AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(idx));
    }
  }, [activeTrack?.id]);

  const scanDeviceMusic = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const found = await scanDeviceAudio();
      if (found.length === 0) return false;

      let merged: Song[] = [];
      setSongs((prev) => {
        merged = [...prev];
        for (const s of found) {
          if (!merged.find((x) => x.uri === s.uri)) merged.push(s);
        }
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(merged));
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(merged));
        return merged;
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const tracks = merged.map((s) => songToTrack(s, imagePoolRef.current));
      await TrackPlayer.setQueue(tracks);
      setQueue(merged);
      setCurrentIndex(0);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");

      setIsSetupDone(true);
      return true;
    } catch (e) {
      console.error("scanDeviceMusic error", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        await TrackPlayer.reset();
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
          AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
          AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
        ]);
        return;
      }

      const tracks = newQueue.map((s) => songToTrack(s, imagePoolRef.current));
      await TrackPlayer.setQueue(tracks);
      if (newIdx > 0 && newIdx < tracks.length) {
        await TrackPlayer.skip(newIdx);
      }

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(newSongs)),
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newQueue)),
        AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(newIdx)),
      ]);
    },
    [songs, queue, currentIndex, currentSong],
  );

  const resetSetup = useCallback(async () => {
    await TrackPlayer.reset();
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

  const playSong = useCallback(
    async (song: Song, newQueue?: Song[], indexInQueue?: number) => {
      try {
        const q = newQueue ?? queue;
        const idx = indexInQueue ?? q.findIndex((s) => s.id === song.id);
        const resolvedIdx = idx >= 0 ? idx : 0;

        if (newQueue) {
          const tracks = newQueue.map((s) => songToTrack(s, imagePoolRef.current));
          await TrackPlayer.setQueue(tracks);
          setQueue(newQueue);
        }

        await TrackPlayer.skip(resolvedIdx);
        await TrackPlayer.play();
        setCurrentIndex(resolvedIdx);

        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(q)),
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(resolvedIdx)),
        ]);
      } catch (e) {
        console.error("play error", e);
      }
    },
    [queue],
  );

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  }, [isPlaying]);

  const playNext = useCallback(async () => {
    if (queue.length === 0) return;
    try {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch {
      await TrackPlayer.skip(0);
      await TrackPlayer.play();
    }
  }, [queue.length]);

  const playPrev = useCallback(async () => {
    if (queue.length === 0) return;
    try {
      await TrackPlayer.skipToPrevious();
      await TrackPlayer.play();
    } catch {
      await TrackPlayer.skip(queue.length - 1);
      await TrackPlayer.play();
    }
  }, [queue.length]);

  const toggleShuffle = useCallback(async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    await AsyncStorage.setItem(STORAGE_KEYS.SHUFFLE, String(next));

    const newOrder = next ? shuffleArray(songs) : [...songs];
    const newIdx = newOrder.findIndex((s) => s.id === currentSong?.id);
    const resolvedIdx = newIdx >= 0 ? newIdx : 0;

    const tracks = newOrder.map((s) => songToTrack(s, imagePoolRef.current));
    await TrackPlayer.setQueue(tracks);
    if (resolvedIdx > 0) {
      await TrackPlayer.skip(resolvedIdx);
    }

    setQueue(newOrder);
    setCurrentIndex(resolvedIdx);
    await AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newOrder));
  }, [shuffleEnabled, songs, currentSong]);

  const seekTo = useCallback(async (secs: number) => {
    await TrackPlayer.seekTo(secs);
  }, []);

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
    [imagePool],
  );

  const removeImageFromPool = useCallback(
    async (uri: string) => {
      const next = imagePool.filter((u) => u !== uri);
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool],
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

  const cropImageInPool = useCallback(
    async (oldUri: string, newUri: string) => {
      const next = imagePool.map((u) => (u === oldUri ? newUri : u));
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool],
  );

  const status = {
    playing: isPlaying,
    currentTime: progress.position,
    duration: progress.duration,
  };

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
