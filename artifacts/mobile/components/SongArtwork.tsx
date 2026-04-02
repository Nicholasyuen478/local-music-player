import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Colors from "@/constants/colors";

type Props = {
  /** Pre-selected artwork URI from context. Null shows the default placeholder. */
  artworkUri: string | null;
  size: number;
  style?: ViewStyle;
  borderRadius?: number;
};

export function SongArtwork({ artworkUri, size, style, borderRadius = 12 }: Props) {
  return (
    <View
      style={[styles.container, { width: size, height: size, borderRadius }, style]}
    >
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
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
          style={[styles.noteStem, { height: iconSize * 0.7, left: iconSize * 0.35 }]}
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
  defaultArt: { flex: 1, alignItems: "center", justifyContent: "center" },
  noteOuter: { position: "relative" },
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
