import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { InventoryItem } from '../types';
import { getExpiryStatus, daysUntilExpiry } from '../hooks/useInventory';

export const EXPIRY_CHECK_TASK = 'EXPIRY_CHECK_BACKGROUND_TASK';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('expiry-alerts', {
      name: 'Expiry Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF8C00',
    });

    await Notifications.setNotificationChannelAsync('low-stock', {
      name: 'Low Stock Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return true;
}

export async function scheduleExpiryNotification(item: InventoryItem): Promise<void> {
  const expiryDate = item.expiry_date || item.best_before;
  if (!expiryDate) return;

  const days = daysUntilExpiry(expiryDate);
  if (days < 0 || days > 3) return;

  const title = days === 0
    ? `⚠️ ${item.name} expires today!`
    : days === 1
    ? `⏰ ${item.name} expires tomorrow`
    : `🕐 ${item.name} expires in ${days} days`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: `Check your ${item.category || 'pantry'} and use it up or plan a meal!`,
      data: { itemId: item.id, type: 'expiry' },
      categoryIdentifier: 'expiry-alerts',
    },
    trigger: {
      seconds: 10, // for demo; in production use a date trigger
    },
  });
}

export async function sendLowStockNotification(itemName: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛒 Last of ${itemName} used`,
      body: 'Add it to your grocery list?',
      data: { itemName, type: 'low_stock' },
      categoryIdentifier: 'low-stock',
    },
    trigger: null, // immediate
  });
}

export async function scheduleDailyExpiryCheck(): Promise<void> {
  // Cancel existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule daily check at 9am
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🥗 PantryPal Daily Check',
      body: 'Checking your pantry for items expiring soon…',
      data: { type: 'daily_check' },
    },
    trigger: {
      hour: 9,
      minute: 0,
      repeats: true,
    } as Notifications.DailyTriggerInput,
  });
}

export async function checkAndNotifyExpiry(householdId: string): Promise<void> {
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId);

  if (error || !items) return;

  const expiringSoon = items.filter((item: InventoryItem) => {
    const expiryDate = item.expiry_date || item.best_before;
    if (!expiryDate) return false;
    const days = daysUntilExpiry(expiryDate);
    return days >= 0 && days <= 3;
  });

  if (expiringSoon.length === 0) return;

  const itemNames = expiringSoon
    .map((i: InventoryItem) => i.name)
    .slice(0, 3)
    .join(', ');

  const moreCount = expiringSoon.length > 3 ? ` +${expiringSoon.length - 3} more` : '';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⚠️ ${expiringSoon.length} items expiring soon`,
      body: `${itemNames}${moreCount} — use them up!`,
      data: { type: 'expiry_summary', count: expiringSoon.length },
    },
    trigger: null,
  });
}

// Background task definition (must be defined at module level)
TaskManager.defineTask(EXPIRY_CHECK_TASK, async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return TaskManager.TaskManagerTaskBody;

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', session.user.id)
      .single();

    if (member?.household_id) {
      await checkAndNotifyExpiry(member.household_id);
    }

    return TaskManager.TaskManagerTaskBody;
  } catch (err) {
    console.error('Background task error:', err);
    return TaskManager.TaskManagerTaskBody;
  }
});
