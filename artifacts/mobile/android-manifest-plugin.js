const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withSingleTaskLaunchMode(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity.$['android:launchMode'] = 'singleTask';
    }
    return config;
  });
};
