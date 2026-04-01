
const path = require("path");
const expoDir = path.dirname(require.resolve("expo/package.json"));
const { withAndroidManifest, withInfoPlist } = require(
  require.resolve("@expo/config-plugins", { paths: [expoDir] })
);

function addAndroidManifestChanges(androidManifest) {
  const app = androidManifest.manifest.application[0];

  if (!app.service) {
    app.service = [];
  }

  const serviceExists = app.service.some(
    (s) =>
      s.$?.["android:name"] ===
      "com.doublesymmetry.trackplayer.service.MusicService",
  );

  if (!serviceExists) {
    app.service.push({
      $: {
        "android:name":
          "com.doublesymmetry.trackplayer.service.MusicService",
        "android:enabled": "true",
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
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
