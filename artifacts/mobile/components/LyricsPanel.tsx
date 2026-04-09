import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MicVocal } from "lucide-react-native";
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

// ── Component ─────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "done" | "empty";

type Props = {
  title: string;
  artist: string;
  position: number;
};

export function LyricsPanel({ title, artist, position }: Props) {
  const [status, setStatus]   = useState<Status>("idle");
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [plain, setPlain]     = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const lineY     = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!title) { setStatus("idle"); return; }
    setStatus("loading");
    setLrcLines([]);
    setPlain("");
    lineY.current.clear();

    const ctrl = new AbortController();
    const url =
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;

    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setStatus("empty"); return; }
        if (d.syncedLyrics) {
          const parsed = parseLrc(d.syncedLyrics as string);
          if (parsed.length) { setLrcLines(parsed); setStatus("done"); return; }
        }
        if (d.plainLyrics) { setPlain(d.plainLyrics as string); setStatus("done"); return; }
        setStatus("empty");
      })
      .catch(() => setStatus("empty"));

    return () => ctrl.abort();
  }, [title, artist]);

  // ── Active line index (synced lyrics only) ─────────────────────────────
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
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 64), animated: true });
  }, [activeIdx, lrcLines.length]);

  // ── States ────────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={Colors.dark.accent} />
        <Text style={styles.hint}>Finding lyrics…</Text>
      </View>
    );
  }

  if (status === "empty") {
    return (
      <View style={styles.center}>
        <MicVocal size={24} color={Colors.dark.textTertiary} />
        <Text style={styles.emptyTitle}>No lyrics found</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {artist ? `${artist} · ` : ""}{title}
        </Text>
      </View>
    );
  }

  if (status === "idle") {
    return (
      <View style={styles.center}>
        <MicVocal size={24} color={Colors.dark.textTertiary} />
        <Text style={styles.hint}>Play a song to see lyrics</Text>
      </View>
    );
  }

  // ── Synced lyrics ─────────────────────────────────────────────────────────
  if (lrcLines.length) {
    return (
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
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ── Plain lyrics ──────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.plain}>{plain}</Text>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: "center",
  },
  line: {
    color: "rgba(255,255,255,0.3)",
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
