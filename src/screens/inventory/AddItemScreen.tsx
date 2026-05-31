import { useHouseholdContext } from '../../context/HouseholdContext';
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
import { format, addDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  InventoryStackParamList,
  FOOD_CATEGORIES,
  ProductRecognition,
} from '../../types';
import { useAuth } from '../../hooks/useAuth';

import { useInventory } from '../../hooks/useInventory';
const BarcodeScanner = React.lazy(() => import('../../components/BarcodeScanner'));
const PhotoCapture = React.lazy(() => import('../../components/PhotoCapture'));

type Props = {
  navigation: NativeStackNavigationProp<InventoryStackParamList, 'AddItem'>;
  route: RouteProp<InventoryStackParamList, 'AddItem'>;
};

export default function AddItemScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  
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
  const [showPhoto, setShowPhoto] = useState(false);
  const [recognitionNote, setRecognitionNote] = useState<string | null>(null);

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

  const handleRecognized = (result: ProductRecognition) => {
    setShowPhoto(false);
    if (result.name) setName(result.name);
    if (result.category) setCategory(result.category);

    // Route to a location whose storage temperature matches the suggestion.
    if (result.storage && !locationId) {
      const match = locations.find(l => l.temperature_type === result.storage);
      if (match) setLocationId(match.id);
    }

    // Pre-fill a predicted expiry date from the model's shelf-life estimate.
    if (result.expiry_estimate_days && result.expiry_estimate_days > 0 && !expiryDate && !bestBefore) {
      setExpiryDate(format(addDays(new Date(), result.expiry_estimate_days), 'yyyy-MM-dd'));
    }

    setRecognitionNote(
      result.confidence === 'low'
        ? 'Low confidence — double-check the name below.'
        : result.notes || null
    );
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
        {/* Smart capture: identify by photo (AI) or scan a barcode */}
        <View style={styles.captureRow}>
          <TouchableOpacity style={styles.captureBtn} onPress={() => setShowPhoto(true)}>
            <Ionicons name="camera-outline" size={20} color="#2E7D32" />
            <Text style={styles.captureBtnText}>Identify by Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={() => setShowScanner(true)}>
            <Ionicons name="barcode-outline" size={20} color="#2E7D32" />
            <Text style={styles.captureBtnText}>Scan Barcode</Text>
          </TouchableOpacity>
        </View>

        {recognitionNote && (
          <View style={styles.recognitionNote}>
            <Ionicons name="sparkles-outline" size={14} color="#1565C0" />
            <Text style={styles.recognitionNoteText}>{recognitionNote}</Text>
          </View>
        )}

        {barcode ? (
          <View style={styles.barcodeBanner}>
            <Text style={styles.barcodeBannerText}>📊 Barcode: {barcode}</Text>
            <TouchableOpacity onPress={() => setBarcode('')}>
              <Text style={styles.barcodeClear}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

      {/* Barcode Scanner Modal — lazy loaded so camera doesn't init at startup */}
      <Modal visible={showScanner} animationType="slide">
        <React.Suspense fallback={<View style={{flex:1,backgroundColor:'#000'}}/>}>
          <BarcodeScanner
            onScanned={handleBarcodeScanned}
            onClose={() => setShowScanner(false)}
          />
        </React.Suspense>
      </Modal>

      {/* Photo Recognition Modal — lazy loaded so camera doesn't init at startup */}
      <Modal visible={showPhoto} animationType="slide">
        <React.Suspense fallback={<View style={{flex:1,backgroundColor:'#000'}}/>}>
          <PhotoCapture
            onRecognized={handleRecognized}
            onClose={() => setShowPhoto(false)}
          />
        </React.Suspense>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  captureRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnText: { color: '#2E7D32', fontWeight: '600', fontSize: 14 },
  recognitionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  recognitionNoteText: { color: '#1565C0', fontSize: 12, flex: 1 },
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
