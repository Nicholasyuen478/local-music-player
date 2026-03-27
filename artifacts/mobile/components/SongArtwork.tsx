import { Image } from "expo-image";
import React, { useMemo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Colors from "@/constants/colors";

type Props = {
  imagePool: string[];
  songId?: string | null;
  size: number;
  style?: ViewStyle;
  borderRadius?: number;
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

export function SongArtwork({ imagePool, songId, size, style, borderRadius = 12 }: Props) {
  // Deterministic: same song always maps to the same image index
  const imageUri = useMemo(() => {
    if (!songId || imagePool.length === 0) return null;
    const idx = Math.abs(hashCode(songId)) % imagePool.length;
    return imagePool[idx];
  }, [songId, imagePool]);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius },
        style,
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit="cover"
          transition={200}
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
        <View
          style={[
            styles.noteCircle,
            {
              width: iconSize * 0.4,
              height: iconSize * 0.4,
              borderRadius: iconSize * 0.2,
            },
          ]}
        />
        <View
          style={[
            styles.noteStem,
            { height: iconSize * 0.7, left: iconSize * 0.35 },
          ]}
        />
      </View>
    </View>
  );
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
