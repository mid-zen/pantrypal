import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { InventoryStackParamList, FOOD_CATEGORIES } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useHousehold } from '../../hooks/useHousehold';
import { useInventory } from '../../hooks/useInventory';
import BarcodeScanner from '../../components/BarcodeScanner';

type Props = {
  navigation: NativeStackNavigationProp<InventoryStackParamList, 'AddItem'>;
  route: RouteProp<InventoryStackParamList, 'AddItem'>;
};

export default function AddItemScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { household } = useHousehold(user?.id);
  const { locations, addItem } = useInventory(household?.id);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [locationId, setLocationId] = useState(route.params?.locationId || '');
  const [dateAdded] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bestBefore, setBestBefore] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an item name.');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid quantity', 'Please enter a valid quantity.');
      return;
    }

    setLoading(true);
    const { error } = await addItem({
      name: name.trim(),
      quantity: qty,
      unit: unit.trim() || null,
      category: category || null,
      location_id: locationId || null,
      date_added: dateAdded,
      best_before: bestBefore || null,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
      barcode: barcode || null,
      added_by: user?.id || null,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      navigation.goBack();
    }
  };

  const handleBarcodeScanned = (code: string, productName?: string, productCategory?: string) => {
    setShowScanner(false);
    setBarcode(code);
    if (productName) setName(productName);
    if (productCategory) setCategory(productCategory);
  };

  const DateInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#bbb"
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        maxLength={10}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Barcode Banner */}
        {barcode ? (
          <View style={styles.barcodeBanner}>
            <Text style={styles.barcodeBannerText}>📊 Barcode: {barcode}</Text>
            <TouchableOpacity onPress={() => setBarcode('')}>
              <Text style={styles.barcodeClear}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.scanBtn} onPress={() => setShowScanner(true)}>
            <Text style={styles.scanBtnText}>📷  Scan Barcode to Auto-Fill</Text>
          </TouchableOpacity>
        )}

        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Item Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Organic Whole Milk"
            autoCapitalize="words"
            placeholderTextColor="#bbb"
          />
        </View>

        {/* Quantity + Unit */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholderTextColor="#bbb"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1.5 }]}>
            <Text style={styles.label}>Unit</Text>
            <TextInput
              style={styles.input}
              value={unit}
              onChangeText={setUnit}
              placeholder="lbs, oz, pcs, L…"
              placeholderTextColor="#bbb"
            />
          </View>
        </View>

        {/* Category */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {FOOD_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipSelected]}
                onPress={() => setCategory(category === cat ? '' : cat)}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <TouchableOpacity
              style={[styles.chip, !locationId && styles.chipSelected]}
              onPress={() => setLocationId('')}
            >
              <Text style={[styles.chipText, !locationId && styles.chipTextSelected]}>None</Text>
            </TouchableOpacity>
            {locations.map(loc => (
              <TouchableOpacity
                key={loc.id}
                style={[styles.chip, locationId === loc.id && styles.chipSelected]}
                onPress={() => setLocationId(loc.id)}
              >
                <Text style={[styles.chipText, locationId === loc.id && styles.chipTextSelected]}>
                  {loc.icon} {loc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Dates */}
        <View style={styles.row}>
          <DateInput
            label="Best Before"
            value={bestBefore}
            onChange={setBestBefore}
          />
          <View style={{ width: 12 }} />
          <DateInput
            label="Expiry Date"
            value={expiryDate}
            onChange={setExpiryDate}
          />
        </View>

        <View style={styles.dateHint}>
          <Text style={styles.dateHintText}>
            💡 Leave blank for smart expiry prediction based on category
          </Text>
        </View>

        {/* Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes…"
            multiline
            numberOfLines={3}
            placeholderTextColor="#bbb"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Add to Inventory</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <Modal visible={showScanner} animationType="slide">
        <BarcodeScanner
          onScanned={handleBarcodeScanned}
          onClose={() => setShowScanner(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  scanBtn: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanBtnText: { color: '#2E7D32', fontWeight: '600', fontSize: 15 },
  barcodeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  barcodeBannerText: { color: '#2E7D32', fontSize: 13, fontWeight: '500' },
  barcodeClear: { color: '#999', fontSize: 16, fontWeight: '700' },
  inputGroup: { marginBottom: 16, flex: 1 },
  row: { flexDirection: 'row' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  chipScroll: { marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 4,
  },
  chipSelected: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextSelected: { color: '#2E7D32', fontWeight: '700' },
  dateHint: {
    marginBottom: 16,
    marginTop: -8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 10,
  },
  dateHintText: { fontSize: 12, color: '#F57F17' },
  saveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
