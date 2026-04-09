import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MicVocal, RefreshCw, WifiOff } from "lucide-react-native";
import NetInfo from "@react-native-community/netinfo";
import Colors from "@/constants/colors";

// ── LRC parser ────────────────────────────────────────────────────────────────
type LrcLine = { time: number; text: string };

function parseLrc(lrc: string): LrcLine[] {
  const re = /\[(\d{1,2}):(\d{1,2}(?:\.\d+)?)\](.*)/;
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = re.exec(raw);
    if (!m) continue;
    const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    if (text) lines.push({ time, text });
  }
  return lines;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Source = "lrclib" | "petitlyrics" | "genius";
type LyricData = { lrcLines: LrcLine[]; plain: string };
type FetchStatus = "idle" | "loading" | "done" | "empty" | "no-network";

// ── Session-level caches (cleared on app restart) ─────────────────────────────
const lyricsCache = new Map<string, LyricData | null>();
const songSourceMap = new Map<string, Source>();

const SOURCE_LABELS: Record<Source, string> = {
  lrclib: "LRClib",
  petitlyrics: "PetitLyrics",
  genius: "Genius",
};

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchLrclib(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricData | null> {
  const url =
    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.syncedLyrics) {
    const lrcLines = parseLrc(d.syncedLyrics as string);
    if (lrcLines.length) return { lrcLines, plain: "" };
  }
  if (d.plainLyrics) return { lrcLines: [], plain: d.plainLyrics as string };
  return null;
}

async function fetchPetitLyrics(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricData | null> {
  const url =
    `https://papi.petitlyrics.com/api/GetPetitLyricsData.php` +
    `?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&key=01`;
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const xml = await r.text();

  const lyricMatch = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/);
  const typeMatch  = xml.match(/<LyricType>(\d+)<\/LyricType>/);
  if (!lyricMatch) return null;

  let content = lyricMatch[1].trim();
  try { content = atob(content); } catch { /* already plaintext */ }

  const lyricType = typeMatch ? parseInt(typeMatch[1], 10) : 0;
  if (lyricType === 3) {
    const lrcLines = parseLrc(content);
    if (lrcLines.length) return { lrcLines, plain: "" };
  }
  return content.trim() ? { lrcLines: [], plain: content.trim() } : null;
}

async function fetchGenius(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricData | null> {
  const q = `${title} ${artist}`;
  const searchR = await fetch(
    `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`,
    { signal, headers: { "X-Requested-With": "XMLHttpRequest" } },
  );
  if (!searchR.ok) return null;
  const searchD = await searchR.json() as any;

  let songUrl: string | null = null;
  for (const section of (searchD?.response?.sections ?? [])) {
    const hit = (section?.hits ?? []).find((h: any) => h?.type === "song");
    if (hit?.result?.url) { songUrl = hit.result.url; break; }
  }
  if (!songUrl) return null;

  const pageR = await fetch(songUrl, { signal });
  if (!pageR.ok) return null;
  const html = await pageR.text();

  const parts: string[] = [];
  for (const m of html.matchAll(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)) {
    parts.push(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .trim(),
    );
  }
  const plain = parts.filter(Boolean).join("\n\n").trim();
  return plain ? { lrcLines: [], plain } : null;
}

async function fetchSource(
  source: Source,
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricData | null> {
  if (source === "lrclib")     return fetchLrclib(title, artist, signal);
  if (source === "petitlyrics") return fetchPetitLyrics(title, artist, signal);
  return fetchGenius(title, artist, signal);
}

// ── Component ─────────────────────────────────────────────────────────────────
type Props = { title: string; artist: string; trackId: string; position: number };

export function LyricsPanel({ title, artist, trackId, position }: Props) {
  const [source,      setSource]      = useState<Source>(() => songSourceMap.get(trackId) ?? "lrclib");
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [lyricData,   setLyricData]   = useState<LyricData | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lineY     = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    setSource(songSourceMap.get(trackId) ?? "lrclib");
  }, [trackId]);

  const doFetch = useCallback(
    async (src: Source, signal: AbortSignal) => {
      if (!title) { setFetchStatus("idle"); return; }

      const net = await NetInfo.fetch();
      if (!net.isConnected) { setFetchStatus("no-network"); return; }

      const cacheKey = `${title}\x00${artist}\x00${src}`;
      if (lyricsCache.has(cacheKey)) {
        const cached = lyricsCache.get(cacheKey) ?? null;
        setLyricData(cached);
        setFetchStatus(cached ? "done" : "empty");
        return;
      }

      setFetchStatus("loading");
      setLyricData(null);
      lineY.current.clear();

      try {
        const result = await fetchSource(src, title, artist, signal);
        if (signal.aborted) return;
        lyricsCache.set(cacheKey, result);
        setLyricData(result);
        setFetchStatus(result ? "done" : "empty");
      } catch {
        if (!signal.aborted) setFetchStatus("empty");
      }
    },
    [title, artist],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    doFetch(source, ctrl.signal);
    return () => ctrl.abort();
  }, [title, artist, source, doFetch]);

  const handleSourceChange = useCallback(
    (src: Source) => {
      songSourceMap.set(trackId, src);
      setSource(src);
    },
    [trackId],
  );

  // ── Active line (synced only) ──────────────────────────────────────────────
  const lrcLines = lyricData?.lrcLines ?? [];

  const activeIdx = useMemo(() => {
    if (!lrcLines.length || position <= 0) return 0;
    let idx = 0;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= position) idx = i;
      else break;
    }
    return idx;
  }, [lrcLines, position]);

  useEffect(() => {
    if (!lrcLines.length) return;
    const y = lineY.current.get(activeIdx) ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  }, [activeIdx, lrcLines.length]);

  // ── Source selector ────────────────────────────────────────────────────────
  const sourceSelector = (
    <View style={styles.sourceRow}>
      {(["lrclib", "petitlyrics", "genius"] as Source[]).map((s) => (
        <TouchableOpacity
          key={s}
          style={[styles.sourceBtn, source === s && styles.sourceBtnActive]}
          onPress={() => handleSourceChange(s)}
          activeOpacity={0.72}
        >
          <Text style={[styles.sourceBtnText, source === s && styles.sourceBtnTextActive]}>
            {SOURCE_LABELS[s]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (fetchStatus === "loading") {
    return (
      <View style={styles.flex}>
        {sourceSelector}
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Colors.dark.accent} />
          <Text style={styles.hint}>Finding lyrics…</Text>
        </View>
      </View>
    );
  }

  // ── No network ─────────────────────────────────────────────────────────────
  if (fetchStatus === "no-network") {
    return (
      <View style={styles.flex}>
        {sourceSelector}
        <View style={styles.center}>
          <WifiOff size={26} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyTitle}>No internet connection.</Text>
          <Text style={styles.hint}>Connect to fetch lyrics.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.75}
            onPress={() => {
              const ctrl = new AbortController();
              doFetch(source, ctrl.signal);
            }}
          >
            <RefreshCw size={13} color={Colors.dark.accent} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Empty / not found ──────────────────────────────────────────────────────
  if (fetchStatus === "empty" || (fetchStatus === "done" && !lyricData)) {
    return (
      <View style={styles.flex}>
        {sourceSelector}
        <View style={styles.center}>
          <MicVocal size={26} color={Colors.dark.textTertiary} />
          <Text style={styles.emptyTitle}>No lyrics found for this song.</Text>
          <Text style={styles.hint}>Try switching the source above.</Text>
        </View>
      </View>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (fetchStatus === "idle") {
    return (
      <View style={styles.flex}>
        {sourceSelector}
        <View style={styles.center}>
          <MicVocal size={26} color={Colors.dark.textTertiary} />
          <Text style={styles.hint}>Play a song to see lyrics</Text>
        </View>
      </View>
    );
  }

  // ── Synced lyrics ──────────────────────────────────────────────────────────
  if (lrcLines.length) {
    return (
      <View style={styles.flex}>
        {sourceSelector}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {lrcLines.map((line, i) => (
            <Text
              key={i}
              style={[styles.line, i === activeIdx && styles.lineActive]}
              onLayout={(e) => lineY.current.set(i, e.nativeEvent.layout.y)}
            >
              {line.text}
            </Text>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Plain lyrics ───────────────────────────────────────────────────────────
  return (
    <View style={styles.flex}>
      {sourceSelector}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.plain}>{lyricData?.plain ?? ""}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },

  // ── Source selector ─────────────────────────────────────────────────────
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  sourceBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  sourceBtnActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  sourceBtnText: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  sourceBtnTextActive: {
    color: Colors.dark.accent,
  },

  // ── Center states ────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  hint: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Retry button ─────────────────────────────────────────────────────────
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.accent,
  },
  retryText: {
    color: Colors.dark.accent,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Scrollable lyrics ────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "center",
  },
  line: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 26,
    marginVertical: 2,
  },
  lineActive: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
  },
  plain: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    textAlign: "center",
  },
});
