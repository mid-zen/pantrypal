const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable native file watcher — use polling for macOS 11 compatibility
config.watcher = {
  useWatchman: false,
  healthCheck: { enabled: false },
};

module.exports = config;
