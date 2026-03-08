import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';

import { useGroceryList } from '../../hooks/useGroceryList';
import { useInventory } from '../../hooks/useInventory';
import GroceryItemRow from '../../components/GroceryItem';
import { GroceryItem, FOOD_CATEGORIES } from '../../types';

export default function GroceryScreen() {
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  const insets = useSafeAreaInsets();

  const {
    items,
    loading,
    addItem,
    checkItem,
    deleteItem,
    clearChecked,
    getItemsByCategory,
    getSuggestions,
  } = useGroceryList(household?.id);
  const { addItem: addToInventory } = useInventory(household?.id);

  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [addingToInventory, setAddingToInventory] = useState<string | null>(null);

  useEffect(() => {
    if (household?.id) {
      getSuggestions().then(setSuggestions);
    }
  }, [household?.id, items]);

  const handleAdd = async () => {
    if (!newItemName.trim()) return;

    await addItem(newItemName.trim(), {
      category: newItemCategory || undefined,
      quantity: parseFloat(newItemQty) || 1,
      unit: newItemUnit || undefined,
      added_by: user?.id,
    });

    setNewItemName('');
    setNewItemCategory('');
    setNewItemQty('1');
    setNewItemUnit('');
    setShowAddModal(false);
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await checkItem(id, checked);

    // If just checked, prompt to add to inventory
    if (checked) {
      const item = items.find(i => i.id === id);
      if (!item) return;

      Alert.alert(
        'Add to Inventory?',
        `You got ${item.name}! Add it to your inventory?`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes, Add',
            onPress: async () => {
              setAddingToInventory(id);
              await addToInventory({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit ?? undefined,
                category: item.category ?? undefined,
                date_added: new Date().toISOString().split('T')[0],
                added_by: user?.id,
              });
              await deleteItem(id);
              setAddingToInventory(null);
            },
          },
        ]
      );
    }
  };

  const handleClearChecked = () => {
    const checkedCount = items.filter(i => i.checked).length;
    if (checkedCount === 0) return;

    Alert.alert(
      'Clear Checked Items',
      `Remove ${checkedCount} checked item${checkedCount !== 1 ? 's' : ''} from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearChecked },
      ]
    );
  };

  const sections = getItemsByCategory();
  const checkedCount = items.filter(i => i.checked).length;
  const totalCount = items.length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>Grocery List</Text>
          <Text style={styles.headerSub}>{checkedCount}/{totalCount} checked</Text>
        </View>
        <View style={styles.headerActions}>
          {checkedCount > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearChecked}>
              <Text style={styles.clearBtnText}>Clear</Text>
              <Ionicons name="checkmark" size={14} color="#F44336" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Add */}
      <View style={styles.quickAdd}>
        <TextInput
          style={styles.quickAddInput}
          value={newItemName}
          onChangeText={setNewItemName}
          placeholder="Quick add item…"
          placeholderTextColor="#aaa"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={[styles.quickAddBtn, !newItemName.trim() && styles.quickAddBtnDisabled]}
          onPress={handleAdd}
          disabled={!newItemName.trim()}
        >
          <Text style={styles.quickAddBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Smart Suggestions */}
      {suggestions.length > 0 && items.length < 3 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsTitle}>Often bought:</Text>
          <View style={styles.suggestionChips}>
            {suggestions.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionChip}
                onPress={() => addItem(s, { added_by: user?.id })}
              >
                <Text style={styles.suggestionChipText}>+ {s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* List */}
      {totalCount === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>List is empty</Text>
          <Text style={styles.emptyText}>Add items above or tap + for more options.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section: { category } }) => (
            <Text style={styles.sectionHeader}>{category}</Text>
          )}
          renderItem={({ item }) => (
            <GroceryItemRow
              item={item}
              onToggle={handleToggle}
              onDelete={deleteItem}
            />
          )}
        />
      )}

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Grocery Item</Text>

            <Text style={styles.modalLabel}>Item Name</Text>
            <TextInput
              style={styles.modalInput}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="e.g. Organic Milk"
              autoFocus
              placeholderTextColor="#bbb"
            />

            <View style={styles.modalRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalLabel}>Quantity</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newItemQty}
                  onChangeText={setNewItemQty}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={styles.modalLabel}>Unit</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newItemUnit}
                  onChangeText={setNewItemUnit}
                  placeholder="pcs, L, kg…"
                  placeholderTextColor="#bbb"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.categoryGrid}>
              {FOOD_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, newItemCategory === cat && styles.catChipSelected]}
                  onPress={() => setNewItemCategory(newItemCategory === cat ? '' : cat)}
                >
                  <Text style={[styles.catChipText, newItemCategory === cat && styles.catChipTextSelected]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, !newItemName.trim() && styles.modalSaveBtnDisabled]}
                onPress={handleAdd}
                disabled={!newItemName.trim()}
              >
                <Text style={styles.modalSaveText}>Add Item</Text>
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
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#EF9A9A',
  },
  clearBtnText: { color: '#F44336', fontSize: 13, fontWeight: '600' },
  addBtn: {
    backgroundColor: '#4CAF50',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },
  quickAdd: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  quickAddInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a1a',
  },
  quickAddBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
  },
  quickAddBtnDisabled: { opacity: 0.4 },
  quickAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  suggestions: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FFF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
  },
  suggestionsTitle: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 8 },
  suggestionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  suggestionChipText: { fontSize: 12, color: '#2E7D32', fontWeight: '500' },
  listContent: { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
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
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
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
  modalRow: { flexDirection: 'row' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  catChipSelected: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  catChipText: { fontSize: 12, color: '#555', fontWeight: '500' },
  catChipTextSelected: { color: '#2E7D32', fontWeight: '700' },
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
