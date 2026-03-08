import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
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
