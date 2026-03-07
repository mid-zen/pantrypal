import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../hooks/useAuth';
import { useHousehold } from '../hooks/useHousehold';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';

// Household setup
import HouseholdSetupScreen from '../screens/HouseholdSetupScreen';

// Main screens
import InventoryScreen from '../screens/inventory/InventoryScreen';
import AddItemScreen from '../screens/inventory/AddItemScreen';
import ItemDetailScreen from '../screens/inventory/ItemDetailScreen';
import GroceryScreen from '../screens/grocery/GroceryScreen';
import RecipesScreen from '../screens/recipes/RecipesScreen';
import WasteScreen from '../screens/waste/WasteScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

import {
  AuthStackParamList,
  MainTabParamList,
  InventoryStackParamList,
} from '../types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const InventoryStack = createNativeStackNavigator<InventoryStackParamList>();

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  InventoryTab: { active: '🥦', inactive: '🥬' },
  GroceryTab: { active: '🛒', inactive: '🛍️' },
  RecipesTab: { active: '🍳', inactive: '👨‍🍳' },
  WasteTab: { active: '📊', inactive: '📉' },
  SettingsTab: { active: '⚙️', inactive: '⚙️' },
};

function InventoryStackNavigator() {
  return (
    <InventoryStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#2E7D32',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <InventoryStack.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ headerShown: false }}
      />
      <InventoryStack.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ title: 'Add Item', headerBackTitle: 'Back' }}
      />
      <InventoryStack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={({ route }) => ({
          title: route.params.item.name,
          headerBackTitle: 'Back',
        })}
      />
    </InventoryStack.Navigator>
  );
}

function MainTabNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#F0F0F0',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
          height: 60,
        },
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: '#BDBDBD',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => {
          const icons = TAB_ICONS[route.name] ?? { active: '●', inactive: '○' };
          return (
            <Text style={{ fontSize: 22 }}>
              {focused ? icons.active : icons.inactive}
            </Text>
          );
        },
      })}
    >
      <MainTab.Screen
        name="InventoryTab"
        component={InventoryStackNavigator}
        options={{ tabBarLabel: 'Inventory' }}
      />
      <MainTab.Screen
        name="GroceryTab"
        component={GroceryScreen}
        options={{ tabBarLabel: 'Grocery' }}
      />
      <MainTab.Screen
        name="RecipesTab"
        component={RecipesScreen}
        options={{ tabBarLabel: 'Recipes' }}
      />
      <MainTab.Screen
        name="WasteTab"
        component={WasteScreen}
        options={{ tabBarLabel: 'Waste' }}
      />
      <MainTab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </MainTab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { household, loading: householdLoading } = useHousehold(user?.id);

  if (authLoading || (user && householdLoading)) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingLogo}>🥦</Text>
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Loading PantryPal…</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthNavigator />;
  }

  if (!household) {
    return (
      <View style={{ flex: 1 }}>
        <HouseholdSetupScreen />
      </View>
    );
  }

  return <MainTabNavigator />;
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <AppContent />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0FFF0',
  },
  loadingLogo: { fontSize: 64 },
  loadingText: { color: '#888', fontSize: 15, marginTop: 12 },
});
