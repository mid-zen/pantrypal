import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  requestNotificationPermissions,
  scheduleDailyExpiryCheck,
} from '../../lib/notifications';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_PREFS_KEY = 'pantrypal:notif_prefs';

interface NotifPrefs {
  expiryAlerts: boolean;
  lowStockAlerts: boolean;
  dailyCheck: boolean;
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { household, members, leaveHousehold, createHousehold, joinHousehold } = useHouseholdContext();

  const [notifPerms, setNotifPerms] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    expiryAlerts: true,
    lowStockAlerts: true,
    dailyCheck: true,
  });

  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [showJoinHousehold, setShowJoinHousehold] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check notification permissions
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifPerms(status === 'granted');
    });

    // Load notification preferences
    AsyncStorage.getItem(NOTIF_PREFS_KEY).then(raw => {
      if (raw) {
        try { setNotifPrefs(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const saveNotifPrefs = async (prefs: NotifPrefs) => {
    setNotifPrefs(prefs);
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));

    if (prefs.dailyCheck && notifPerms) {
      await scheduleDailyExpiryCheck();
    }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermissions();
    setNotifPerms(granted);

    if (granted) {
      await scheduleDailyExpiryCheck();
      Alert.alert('Notifications enabled!', 'You\'ll receive daily expiry alerts at 9 AM.');
    } else {
      Alert.alert('Permission denied', 'Please enable notifications in your device settings.');
    }
  };

  const handleCreateHousehold = async () => {
    if (!householdName.trim()) return;

    setLoading(true);
    const { error } = await createHousehold(householdName.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      setShowCreateHousehold(false);
      setHouseholdName('');
    }
  };

  const handleJoinHousehold = async () => {
    if (!inviteCode.trim()) return;

    setLoading(true);
    const { error } = await joinHousehold(inviteCode.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      setShowJoinHousehold(false);
      setInviteCode('');
    }
  };

  const handleLeaveHousehold = () => {
    Alert.alert(
      'Leave Household',
      `Are you sure you want to leave "${household?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const { error } = await leaveHousehold();
            if (error) Alert.alert('Error', error);
          },
        },
      ]
    );
  };

  const handleShareInviteCode = async () => {
    if (!household) return;
    try {
      await Share.share({
        message: `Join my PantryPal household "${household.name}"!\n\nUse invite code: ${household.invite_code}`,
      });
    } catch {}
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );

  const SettingRow = ({
    icon,
    label,
    subtitle,
    onPress,
    right,
    danger,
  }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    subtitle?: string;
    onPress?: () => void;
    right?: React.ReactNode;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress && !right}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons name={icon} size={20} color={danger ? '#F44336' : '#555'} style={styles.settingIcon} />
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {right && <View style={styles.settingRight}>{right}</View>}
      {onPress && !right && <Ionicons name="chevron-forward" size={16} color="#ccc" style={{ marginLeft: 8 }} />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}>
      {/* Account */}
      <Section title="Account">
        <SettingRow
          icon="person-outline"
          label={user?.email ?? 'Unknown'}
          subtitle="Signed in"
        />
        <SettingRow
          icon="log-out-outline"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </Section>

      {/* Household */}
      <Section title="Household">
        {household ? (
          <>
            <SettingRow
              icon="home-outline"
              label={household.name}
              subtitle={`${members.length} member${members.length !== 1 ? 's' : ''}`}
            />
            <SettingRow
              icon="key-outline"
              label="Invite Code"
              subtitle={household.invite_code}
              onPress={handleShareInviteCode}
              right={<Text style={styles.shareBtn}>Share ↗</Text>}
            />
            <View style={styles.membersList}>
              {members.map(m => (
                <View key={m.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {(m.user_id === user?.id ? user?.email : m.user_id)?.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.memberName}>
                    {m.user_id === user?.id ? `${user?.email} (you)` : m.user_id}
                  </Text>
                  <Text style={styles.memberRole}>{m.role}</Text>
                </View>
              ))}
            </View>
            <SettingRow
              icon="log-out-outline"
              label="Leave Household"
              onPress={handleLeaveHousehold}
              danger
            />
          </>
        ) : (
          <>
            <SettingRow icon="add-circle-outline" label="Create Household" onPress={() => setShowCreateHousehold(true)} />
            <SettingRow icon="link-outline" label="Join with Invite Code" onPress={() => setShowJoinHousehold(true)} />
          </>
        )}
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        {!notifPerms ? (
          <SettingRow
            icon="notifications-outline"
            label="Enable Notifications"
            subtitle="Get expiry alerts and reminders"
            onPress={handleEnableNotifications}
          />
        ) : (
          <>
            <SettingRow
              icon="alarm-outline"
              label="Expiry Alerts"
              subtitle="Items expiring within 3 days"
              right={
                <Switch
                  value={notifPrefs.expiryAlerts}
                  onValueChange={v => saveNotifPrefs({ ...notifPrefs, expiryAlerts: v })}
                  trackColor={{ true: '#4CAF50' }}
                />
              }
            />
            <SettingRow
              icon="cart-outline"
              label="Low Stock Alerts"
              subtitle="When last item is used"
              right={
                <Switch
                  value={notifPrefs.lowStockAlerts}
                  onValueChange={v => saveNotifPrefs({ ...notifPrefs, lowStockAlerts: v })}
                  trackColor={{ true: '#4CAF50' }}
                />
              }
            />
            <SettingRow
              icon="calendar-outline"
              label="Daily Check (9 AM)"
              subtitle="Summary of expiring items"
              right={
                <Switch
                  value={notifPrefs.dailyCheck}
                  onValueChange={v => saveNotifPrefs({ ...notifPrefs, dailyCheck: v })}
                  trackColor={{ true: '#4CAF50' }}
                />
              }
            />
          </>
        )}
      </Section>

      {/* About */}
      <Section title="About">
        <SettingRow icon="nutrition-outline" label="PantryPal" subtitle="Version 1.0.0" />
        <SettingRow icon="server-outline" label="Database" subtitle="Powered by Supabase" />
        <SettingRow icon="restaurant-outline" label="Recipes" subtitle="Powered by Spoonacular" />
      </Section>

      {/* Create Household Modal */}
      <Modal visible={showCreateHousehold} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Household</Text>
            <Text style={styles.modalSubtitle}>
              Create a shared household to sync inventory with family members.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="e.g. The Smith Family"
              autoFocus
              placeholderTextColor="#bbb"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCreateHousehold(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (!householdName.trim() || loading) && styles.modalSaveBtnDisabled]}
                onPress={handleCreateHousehold}
                disabled={!householdName.trim() || loading}
              >
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Household Modal */}
      <Modal visible={showJoinHousehold} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join Household</Text>
            <Text style={styles.modalSubtitle}>
              Enter the 8-character invite code shared by a household member.
            </Text>

            <TextInput
              style={[styles.modalInput, styles.codeInput]}
              value={inviteCode}
              onChangeText={text => setInviteCode(text.toUpperCase())}
              placeholder="XXXXXXXX"
              autoCapitalize="characters"
              autoFocus
              maxLength={8}
              placeholderTextColor="#bbb"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowJoinHousehold(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (inviteCode.length !== 8 || loading) && styles.modalSaveBtnDisabled]}
                onPress={handleJoinHousehold}
                disabled={inviteCode.length !== 8 || loading}
              >
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { paddingBottom: 48 },
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 20,
    marginBottom: 6,
  },
  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  settingIcon: { marginRight: 12 },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  settingLabelDanger: { color: '#F44336' },
  settingSubtitle: { fontSize: 12, color: '#888', marginTop: 1 },
  settingRight: { marginLeft: 8 },
  chevron: { fontSize: 18, color: '#ccc', marginLeft: 8 },
  shareBtn: { fontSize: 13, color: '#4CAF50', fontWeight: '600' },
  membersList: { paddingHorizontal: 16, paddingVertical: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  memberName: { flex: 1, fontSize: 13, color: '#444' },
  memberRole: {
    fontSize: 11,
    color: '#888',
    textTransform: 'capitalize',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 20,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  modalCancelText: { fontWeight: '600', color: '#555' },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.4 },
  modalSaveText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
