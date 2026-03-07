import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';

interface BarcodeScannerProps {
  onScanned: (barcode: string, productName?: string, category?: string) => void;
  onClose: () => void;
}

interface OpenFoodFactsProduct {
  product_name?: string;
  categories_tags?: string[];
  quantity?: string;
}

// Map Open Food Facts category to our categories
function mapCategory(tags: string[]): string {
  const tagStr = tags.join(' ').toLowerCase();
  if (tagStr.includes('dairy') || tagStr.includes('milk') || tagStr.includes('cheese') || tagStr.includes('yogurt')) return 'Dairy';
  if (tagStr.includes('meat') || tagStr.includes('beef') || tagStr.includes('chicken') || tagStr.includes('pork')) return 'Meat';
  if (tagStr.includes('fish') || tagStr.includes('seafood') || tagStr.includes('salmon') || tagStr.includes('tuna')) return 'Seafood';
  if (tagStr.includes('fruit') || tagStr.includes('vegetable') || tagStr.includes('produce')) return 'Produce';
  if (tagStr.includes('frozen')) return 'Frozen';
  if (tagStr.includes('beverage') || tagStr.includes('drink') || tagStr.includes('juice') || tagStr.includes('water')) return 'Beverages';
  if (tagStr.includes('bakery') || tagStr.includes('bread') || tagStr.includes('pastry')) return 'Bakery';
  if (tagStr.includes('snack') || tagStr.includes('chip') || tagStr.includes('cookie')) return 'Snacks';
  if (tagStr.includes('sauce') || tagStr.includes('condiment') || tagStr.includes('dressing')) return 'Condiments';
  return 'Pantry';
}

async function lookupBarcode(barcode: string): Promise<{ name?: string; category?: string }> {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const product: OpenFoodFactsProduct = data.product;
      const name = product.product_name;
      const category = product.categories_tags ? mapCategory(product.categories_tags) : undefined;
      return { name, category };
    }
  } catch (err) {
    console.warn('Barcode lookup failed:', err);
  }
  return {};
}

export default function BarcodeScanner({ onScanned, onClose }: BarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarCodeScanned = async ({ type, data }: BarCodeScannerResult) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      const { name, category } = await lookupBarcode(data);
      onScanned(data, name, category);
    } finally {
      setLoading(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.text}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera permission denied.</Text>
        <TouchableOpacity style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Overlay frame */}
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : scanned ? (
            <Text style={styles.scanText}>Looking up product…</Text>
          ) : (
            <Text style={styles.scanText}>Align barcode within the frame</Text>
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { fontSize: 16, color: '#555', marginTop: 12, textAlign: 'center' },
  btn: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  overlay: { flex: 1 },
  topOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  middleRow: { flexDirection: 'row', height: FRAME_SIZE },
  sideOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 24,
  },
  scanText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  closeBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
});
