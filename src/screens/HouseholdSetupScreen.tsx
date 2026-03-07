import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useHousehold } from '../hooks/useHousehold';

export default function HouseholdSetupScreen() {
  const { user } = useAuth();
  const { createHousehold, joinHousehold } = useHousehold(user?.id);

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!householdName.trim()) return;

    setLoading(true);
    const { error } = await createHousehold(householdName.trim());
    setLoading(false);

    if (error) Alert.alert('Error', error);
  };

  const handleJoin = async () => {
    if (inviteCode.length !== 8) return;

    setLoading(true);
    const { error } = await joinHousehold(inviteCode);
    setLoading(false);

    if (error) Alert.alert('Error', error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🏠</Text>
          <Text style={styles.heroTitle}>Set Up Your Household</Text>
          <Text style={styles.heroSub}>
            Create a new household or join an existing one to share your pantry with family.
          </Text>
        </View>

        {mode === 'choose' && (
          <View style={styles.choices}>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => setMode('create')}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceEmoji}>🆕</Text>
              <Text style={styles.choiceTitle}>Create Household</Text>
              <Text style={styles.choiceSub}>Start fresh with a new shared pantry</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceCard, styles.choiceCardSecondary]}
              onPress={() => setMode('join')}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceEmoji}>🔗</Text>
              <Text style={styles.choiceTitle}>Join Household</Text>
              <Text style={styles.choiceSub}>Enter an invite code from a family member</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'create' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create Your Household</Text>

            <Text style={styles.label}>Household Name</Text>
            <TextInput
              style={styles.input}
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="e.g. The Johnson Family"
              autoFocus
              autoCapitalize="words"
              placeholderTextColor="#bbb"
            />

            <TouchableOpacity
              style={[styles.btn, (!householdName.trim() || loading) && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={!householdName.trim() || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Household →</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backLink} onPress={() => setMode('choose')}>
              <Text style={styles.backLinkText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'join' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Join a Household</Text>

            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={inviteCode}
              onChangeText={text => setInviteCode(text.toUpperCase())}
              placeholder="XXXXXXXX"
              autoCapitalize="characters"
              autoFocus
              maxLength={8}
              placeholderTextColor="#bbb"
            />

            <TouchableOpacity
              style={[styles.btn, (inviteCode.length !== 8 || loading) && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={inviteCode.length !== 8 || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join Household →</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backLink} onPress={() => setMode('choose')}>
              <Text style={styles.backLinkText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FFF0' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  heroEmoji: { fontSize: 64 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginTop: 12, textAlign: 'center' },
  heroSub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  choices: { gap: 14 },
  choiceCard: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  choiceCardSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  choiceEmoji: { fontSize: 36, marginBottom: 10 },
  choiceTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  choiceSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
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
    letterSpacing: 8,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { color: '#888', fontSize: 14 },
});
