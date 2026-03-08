// Override console.error before ANY modules load
// Suppresses non-fatal RN 0.77 feature flag warnings in Expo Go
(function () {
  const _err = console.error;
  console.error = function (...args) {
    const msg = args[0];
    if (typeof msg === 'string' && (
      msg.includes('disableEventLoopOnBridgeless') ||
      msg.includes('Could not access feature flag')
    )) return;
    _err.apply(console, args);
  };
})();

import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
