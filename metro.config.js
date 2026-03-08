const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Inject suppression polyfill before any module loads
const { getPolyfills } = config.serializer ?? {};
config.serializer = {
  ...config.serializer,
  getPolyfills: (options) => {
    const base = getPolyfills ? getPolyfills(options) : [];
    return [
      require.resolve('./polyfills/suppress-warnings.js'),
      ...base,
    ];
  },
};

// Reduce file watching
config.watchFolders = [];
config.watcher = {
  useWatchman: false,
  healthCheck: { enabled: false },
};

module.exports = config;
