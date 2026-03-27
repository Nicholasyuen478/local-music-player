import React, { useCallback, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

type Props = {
  duration: number;
  position: number;
  onSeek: (pos: number) => void;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SeekBar({ duration, position, onSeek }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const barRef = useRef<View>(null);
  const barWidthRef = useRef(0);
  const [barWidth, setBarWidth] = useState(0);

  const displayPosition = isDragging ? dragPosition : position;
  const progress = duration > 0 ? Math.min(displayPosition / duration, 1) : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const x = evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / barWidthRef.current));
        setDragPosition(ratio * duration);
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / barWidthRef.current));
        setDragPosition(ratio * duration);
      },
      onPanResponderRelease: (evt) => {
        const x = evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / barWidthRef.current));
        const seekPos = ratio * duration;
        setIsDragging(false);
        onSeek(seekPos);
      },
    })
  ).current;

  return (
    <View style={styles.wrapper}>
      <View
        ref={barRef}
        style={styles.trackContainer}
        onLayout={(e) => {
          barWidthRef.current = e.nativeEvent.layout.width;
          setBarWidth(e.nativeEvent.layout.width);
        }}
        {...panResponder.panHandlers}
        hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            {
              left: progress * barWidth - 7,
              opacity: isDragging ? 1 : 0.9,
              transform: [{ scale: isDragging ? 1.3 : 1 }],
            },
          ]}
        />
      </View>
      <View style={styles.labels}>
        <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingHorizontal: 4,
  },
  trackContainer: {
    height: 28,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: Colors.dark.accent,
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.accent,
    top: 7,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeText: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
