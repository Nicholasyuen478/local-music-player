
const path = require("path");
const expoDir = path.dirname(require.resolve("expo/package.json"));
const { withAndroidManifest, withInfoPlist } = require(
  require.resolve("@expo/config-plugins", { paths: [expoDir] })
);

const MUSIC_SERVICE = "com.doublesymmetry.trackplayer.service.MusicService";

function addAndroidManifestChanges(androidManifest) {
  const app = androidManifest.manifest.application[0];

  if (!app.service) {
    app.service = [];
  }

  const existing = app.service.find(
    (s) => s.$?.["android:name"] === MUSIC_SERVICE,
  );

  if (existing) {
    // Service already registered (merged from RNTP's AAR manifest).
    // Just ensure stopWithTask is set so swiping the app from recents
    // stops playback — matching YouTube Music / most Android music apps.
    existing.$["android:stopWithTask"] = "true";
  } else {
    app.service.push({
      $: {
        "android:name": MUSIC_SERVICE,
        "android:enabled": "true",
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
        // Stop the foreground service when the user swipes the app away
        // from the recents screen (same behaviour as YouTube Music).
        "android:stopWithTask": "true",
      },
      "intent-filter": [
        {
          action: [
            { $: { "android:name": "android.intent.action.MEDIA_BUTTON" } },
          ],
        },
      ],
    });
  }

  return androidManifest;
}

function withRNTrackPlayerAndroid(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addAndroidManifestChanges(config.modResults);
    return config;
  });
}

function withRNTrackPlayerIOS(config) {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes || [];
    if (!modes.includes("audio")) {
      config.modResults.UIBackgroundModes = [...modes, "audio"];
    }
    return config;
  });
}

module.exports = function withRNTrackPlayer(config) {
  config = withRNTrackPlayerAndroid(config);
  config = withRNTrackPlayerIOS(config);
  return config;
};
