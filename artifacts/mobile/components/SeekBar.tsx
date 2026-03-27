import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  duration: number;
  position: number;
  onSeek: (pos: number) => void;
};

export function SeekBar({ duration, position, onSeek }: Props) {
  const [dragging, setDragging] = useState(false);
  const draggingVal = useRef(position);

  const displayPos = dragging ? draggingVal.current : position;

  return (
    <View style={styles.wrapper}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        value={dragging ? draggingVal.current : position}
        onValueChange={(v) => {
          draggingVal.current = v;
        }}
        onSlidingStart={() => setDragging(true)}
        onSlidingComplete={(v) => {
          setDragging(false);
          onSeek(v);
        }}
        minimumTrackTintColor="rgba(255,255,255,0.9)"
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor="#FFFFFF"
        tapToSeek
      />
      <View style={styles.labels}>
        <Text style={styles.timeText}>{formatTime(displayPos)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  slider: {
    width: "100%",
    height: 36,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
    paddingHorizontal: 4,
  },
  timeText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
});
