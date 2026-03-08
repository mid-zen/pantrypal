// Suppress non-fatal React Native feature flag warnings in Expo Go
// These are internal RN 0.77 messages that don't affect functionality
const _error = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('disableEventLoopOnBridgeless')) return;
  _error(...args);
};

import React, { useEffect } from 'react';
import { LogBox, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

LogBox.ignoreLogs([
  'disableEventLoopOnBridgeless',
  'Could not access feature flag',
]);
import AppNavigator from './src/navigation/AppNavigator';
import { requestNotificationPermissions } from './src/lib/notifications';

export default function App() {
  useEffect(() => {
    requestNotificationPermissions().catch(console.warn);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <AppNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
