import TrackPlayer from "react-native-track-player";
import { PlaybackService } from "./service";

TrackPlayer.registerPlaybackService(() => PlaybackService);

import "expo-router/entry";
