import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { InventoryStackParamList, InventoryItem, LOCATION_ICONS } from '../../types';
import { useInventory } from '../../hooks/useInventory';
import { useGroceryList } from '../../hooks/useGroceryList';
import { useAuth } from '../../hooks/useAuth';

import LocationFolder from '../../components/LocationFolder';
import InventoryItemRow from '../../components/InventoryItem';

type Props = {
  navigation: NativeStackNavigationProp<InventoryStackParamList, 'Inventory'>;
};

export default function InventoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  
  const {
    items, locations, loading,
    deleteItem, addLocation, updateLocation, deleteLocation,
    getItemsByLocation, refetch,
  } = useInventory(household?.id);
  const { addItem: addToGrocery } = useGroceryList(household?.id);

  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationIcon, setNewLocationIcon] = useState('📦');
  const [editingLocation, setEditingLocation] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const toggleLocation = (id: string) => {
    setExpandedLocations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredItems = searchQuery.trim()
    ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const handleDeleteItem = async (id: string, reason: 'used' | 'thrown_out' | 'expired') => {
    await deleteItem(id, true, reason);
  };

  const handleAddToGrocery = async (item: InventoryItem) => {
    const { error } = await addToGrocery(item.name, {
      quantity: item.quantity,
      unit: item.unit ?? undefined,
      category: item.category ?? undefined,
    });
    if (!error) {
      Alert.alert('Added!', `${item.name} added to grocery list.`);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;

    if (editingLocation) {
      await updateLocation(editingLocation.id, newLocationName.trim(), newLocationIcon);
    } else {
      const { error } = await addLocation(newLocationName.trim(), newLocationIcon);
      if (!error) {
        setExpandedLocations(prev => new Set(prev));
      }
    }

    setShowAddLocation(false);
    setNewLocationName('');
    setNewLocationIcon('📦');
    setEditingLocation(null);
  };

  const handleEditLocation = (loc: { id: string; name: string; icon: string | null }) => {
    setEditingLocation({ id: loc.id, name: loc.name, icon: loc.icon || '📦' });
    setNewLocationName(loc.name);
    setNewLocationIcon(loc.icon || '📦');
    setShowAddLocation(true);
  };

  const handleDeleteLocation = (id: string, name: string) => {
    Alert.alert(
      'Delete Location',
      `Delete "${name}"? Items in this location will remain but won't be assigned to any location.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteLocation(id) },
      ]
    );
  };

  const expiringSummary = items.filter(i =>
    i.expiry_status === 'expired' || i.expiry_status === 'expiring_soon'
  ).length;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const iconOptions = Object.entries(LOCATION_ICONS);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inventory</Text>
          {expiringSummary > 0 && (
            <Text style={styles.headerSub}>{expiringSummary} item{expiringSummary !== 1 ? 's' : ''} need attention</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addLocationBtn}
            onPress={() => {
              setEditingLocation(null);
              setNewLocationName('');
              setNewLocationIcon('📦');
              setShowAddLocation(true);
            }}
          >
            <Text style={styles.addLocationBtnText}>+ Location</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddItem')}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="🔍  Search items…"
          placeholderTextColor="#aaa"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
      >
        {/* Search Results */}
        {filteredItems && (
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>{filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''}</Text>
            {filteredItems.length === 0 ? (
              <Text style={styles.empty}>No items match your search.</Text>
            ) : (
              filteredItems.map(item => (
                <InventoryItemRow
                  key={item.id}
                  item={item}
                  onPress={() => navigation.navigate('ItemDetail', { item })}
                  onDelete={handleDeleteItem}
                  onAddToGrocery={handleAddToGrocery}
                />
              ))
            )}
          </View>
        )}

        {/* Location Folders */}
        {!filteredItems && (
          <>
            {locations.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📦</Text>
                <Text style={styles.emptyTitle}>No locations yet</Text>
                <Text style={styles.emptyText}>Add a location (Fridge, Pantry, etc.) to get started.</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => setShowAddLocation(true)}
                >
                  <Text style={styles.emptyBtnText}>Add Location</Text>
                </TouchableOpacity>
              </View>
            ) : (
              locations.map(loc => (
                <LocationFolder
                  key={loc.id}
                  location={loc}
                  items={getItemsByLocation(loc.id)}
                  expanded={expandedLocations.has(loc.id)}
                  onToggle={() => toggleLocation(loc.id)}
                  onRename={() => handleEditLocation(loc)}
                  onDelete={() => handleDeleteLocation(loc.id, loc.name)}
                >
                  {getItemsByLocation(loc.id).map(item => (
                    <InventoryItemRow
                      key={item.id}
                      item={item}
                      onPress={() => navigation.navigate('ItemDetail', { item })}
                      onDelete={handleDeleteItem}
                      onAddToGrocery={handleAddToGrocery}
                    />
                  ))}
                </LocationFolder>
              ))
            )}

            {/* Unassigned items */}
            {(() => {
              const unassigned = getItemsByLocation(null);
              if (unassigned.length === 0) return null;
              return (
                <View style={styles.unassigned}>
                  <Text style={styles.sectionTitle}>Unassigned</Text>
                  {unassigned.map(item => (
                    <InventoryItemRow
                      key={item.id}
                      item={item}
                      onPress={() => navigation.navigate('ItemDetail', { item })}
                      onDelete={handleDeleteItem}
                      onAddToGrocery={handleAddToGrocery}
                    />
                  ))}
                </View>
              );
            })()}
          </>
        )}
      </ScrollView>

      {/* Add/Edit Location Modal */}
      <Modal visible={showAddLocation} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingLocation ? 'Edit Location' : 'New Location'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={newLocationName}
              onChangeText={setNewLocationName}
              placeholder="Location name (e.g. Fridge)"
              autoFocus
              placeholderTextColor="#bbb"
            />

            <Text style={styles.modalLabel}>Pick an icon</Text>
            <View style={styles.iconGrid}>
              {[...iconOptions, ['📦', '📦'], ['🧺', '🧺'], ['🍱', '🍱']].map(([name, icon]) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.iconOption, newLocationIcon === icon && styles.iconOptionSelected]}
                  onPress={() => setNewLocationIcon(icon as string)}
                >
                  <Text style={styles.iconOptionText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAddLocation(false);
                  setEditingLocation(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, !newLocationName.trim() && styles.modalSaveBtnDisabled]}
                onPress={handleAddLocation}
                disabled={!newLocationName.trim()}
              >
                <Text style={styles.modalSaveText}>{editingLocation ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  headerSub: { fontSize: 12, color: '#F57F17', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addLocationBtn: {
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addLocationBtnText: { color: '#4CAF50', fontSize: 13, fontWeight: '600' },
  addBtn: {
    backgroundColor: '#4CAF50',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a1a',
  },
  scrollContent: { paddingTop: 12, paddingBottom: 40 },
  searchResults: { paddingHorizontal: 0 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginLeft: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unassigned: { marginTop: 8 },
  empty: { textAlign: 'center', color: '#aaa', fontSize: 14, marginTop: 12 },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  emptyBtn: {
    marginTop: 24,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 10 },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOptionSelected: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  iconOptionText: { fontSize: 22 },
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
