import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
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

// ── Artwork sequence builder ──────────────────────────────────────────────────
//
// Walks the queue in order and assigns one image per song.
// Rules:
//   • Adjacent songs in the queue are NEVER assigned the same image.
//   • When songs > images, images repeat freely for non-adjacent songs.
//   • Pool of 1 image: all songs get that image (no-repeat falls back gracefully).
//   • Assignment is random per session, so it changes each app restart.
//
function buildArtworkSequence(
  queue: Song[],
  pool: string[],
  existing?: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!pool.length || !queue.length) return map;

  let lastUri: string | null = null;

  for (const song of queue) {
    // Preserve any existing valid assignment so custom artwork is never lost
    const prior = existing?.get(song.id);
    if (prior && pool.includes(prior)) {
      map.set(song.id, prior);
      lastUri = prior;
      continue;
    }
    // Exclude the last assigned image so adjacent songs differ
    const candidates = pool.filter((u) => u !== lastUri);
    // If only 1 image in pool, candidates will be empty — fall back to full pool
    const available = candidates.length > 0 ? candidates : pool;
    const picked = available[Math.floor(Math.random() * available.length)];
    map.set(song.id, picked);
    lastUri = picked;
  }

  return map;
}

// Keep the export for any legacy import — no longer used for in-app picking
export function stableImageIndex(id: string, poolSize: number): number {
  if (poolSize === 0) return 0;
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) + id.charCodeAt(i)) & 0x7fffffff;
  }
  return h % poolSize;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Song = {
  id: string;
  title: string;
  artist: string;
  uri: string;
  filename: string;
  duration?: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  SONGS: "cached_songs",
  IMAGE_POOL: "image_pool",
  IMAGE_POOL_CUSTOM: "image_pool_custom",
  IMAGE_FOLDER: "image_folder_uri",
  QUEUE: "playback_queue",
  CURRENT_INDEX: "current_index",
  SHUFFLE: "shuffle_enabled",
  RECENTLY_PLAYED: "recently_played",
  FAVORITES: "favorites_v1",
  ARTWORK_MAP: "artwork_map_v1",
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

// ── iTunes lock-screen artwork cache ─────────────────────────────────────────

const _itunesCache = new Map<string, string | null>();

async function fetchItunesArtwork(
  title: string,
  artist: string,
): Promise<string | undefined> {
  const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
  if (_itunesCache.has(key)) return _itunesCache.get(key) ?? undefined;
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw: string | undefined = json?.results?.[0]?.artworkUrl100;
    const url = raw ? raw.replace("100x100bb", "600x600bb") : null;
    _itunesCache.set(key, url);
    return url ?? undefined;
  } catch {
    _itunesCache.set(key, null);
    return undefined;
  }
}

// ── Song / audio helpers ──────────────────────────────────────────────────────

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

// ── Permanent artwork storage ─────────────────────────────────────────────────
// Expo image picker returns temporary cache URIs that disappear between sessions.
// This helper copies an image to app's documentDirectory so it survives restarts.
const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;

async function ensureArtworkDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ARTWORK_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
}

async function copyToPermanent(tempUri: string): Promise<string> {
  await ensureArtworkDir();
  // Derive extension from URI; fall back to .jpg
  const ext = tempUri.split("?")[0].match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".jpg";
  const filename = `artwork_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const dest = `${ARTWORK_DIR}${filename}`;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
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
  // Copy each picked image to permanent storage before returning URIs
  const permanentUris = await Promise.all(
    result.assets.map((a) => copyToPermanent(a.uri)),
  );
  return permanentUris;
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
  };
}

// ── TrackPlayer setup ─────────────────────────────────────────────────────────

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

// ── Context ───────────────────────────────────────────────────────────────────

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
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);    // array of song URIs

  // ── Artwork tracking ──────────────────────────────────────────────────────
  const [currentArtworkUri, setCurrentArtworkUri] = useState<string | null>(null);

  // Full session map: songId → image URI, built once per queue-establishment.
  // Built upfront in queue order so adjacent-song no-repeat is guaranteed
  // structurally, not just reactively.
  const artworkMap = useRef(new Map<string, string>());

  // Persist artworkMap to AsyncStorage (non-blocking)
  const saveArtworkMap = useCallback(() => {
    const obj: Record<string, string> = {};
    artworkMap.current.forEach((v, k) => { obj[k] = v; });
    AsyncStorage.setItem(STORAGE_KEYS.ARTWORK_MAP, JSON.stringify(obj)).catch(() => {});
  }, []);

  // URIs added in the current picker session — consumed once to prioritise
  // showing fresh images immediately after the user adds them.
  const pendingNewUris = useRef<string[]>([]);

  const imagePoolRef = useRef<string[]>([]);
  useEffect(() => { imagePoolRef.current = imagePool; }, [imagePool]);

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

  // ── Artwork display — fires when current song changes ──────────────────────
  //
  // Strategy:
  //   1. If pendingNewUris exist (user just added images), pick the LAST image
  //      in the new batch for the current song immediately (most recently added
  //      image gets shown first). Then clear pendingNewUris.
  //   2. Otherwise look up the pre-built artworkMap (O(1)).
  //   3. If not in map (e.g. removed + re-added), fall back to random pick
  //      excluding the last shown image.
  //
  useEffect(() => {
    const pool = imagePoolRef.current;
    if (!pool.length || !currentSong) {
      // Guard: don't wipe artwork during intermediate renders where state
      // updates haven't fully landed (e.g. setCurrentIndex fired before
      // setQueue, leaving currentSong temporarily null). Explicit callers
      // such as resetSetup and removeSongs clear currentArtworkUri when
      // they genuinely want the player to show no artwork.
      return;
    }

    const songId = currentSong.id;
    const pending = pendingNewUris.current;

    if (pending.length > 0) {
      // Consume pending batch — pick the last (most recently added) that differs
      // from whatever was just showing.
      pendingNewUris.current = [];
      const last = artworkMap.current.get(songId) ?? null;
      const candidates = pending.filter((u) => u !== last);
      const picked = candidates.length > 0
        ? candidates[candidates.length - 1]   // last = most recently added
        : pending[pending.length - 1];
      artworkMap.current.set(songId, picked);
      setCurrentArtworkUri(picked);
      return;
    }

    // Normal path: look up pre-built map
    const assigned = artworkMap.current.get(songId);
    if (assigned && pool.includes(assigned)) {
      setCurrentArtworkUri(assigned);
      return;
    }

    // Fallback: image was removed, cropped, or song never assigned.
    // Always use the first image in the pool so the player is never blank.
    const picked = pool[0];
    artworkMap.current.set(songId, picked);
    setCurrentArtworkUri(picked);
  }, [currentSong?.id, imagePool]);

  // ── Sync active track index + fetch lock-screen artwork ───────────────────
  useEffect(() => {
    if (!activeTrack?.id || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.id === activeTrack.id);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
      AsyncStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(idx));
    }
    const song = idx >= 0 ? queue[idx] : null;

    // ── Recently played tracking ─────────────────────────────────────────
    if (song) {
      // In-session only — capped at 10, not persisted (resets on app restart)
      setRecentlyPlayed((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [song, ...filtered].slice(0, 10);
      });
    }

    if (song && artworkFetchedFor.current !== song.id) {
      artworkFetchedFor.current = song.id;
      fetchItunesArtwork(song.title, song.artist)
        .then((url) => {
          if (url) TrackPlayer.updateNowPlayingMetadata({ artwork: url }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [activeTrack?.id]);

  // ── Load persisted data ───────────────────────────────────────────────────
  async function loadPersistedData() {
    setIsLoading(true);
    try {
      const [
        cachedSongs, pool, customFlag, imgFolder,
        savedQueue, savedIndex, savedShuffle, favRaw, artMapRaw,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.SONGS),
        AsyncStorage.getItem(STORAGE_KEYS.IMAGE_POOL),
        AsyncStorage.getItem(STORAGE_KEYS.IMAGE_POOL_CUSTOM),
        AsyncStorage.getItem(STORAGE_KEYS.IMAGE_FOLDER),
        AsyncStorage.getItem(STORAGE_KEYS.QUEUE),
        AsyncStorage.getItem(STORAGE_KEYS.CURRENT_INDEX),
        AsyncStorage.getItem(STORAGE_KEYS.SHUFFLE),
        AsyncStorage.getItem(STORAGE_KEYS.FAVORITES),
        AsyncStorage.getItem(STORAGE_KEYS.ARTWORK_MAP),
      ]);

      // Restore persisted song→image assignments
      if (artMapRaw) {
        try {
          const obj = JSON.parse(artMapRaw) as Record<string, string>;
          artworkMap.current = new Map(Object.entries(obj));
        } catch {}
      }

      if (favRaw) {
        try { setFavorites(JSON.parse(favRaw) as string[]); } catch {}
      }

      if (imgFolder) setImageFolderUri(imgFolder);
      // Shuffle is intentionally NOT restored on restart — always boot in
      // original order with shuffle OFF (like Spotify/YouTube Music cold start).
      setShuffleEnabled(false);
      if (customFlag === "true") setHasCustomImages(true);

      let resolvedPool: string[];
      if (pool) {
        const parsed: string[] = JSON.parse(pool);
        // Validate permanent file:// URIs — remove any that were deleted/moved
        const validated = await Promise.all(
          parsed.map(async (uri) => {
            if (!uri.startsWith("file://")) return uri;     // http/https URIs always valid
            const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
            return info.exists ? uri : null;
          }),
        );
        resolvedPool = validated.filter((u): u is string => u !== null);
        if (resolvedPool.length !== parsed.length) {
          // Persist cleaned pool
          await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(resolvedPool));
        }
        if (resolvedPool.length === 0) {
          // All custom images gone — fall back to defaults
          resolvedPool = await getDefaultArtworkUris();
          await AsyncStorage.multiSet([
            [STORAGE_KEYS.IMAGE_POOL, JSON.stringify(resolvedPool)],
            [STORAGE_KEYS.IMAGE_POOL_CUSTOM, "false"],
          ]);
          setHasCustomImages(false);
        }
      } else {
        resolvedPool = await getDefaultArtworkUris();
        await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(resolvedPool));
      }
      imagePoolRef.current = resolvedPool;
      setImagePool(resolvedPool);

      if (cachedSongs) {
        const parsed: Song[] = JSON.parse(cachedSongs);
        // Keep songs sorted A-Z — the library always browses alphabetically
        parsed.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
        );

        // Always restore in original (unshuffled) order.
        // Try to resume from the same song — find it in the original order.
        const prevQ: Song[] = savedQueue ? JSON.parse(savedQueue) : parsed;
        const prevIdx = savedIndex ? parseInt(savedIndex, 10) : 0;
        const prevSong = prevQ[prevIdx] ?? null;
        const idx = prevSong
          ? Math.max(0, parsed.findIndex((s) => s.uri === prevSong.uri))
          : 0;

        setSongs(parsed);
        setQueue(parsed);
        setCurrentIndex(idx);

        // Persist corrected state so next restart also uses original order
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.QUEUE, JSON.stringify(parsed)],
          [STORAGE_KEYS.CURRENT_INDEX, String(idx)],
          [STORAGE_KEYS.SHUFFLE, "false"],
        ]);

        // Pre-build artwork map — preserve saved song→image assignments loaded
        // from AsyncStorage above; only fill in missing entries with new picks.
        artworkMap.current = buildArtworkSequence(parsed, resolvedPool, artworkMap.current);

        const tracks = parsed.map(songToTrack);
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
        // Keep master song list sorted A-Z
        merged.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
        );
        AsyncStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(merged));
        AsyncStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(merged));
        return merged;
      });
      await new Promise<void>((r) => setTimeout(r, 50));

      // Pre-build artwork sequence for the full merged queue (preserve existing)
      artworkMap.current = buildArtworkSequence(merged, imagePoolRef.current, artworkMap.current);

      const tracks = merged.map(songToTrack);
      await TrackPlayer.setQueue(tracks);
      setQueue(merged);
      setCurrentIndex(0);
      setShuffleEnabled(false);

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.CURRENT_INDEX, "0"],
        [STORAGE_KEYS.SHUFFLE, "false"],
      ]);

      setIsSetupDone(true);
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
      const newIdx = idSet.has(currentSong?.id ?? "")
        ? 0
        : Math.max(0, newQueue.findIndex((s) => s.id === currentSong?.id));

      setSongs(newSongs);
      setQueue(newQueue);
      setCurrentIndex(newIdx);

      if (newSongs.length === 0) {
        setIsSetupDone(false);
        artworkMap.current.clear();
        setCurrentArtworkUri(null);
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
    setCurrentArtworkUri(null);
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

  // ── Play a song chosen from the library (A-Z view) ───────────────────────
  // Library always shows `songs` sorted A-Z. When the user taps a song there
  // we build a new playback queue:
  //   • Shuffle OFF → queue = songs A-Z, start at the tapped song's position
  //   • Shuffle ON  → tapped song plays first, rest of songs shuffled after it
  const playSongFromLibrary = useCallback(
    async (song: Song) => {
      try {
        let newQueue: Song[];
        let targetIdx: number;

        if (shuffleEnabled) {
          const rest = shuffleArray(songs.filter((s) => s.id !== song.id));
          newQueue = [song, ...rest];
          targetIdx = 0;
        } else {
          newQueue = [...songs]; // already sorted A-Z
          targetIdx = songs.findIndex((s) => s.id === song.id);
          if (targetIdx < 0) targetIdx = 0;
        }

        artworkMap.current = buildArtworkSequence(newQueue, imagePoolRef.current, artworkMap.current);
        saveArtworkMap();
        // Push artwork immediately so the player never shows a blank frame
        setCurrentArtworkUri(
          artworkMap.current.get(newQueue[targetIdx].id) ?? imagePoolRef.current[0] ?? null,
        );
        await TrackPlayer.setQueue(newQueue.map(songToTrack));
        if (targetIdx > 0) await TrackPlayer.skip(targetIdx);
        await TrackPlayer.play();
        setQueue(newQueue);
        setCurrentIndex(targetIdx);
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.QUEUE, JSON.stringify(newQueue)],
          [STORAGE_KEYS.CURRENT_INDEX, String(targetIdx)],
        ]);
      } catch (e) {
        console.error("playSongFromLibrary error", e);
      }
    },
    [shuffleEnabled, songs, saveArtworkMap],
  );

  // ── Play from a context-specific list (Liked / Recent / filtered Songs) ──
  // This is the context-aware queue builder. Whatever list the user is currently
  // viewing in the library becomes the exclusive, isolated playback queue.
  const playFromContext = useCallback(
    async (song: Song, contextList: Song[]) => {
      if (!contextList.length) return;
      try {
        let newQueue: Song[];
        let targetIdx: number;

        if (shuffleEnabled) {
          const rest = shuffleArray(contextList.filter((s) => s.id !== song.id));
          newQueue = [song, ...rest];
          targetIdx = 0;
        } else {
          newQueue = [...contextList];
          targetIdx = contextList.findIndex((s) => s.id === song.id);
          if (targetIdx < 0) targetIdx = 0;
        }

        artworkMap.current = buildArtworkSequence(newQueue, imagePoolRef.current, artworkMap.current);
        saveArtworkMap();
        // Push artwork immediately so the player never shows a blank frame
        setCurrentArtworkUri(
          artworkMap.current.get(newQueue[targetIdx].id) ?? imagePoolRef.current[0] ?? null,
        );
        await TrackPlayer.reset();
        await TrackPlayer.add(newQueue.map(songToTrack));
        if (targetIdx > 0) await TrackPlayer.skip(targetIdx);
        await TrackPlayer.play();
        setQueue(newQueue);
        setCurrentIndex(targetIdx);
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.QUEUE, JSON.stringify(newQueue)],
          [STORAGE_KEYS.CURRENT_INDEX, String(targetIdx)],
        ]);
      } catch (e) {
        console.error("playFromContext error", e);
      }
    },
    [shuffleEnabled, saveArtworkMap],
  );

  // ── Playback controls ─────────────────────────────────────────────────────
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

    // Context-aware: if the current song is a favorite, shuffle/unshuffle
    // within the favorites list only. Otherwise operate on all songs.
    const favSet = new Set(favorites);
    const isInFavContext = currentSong ? favSet.has(currentSong.uri) : false;
    const contextSongs = isInFavContext
      ? songs.filter((s) => favSet.has(s.uri))
      : [...songs];

    const newOrder = next ? shuffleArray(contextSongs) : [...contextSongs];

    artworkMap.current = buildArtworkSequence(newOrder, imagePoolRef.current, artworkMap.current);
    saveArtworkMap();
    setCurrentArtworkUri(
      artworkMap.current.get(newOrder[0]?.id ?? "") ?? imagePoolRef.current[0] ?? null,
    );

    await TrackPlayer.setQueue(newOrder.map(songToTrack));
    await TrackPlayer.skip(0);
    setQueue(newOrder);
    setCurrentIndex(0);
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.QUEUE, JSON.stringify(newOrder)],
      [STORAGE_KEYS.CURRENT_INDEX, "0"],
    ]);
  }, [shuffleEnabled, songs, favorites, currentSong, saveArtworkMap]);

  const seekTo = useCallback(async (secs: number) => {
    await TrackPlayer.seekTo(secs);
  }, []);

  // ── Favorites management ──────────────────────────────────────────────────
  const toggleFavorite = useCallback(async (uri: string) => {
    setFavorites((prev) => {
      const next = prev.includes(uri)
        ? prev.filter((u) => u !== uri)
        : [...prev, uri];
      AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Re-Roll artwork for current song ─────────────────────────────────────
  const reRollArtwork = useCallback(() => {
    if (!currentSong || !imagePoolRef.current.length) return;
    const pool = imagePoolRef.current;
    const current = artworkMap.current.get(currentSong.id) ?? null;
    const candidates = pool.filter((u) => u !== current);
    const from = candidates.length > 0 ? candidates : pool;
    const picked = from[Math.floor(Math.random() * from.length)];
    artworkMap.current.set(currentSong.id, picked);
    setCurrentArtworkUri(picked);
    saveArtworkMap();
  }, [currentSong, saveArtworkMap]);

  // ── Manually assign a specific image to current song ─────────────────────
  const assignArtwork = useCallback((uri: string) => {
    if (!currentSong) return;
    artworkMap.current.set(currentSong.id, uri);
    setCurrentArtworkUri(uri);
    saveArtworkMap();
  }, [currentSong, saveArtworkMap]);

  // ── Assign a specific image to any song by its ID ────────────────────────
  const assignArtworkToSong = useCallback((songId: string, imageUri: string) => {
    artworkMap.current.set(songId, imageUri);
    if (currentSong?.id === songId) {
      setCurrentArtworkUri(imageUri);
    }
    saveArtworkMap();
  }, [currentSong, saveArtworkMap]);

  // ── Re-Roll artwork for any song by its ID ───────────────────────────────
  const reRollArtworkForSong = useCallback((songId: string) => {
    const pool = imagePoolRef.current;
    if (!pool.length) return;
    const current = artworkMap.current.get(songId) ?? null;
    const candidates = pool.filter((u) => u !== current);
    const from = candidates.length > 0 ? candidates : pool;
    const picked = from[Math.floor(Math.random() * from.length)];
    artworkMap.current.set(songId, picked);
    if (currentSong?.id === songId) {
      setCurrentArtworkUri(picked);
    }
    saveArtworkMap();
  }, [currentSong, saveArtworkMap]);

  // ── Image pool management ─────────────────────────────────────────────────

  const addImagesToPool = useCallback(
    async (uris: string[], isCustom = true) => {
      const next = [...new Set([...imagePool, ...uris])];

      // Mark as pending so the artwork effect shows the latest added image
      // immediately for the current song (before the next queue rebuild).
      pendingNewUris.current = uris;
      // Remove current song from map so the effect picks from pendingNewUris
      if (currentSong) artworkMap.current.delete(currentSong.id);

      // Rebuild the full sequence with the expanded pool so future songs also
      // benefit from the new images (non-current songs get re-assigned).
      const updatedQueue = queue; // capture current queue
      // Delay rebuilding until after state update so imagePoolRef is current
      setTimeout(() => {
        artworkMap.current = buildArtworkSequence(updatedQueue, next);
        // Re-delete current song so pendingNewUris logic in useEffect wins
        if (currentSong) artworkMap.current.delete(currentSong.id);
      }, 0);

      setImagePool(next);
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL, JSON.stringify(next));
      if (isCustom) {
        setHasCustomImages(true);
        await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_POOL_CUSTOM, "true");
      }
    },
    [imagePool, currentSong, queue],
  );

  const removeImageFromPool = useCallback(
    async (uri: string) => {
      // Evict songs that were assigned this image — they'll be re-picked lazily
      artworkMap.current.forEach((v, k) => {
        if (v === uri) artworkMap.current.delete(k);
      });
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
      // Only replace the URI in the pool array — do NOT update artworkMap.
      // This means the currently displayed artwork stays unchanged after a crop.
      // The cropped version enters the pool silently; it will appear naturally
      // when the sequence is rebuilt (next shuffle / next scan / next restart).
      // Songs that were using the old URI will fall back to a fresh random pick
      // the next time they play (pool.includes check in the artwork effect fails).
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
    recentlyPlayed,
    favorites,
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
    playSongFromLibrary,
    playFromContext,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    toggleFavorite,
    reRollArtwork,
    assignArtwork,
    assignArtworkToSong,
    reRollArtworkForSong,
    addImagesToPool,
    removeImageFromPool,
    pickImageFolder,
    cropImageInPool,
    seekTo,
  };
});

export { MusicContextProvider, useMusicContext };
