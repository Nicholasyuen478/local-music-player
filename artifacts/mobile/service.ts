import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext().catch(() => TrackPlayer.skip(0).then(() => TrackPlayer.play()))
  );
  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      const queue = await TrackPlayer.getQueue();
      if (queue.length > 0) {
        await TrackPlayer.skip(queue.length - 1);
        await TrackPlayer.play();
      }
    }
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    TrackPlayer.seekTo(position)
  );
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    const queue = await TrackPlayer.getQueue();
    if (queue.length > 0) {
      await TrackPlayer.skip(0);
      await TrackPlayer.play();
    }
  });
}
