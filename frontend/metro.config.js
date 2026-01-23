const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix for web compatibility
config.resolver.alias = {
  // Replace moti with a no-op on web
  'moti': require.resolve('./components/moti-web-stub.js'),
  'framer-motion': require.resolve('./components/moti-web-stub.js'),
};

module.exports = config;
