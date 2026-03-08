import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../hooks/useAuth';
import { useHousehold } from '../hooks/useHousehold';
import { HouseholdContext } from '../context/HouseholdContext';

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

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  InventoryTab: { active: 'nutrition', inactive: 'nutrition-outline' },
  GroceryTab: { active: 'cart', inactive: 'cart-outline' },
  RecipesTab: { active: 'restaurant', inactive: 'restaurant-outline' },
  WasteTab: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  SettingsTab: { active: 'settings', inactive: 'settings-outline' },
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
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={24}
              color={color}
            />
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
  const {
    household,
    members,
    loading: householdLoading,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    refetch,
  } = useHousehold(user?.id);

  if (authLoading || (user && householdLoading)) {
    return (
      <View style={styles.loading}>
        <Ionicons name="nutrition" size={64} color="#4CAF50" />
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
        <HouseholdSetupScreen
          createHousehold={createHousehold}
          joinHousehold={joinHousehold}
        />
      </View>
    );
  }

  return (
    <HouseholdContext.Provider value={{ household, members, createHousehold, joinHousehold, leaveHousehold, refetch }}>
      <MainTabNavigator />
    </HouseholdContext.Provider>
  );
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

  loadingText: { color: '#888', fontSize: 15, marginTop: 12 },
});
