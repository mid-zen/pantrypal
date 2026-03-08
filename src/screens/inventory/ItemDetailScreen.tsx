import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { InventoryStackParamList, FOOD_CATEGORIES } from '../../types';
import { useAuth } from '../../hooks/useAuth';

import { useInventory } from '../../hooks/useInventory';
import { useGroceryList } from '../../hooks/useGroceryList';
import ExpiryBadge from '../../components/ExpiryBadge';
import { daysUntilExpiry, getExpiryStatus } from '../../hooks/useInventory';

type Props = {
  navigation: NativeStackNavigationProp<InventoryStackParamList, 'ItemDetail'>;
  route: RouteProp<InventoryStackParamList, 'ItemDetail'>;
};

export default function ItemDetailScreen({ navigation, route }: Props) {
  const { item: initialItem } = route.params;
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  
  const { locations, updateItem, deleteItem } = useInventory(household?.id);
  const { addItem: addToGrocery } = useGroceryList(household?.id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialItem.name);
  const [quantity, setQuantity] = useState(String(initialItem.quantity));
  const [unit, setUnit] = useState(initialItem.unit || '');
  const [category, setCategory] = useState(initialItem.category || '');
  const [locationId, setLocationId] = useState(initialItem.location_id || '');
  const [bestBefore, setBestBefore] = useState(initialItem.best_before || '');
  const [expiryDate, setExpiryDate] = useState(initialItem.expiry_date || '');
  const [notes, setNotes] = useState(initialItem.notes || '');
  const [saving, setSaving] = useState(false);

  const expiryDateDisplay = initialItem.expiry_date || initialItem.best_before;
  const status = getExpiryStatus(initialItem);
  const location = locations.find(l => l.id === initialItem.location_id);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Item name is required.');
      return;
    }

    setSaving(true);
    const { error } = await updateItem(initialItem.id, {
      name: name.trim(),
      quantity: parseFloat(quantity) || 1,
      unit: unit || null,
      category: category || null,
      location_id: locationId || null,
      best_before: bestBefore || null,
      expiry_date: expiryDate || null,
      notes: notes || null,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      setEditing(false);
      navigation.goBack();
    }
  };

  const handleDelete = (reason: 'used' | 'thrown_out' | 'expired') => {
    Alert.alert(
      'Remove Item',
      `Mark "${initialItem.name}" as ${reason}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            await deleteItem(initialItem.id, true, reason);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleAddToGrocery = async () => {
    const { error } = await addToGrocery(initialItem.name, {
      quantity: initialItem.quantity,
      unit: initialItem.unit ?? undefined,
      category: initialItem.category ?? undefined,
    });
    if (!error) {
      Alert.alert('Added!', `${initialItem.name} added to your grocery list.`);
    }
  };

  const DetailRow = ({ label, value }: { label: string; value: string | null }) =>
    value ? (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.itemName}>{initialItem.name}</Text>
            {expiryDateDisplay && (
              <ExpiryBadge expiryDate={expiryDateDisplay} status={status} />
            )}
          </View>

          <View style={styles.quickInfo}>
            <View style={styles.quickInfoItem}>
              <Text style={styles.quickInfoValue}>{initialItem.quantity} {initialItem.unit || ''}</Text>
              <Text style={styles.quickInfoLabel}>Quantity</Text>
            </View>
            {location && (
              <View style={styles.quickInfoItem}>
                <Text style={styles.quickInfoValue}>{location.icon} {location.name}</Text>
                <Text style={styles.quickInfoLabel}>Location</Text>
              </View>
            )}
            {initialItem.category && (
              <View style={styles.quickInfoItem}>
                <Text style={styles.quickInfoValue}>{initialItem.category}</Text>
                <Text style={styles.quickInfoLabel}>Category</Text>
              </View>
            )}
          </View>
        </View>

        {!editing ? (
          <>
            {/* Details */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Details</Text>
              <DetailRow label="Date Added" value={initialItem.date_added} />
              <DetailRow label="Best Before" value={initialItem.best_before} />
              <DetailRow label="Expiry Date" value={initialItem.expiry_date} />
              {expiryDateDisplay && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <ExpiryBadge expiryDate={expiryDateDisplay} status={status} />
                </View>
              )}
              {initialItem.barcode && (
                <DetailRow label="Barcode" value={initialItem.barcode} />
              )}
              {initialItem.notes && (
                <DetailRow label="Notes" value={initialItem.notes} />
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setEditing(true)}>
                <Text style={styles.actionBtnIcon}>✏️</Text>
                <Text style={styles.actionBtnText}>Edit Item</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={handleAddToGrocery}>
                <Text style={styles.actionBtnIcon}>🛒</Text>
                <Text style={styles.actionBtnText}>Add to Grocery List</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete('used')}>
                <Text style={styles.actionBtnIcon}>✅</Text>
                <Text style={styles.actionBtnText}>Mark as Used</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => handleDelete('thrown_out')}
              >
                <Text style={styles.actionBtnIcon}>🗑️</Text>
                <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>Throw Away</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* Edit Form */
          <View style={styles.editCard}>
            <Text style={styles.cardTitle}>Edit Item</Text>

            <Text style={styles.editLabel}>Name</Text>
            <TextInput style={styles.editInput} value={name} onChangeText={setName} />

            <View style={styles.editRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.editLabel}>Quantity</Text>
                <TextInput
                  style={styles.editInput}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={styles.editLabel}>Unit</Text>
                <TextInput
                  style={styles.editInput}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="lbs, oz, pcs…"
                  placeholderTextColor="#bbb"
                />
              </View>
            </View>

            <Text style={styles.editLabel}>Best Before (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={bestBefore}
              onChangeText={setBestBefore}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
            />

            <Text style={styles.editLabel}>Expiry Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
            />

            <Text style={styles.editLabel}>Notes</Text>
            <TextInput
              style={[styles.editInput, { height: 72, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setEditing(false)}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.editSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  itemName: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', flex: 1, marginRight: 12 },
  quickInfo: { flexDirection: 'row', gap: 20 },
  quickInfoItem: { alignItems: 'flex-start' },
  quickInfoValue: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  quickInfoLabel: { fontSize: 11, color: '#888', marginTop: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#888', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  detailLabel: { fontSize: 14, color: '#666' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  actionBtnDanger: { borderBottomWidth: 0 },
  actionBtnIcon: { fontSize: 20 },
  actionBtnText: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  actionBtnDangerText: { color: '#F44336' },
  editCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  editLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  editInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#FAFAFA',
  },
  editRow: { flexDirection: 'row' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  editCancelText: { fontWeight: '600', color: '#555' },
  editSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  editSaveText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
