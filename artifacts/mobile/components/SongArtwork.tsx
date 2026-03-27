import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Colors from "@/constants/colors";

type Props = {
  imagePool: string[];
  songId?: string | null;
  size: number;
  style?: ViewStyle;
  borderRadius?: number;
};

const imageCache = new Map<string, string>();

export function SongArtwork({ imagePool, songId, size, style, borderRadius = 12 }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!songId) {
      setImageUri(null);
      return;
    }
    if (imagePool.length === 0) {
      setImageUri(null);
      return;
    }
    if (imageCache.has(songId)) {
      setImageUri(imageCache.get(songId)!);
    } else {
      const idx = Math.abs(hashCode(songId)) % imagePool.length;
      const uri = imagePool[idx];
      imageCache.set(songId, uri);
      setImageUri(uri);
    }
  }, [songId, imagePool]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
        style,
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit="cover"
          transition={300}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { borderRadius }]}>
          <DefaultArt size={size} />
        </View>
      )}
    </View>
  );
}

function DefaultArt({ size }: { size: number }) {
  const iconSize = size * 0.35;
  return (
    <View style={styles.defaultArt}>
      <View style={[styles.noteOuter, { width: iconSize, height: iconSize }]}>
        <View style={[styles.noteCircle, { width: iconSize * 0.4, height: iconSize * 0.4, borderRadius: iconSize * 0.2 }]} />
        <View style={[styles.noteStem, { height: iconSize * 0.7, left: iconSize * 0.35 }]} />
      </View>
    </View>
  );
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: Colors.dark.surface,
  },
  placeholder: {
    backgroundColor: Colors.dark.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  defaultArt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noteOuter: {
    position: "relative",
  },
  noteCircle: {
    backgroundColor: Colors.dark.textTertiary,
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  noteStem: {
    width: 3,
    backgroundColor: Colors.dark.textTertiary,
    position: "absolute",
    top: 0,
    borderRadius: 2,
  },
});
