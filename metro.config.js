const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable native FSEvents watcher (causes EMFILE on macOS 11)
// Use polling instead — slower but stable
config.watcher = {
  useWatchman: false,
  healthCheck: {
    enabled: false,
  },
};

config.watchFolders = [];

module.exports = config;
