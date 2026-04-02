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

// ── Artwork helpers ───────────────────────────────────────────────────────────

/**
 * Djb2 hash — deterministic and fast, used for session-stable artwork assignment.
 * Using a different multiplier from stableImageIndex to avoid visual correlation
 * between pool index and song order.
 */
function artHash(str: string, mod: number): number {
  let h = 7919; // prime seed
  for (let i = 0; i < str.length; i++) {
    h = ((h * 31) + str.charCodeAt(i)) & 0x7fffffff;
  }
  return h % mod;
}

/**
 * Pick an artwork URI for a song using the standard music-app pooled-art pattern:
 *  1. If pendingNew URIs exist (user just added images), prefer those — pick the
 *     LAST one in the batch (most recently added) that isn't the same as lastUri.
 *  2. Otherwise use the full pool, excluding lastUri (no-repeat rule).
 *  3. Fall back to full pool if all candidates equal lastUri (single-image pool).
 */
function pickArtwork(
  songId: string,
  pool: string[],
  lastUri: string | null,
  pendingNew: string[],
): string {
  const base = pendingNew.length > 0 ? pendingNew : pool;

  // Filter out the last shown image — no-repeat rule
  const candidates = base.filter((u) => u !== lastUri);
  const available = candidates.length > 0 ? candidates : base;

  if (pendingNew.length > 0) {
    // Prefer the last image in the newly added batch (most recently added)
    for (let i = available.length - 1; i >= 0; i--) {
      if (available[i] !== lastUri) return available[i];
    }
    return available[available.length - 1];
  }

  // Session-stable deterministic pick from available candidates
  return available[artHash(songId, available.length)];
}

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
  ".mp3", ".m4a", ".aac", ".ogg", ".flac",
  ".wav", ".opus", ".wma", ".ape", ".alac", ".dsf", ".dsd",
]);

const SKIP_PATH_FRAGMENTS = [
  "/ringtones/", "/ringtone/", "/notifications/", "/notification/",
  "/alarms/", "/alarm/", "system/media", "system/sounds",
  "/android/media/", "com.android", "/soundfx/", "/ui/",
  "/voice_memo", "/voicerecord", "/audiorecord",
  "/whatsapp/", "/telegram/", "/viber/", "/line/", "/signal/",
  "/zedge/", "/soundboard", "/callrecord", "/call_record",
  "/recorder/", "/.trash", "/.nomedia",
];

const SKIP_FILENAME_PATTERNS = [
  /^notification[_\s-]/i, /^alarm[_\s-]/i,
  /^ringtone[_\s-]/i, /^rington[_\s-]/i,
  /^tone[_\s-]/i, /^alert[_\s-]/i,
  /^msg[_\s-]/i, /^sms[_\s-]/i,
  /^beep/i, /^click/i, /^error\d*/i, /^dtmf/i, /^silence/i,
];

const MIN_DURATION_SECS = 60;

// ── iTunes artwork cache ───────────────────────────────────────────────────────
const _artworkCache = new Map<string, string | null>();

async function fetchItunesArtwork(
  title: string,
  artist: string,
): Promise<string | undefined> {
  const cacheKey = `${title.toLowerCase()}::${artist.toLowerCase()}`;
  if (_artworkCache.has(cacheKey)) return _artworkCache.get(cacheKey) ?? undefined;
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw: string | undefined = json?.results?.[0]?.artworkUrl100;
    const url = raw ? raw.replace("100x100bb", "600x600bb") : null;
    _artworkCache.set(cacheKey, url);
    return url ?? undefined;
  } catch {
    _artworkCache.set(cacheKey, null);
    return undefined;
  }
}

function parseSongMeta(filename: string, uri: string, duration?: number): Song {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  let title = nameWithoutExt;
  let artist = "Unknown Artist";
  if (nameWithoutExt.includes(" - ")) {
    const i = nameWithoutExt.lastIndexOf(" - ");
    title = nameWithoutExt.substring(0, i).trim();
    artist = nameWithoutExt.substring(i + 3).trim();
  } else if (nameWithoutExt.includes("-")) {
    const i = nameWithoutExt.lastIndexOf("-");
    title = nameWithoutExt.substring(0, i).trim();
    artist = nameWithoutExt.substring(i + 1).trim();
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
      if ((asset.duration ?? 0) < MIN_DURATION_SECS) continue;
      const uriLower = asset.uri.toLowerCase();
      if (SKIP_PATH_FRAGMENTS.some((f) => uriLower.includes(f))) continue;
      const fn = asset.filename.toLowerCase();
      const dot = fn.lastIndexOf(".");
      if (dot < 0 || !AUDIO_EXTENSIONS.has(fn.slice(dot))) continue;
      if (SKIP_FILENAME_PATTERNS.some((re) => re.test(fn.slice(0, dot)))) continue;
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

function songToTrack(song: Song): Track {
  return {
    id: song.id,
    url: song.uri,
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    // artwork fetched from iTunes and injected via updateNowPlayingMetadata
  };
}

let playerSetup = false;

async function setupPlayer() {
  if (playerSetup) return;
  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true, waitForBuffer: true });
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play, Capability.Pause,
        Capability.SkipToNext, Capability.SkipToPrevious,
        Capability.SeekTo, Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play, Capability.Pause,
        Capability.SkipToNext, Capability.SkipToPrevious,
      ],
      notificationCapabilities: [
        Capability.Play, Capability.Pause,
        Capability.SkipToNext, Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1,
    });
    await TrackPlayer.setRepeatMode(RepeatMode.Queue);
    playerSetup = true;
  } catch (e: any) {
    if (e?.message?.includes("already been initialized")) playerSetup = true;
    else throw e;
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

  // ── Artwork state ─────────────────────────────────────────────────────────
  const [currentArtworkUri, setCurrentArtworkUri] = useState<string | null>(null);
  // songId → assigned artwork URI — stable within a session
  const artworkMap = useRef(new Map<string, string>());
  // URI that was last shown — used for the no-repeat rule
  const lastArtworkUri = useRef<string | null>(null);
  // URIs added by the user this session — prioritised for the next pick
  const pendingNewUris = useRef<string[]>([]);

  const imagePoolRef = useRef<string[]>([]);
  useEffect(() => {
    imagePoolRef.current = imagePool;
  }, [imagePool]);

  const artworkFetchedFor = useRef<string>("");

  const playbackState = usePlaybackState();
  const progress = useProgress(250);
  const activeTrack = useActiveTrack();

  const isPlaying = playbackState.state === State.Playing;
  const currentSong = queue[currentIndex] ?? null;

  // ── Player setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    setupPlayer()
      .then(() => setIsPlayerReady(true))
      .catch((e) => { console.error("player setup error", e); setIsPlayerReady(true); });
  }, []);

  useEffect(() => {
    if (!isPlayerReady) return;
    loadPersistedData();
  }, [isPlayerReady]);

  // ── Artwork selection — runs whenever current song or image pool changes ──
  useEffect(() => {
    const pool = imagePoolRef.current;
    if (!pool.length || !currentSong) {
      setCurrentArtworkUri(null);
      return;
    }

    const { id: songId } = currentSong;
    const pending = pendingNewUris.current;

    if (pending.length > 0) {
      // Consume the pending batch — force re-assignment for this song
      pendingNewUris.current = [];
      artworkMap.current.delete(songId);
    }

    // Re-use existing assignment if it's still valid and different from lastUri
    const existing = artworkMap.current.get(songId);
    if (
      existing &&
      existing !== lastArtworkUri.current &&
      pool.includes(existing)
    ) {
      lastArtworkUri.current = existing;
      setCurrentArtworkUri(existing);
      return;
    }

    // Pick a new image for this song
    const picked = pickArtwork(songId, pool, lastArtworkUri.current, pending);
    artworkMap.current.set(songId, picked);
    lastArtworkUri.current = picked;
    setCurrentArtworkUri(picked);
  }, [currentSong?.id, imagePool]);

  // ── Load persisted data ───────────────────────────────────────────────────
  async function loadPersistedData() {
    setIsLoading(true);
    try {
      const [
        cachedSongs, pool, customFlag, imgFolder,
        savedQueue, savedIndex, savedShuffle,
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
        const tracks = q.map(songToTrack);
        await TrackPlayer.setQueue(tracks);
        if (idx > 0 && idx < tracks.length) await TrackPlayer.skip(idx);
        setIsSetupDone(true);
      }
    } catch (e) {
      console.error("load error", e);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Active track changed — sync index + fetch lock-screen artwork ─────────
  useEffect(() => {
    if (!activeTrack?.id || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.id === activeTrack.id);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
      AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(idx));
    }
    const song = idx >= 0 ? queue[idx] : null;
    if (song && artworkFetchedFor.current !== song.id) {
      artworkFetchedFor.current = song.id;
      fetchItunesArtwork(song.title, song.artist)
        .then((url) => {
          if (url) TrackPlayer.updateNowPlayingMetadata({ artwork: url }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [activeTrack?.id]);

  // ── Scan device music ─────────────────────────────────────────────────────
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

      const tracks = merged.map(songToTrack);
      await TrackPlayer.setQueue(tracks);
      setQueue(merged);
      setCurrentIndex(0);

      // Reset shuffle OFF, reset artwork assignment, then auto-play
      artworkMap.current.clear();
      lastArtworkUri.current = null;
      setShuffleEnabled(false);

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.CURRENT_INDEX, "0"],
        [STORAGE_KEYS.SHUFFLE, "false"],
      ]);

      setIsSetupDone(true);

      // Auto-play immediately after library is ready
      await TrackPlayer.play();

      return true;
    } catch (e) {
      console.error("scanDeviceMusic error", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Remove songs ──────────────────────────────────────────────────────────
  const removeSongs = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const newSongs = songs.filter((s) => !idSet.has(s.id));
      const newQueue = queue.filter((s) => !idSet.has(s.id));
      let newIdx = idSet.has(currentSong?.id ?? "")
        ? 0
        : Math.max(0, newQueue.findIndex((s) => s.id === currentSong?.id));

      setSongs(newSongs);
      setQueue(newQueue);
      setCurrentIndex(newIdx);

      if (newSongs.length === 0) {
        setIsSetupDone(false);
        artworkMap.current.clear();
        lastArtworkUri.current = null;
        await TrackPlayer.reset();
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
          AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
          AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
        ]);
        return;
      }

      const tracks = newQueue.map(songToTrack);
      await TrackPlayer.setQueue(tracks);
      if (newIdx > 0 && newIdx < tracks.length) await TrackPlayer.skip(newIdx);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(newSongs)),
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newQueue)),
        AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(newIdx)),
      ]);
    },
    [songs, queue, currentIndex, currentSong],
  );

  // ── Reset setup ───────────────────────────────────────────────────────────
  const resetSetup = useCallback(async () => {
    await TrackPlayer.reset();
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.SONGS),
      AsyncStorage.removeItem(STORAGE_KEYS.QUEUE),
      AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX),
      AsyncStorage.setItem(STORAGE_KEYS.SHUFFLE, "false"),
    ]);
    artworkMap.current.clear();
    lastArtworkUri.current = null;
    setIsSetupDone(false);
    setSongs([]);
    setQueue([]);
    setCurrentIndex(0);
    setShuffleEnabled(false);
  }, []);

  // ── Play a specific song ──────────────────────────────────────────────────
  const playSong = useCallback(
    async (song: Song, newQueue?: Song[], indexInQueue?: number) => {
      try {
        const q = newQueue ?? queue;
        const idx = indexInQueue ?? q.findIndex((s) => s.id === song.id);
        const resolvedIdx = idx >= 0 ? idx : 0;
        if (newQueue) {
          await TrackPlayer.setQueue(newQueue.map(songToTrack));
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
    if (isPlaying) await TrackPlayer.pause();
    else await TrackPlayer.play();
  }, [isPlaying]);

  const playNext = useCallback(async () => {
    if (queue.length === 0) return;
    try { await TrackPlayer.skipToNext(); await TrackPlayer.play(); }
    catch { await TrackPlayer.skip(0); await TrackPlayer.play(); }
  }, [queue.length]);

  const playPrev = useCallback(async () => {
    if (queue.length === 0) return;
    try { await TrackPlayer.skipToPrevious(); await TrackPlayer.play(); }
    catch { await TrackPlayer.skip(queue.length - 1); await TrackPlayer.play(); }
  }, [queue.length]);

  const toggleShuffle = useCallback(async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    await AsyncStorage.setItem(STORAGE_KEYS.SHUFFLE, String(next));
    const newOrder = next ? shuffleArray(songs) : [...songs];
    const newIdx = Math.max(0, newOrder.findIndex((s) => s.id === currentSong?.id));
    await TrackPlayer.setQueue(newOrder.map(songToTrack));
    if (newIdx > 0) await TrackPlayer.skip(newIdx);
    setQueue(newOrder);
    setCurrentIndex(newIdx);
    await AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(newOrder));
  }, [shuffleEnabled, songs, currentSong]);

  const seekTo = useCallback(async (secs: number) => {
    await TrackPlayer.seekTo(secs);
  }, []);

  // ── Image pool management ─────────────────────────────────────────────────
  const addImagesToPool = useCallback(
    async (uris: string[], isCustom = true) => {
      const next = [...new Set([...imagePool, ...uris])];
      // Mark these as pending — they'll be prioritised for the next artwork pick
      pendingNewUris.current = uris;
      // Clear current song's assignment so it gets one of the new images immediately
      if (currentSong) artworkMap.current.delete(currentSong.id);
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
      if (isCustom) {
        setHasCustomImages(true);
        await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL_CUSTOM, "true");
      }
    },
    [imagePool, currentSong],
  );

  const removeImageFromPool = useCallback(
    async (uri: string) => {
      // Evict any artwork assignments that used this URI
      artworkMap.current.forEach((v, k) => { if (v === uri) artworkMap.current.delete(k); });
      if (lastArtworkUri.current === uri) lastArtworkUri.current = null;
      const next = imagePool.filter((u) => u !== uri);
      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
    },
    [imagePool],
  );

  const pickImageFolder = useCallback(async () => {
    try {
      const uris = await pickImagesViaGallery();
      if (uris.length > 0) { await addImagesToPool(uris, true); return true; }
      return false;
    } catch (e) {
      console.error("pickImageFolder error", e);
      return false;
    }
  }, [addImagesToPool]);

  const cropImageInPool = useCallback(
    async (oldUri: string, newUri: string) => {
      // If the cropped image was assigned to any song, re-assign with new URI
      artworkMap.current.forEach((v, k) => {
        if (v === oldUri) artworkMap.current.set(k, newUri);
      });
      if (lastArtworkUri.current === oldUri) lastArtworkUri.current = newUri;
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
    currentArtworkUri,
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
