import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { FoodCategory } from '../types';

interface BarcodeScannerProps {
  /** Called with the raw barcode plus any product name/category resolved via lookup. */
  onScanned: (barcode: string, productName?: string, category?: FoodCategory) => void;
  onClose: () => void;
}

/** Best-effort map from Open Food Facts category tags to our FoodCategory. */
function mapCategory(tags: string[] | undefined): FoodCategory | undefined {
  if (!tags || tags.length === 0) return undefined;
  const joined = tags.join(' ').toLowerCase();
  const rules: [RegExp, FoodCategory][] = [
    [/dairy|milk|cheese|yogurt|butter/, 'Dairy'],
    [/seafood|fish|shrimp|salmon|tuna/, 'Seafood'],
    [/meat|poultry|beef|pork|chicken|sausage/, 'Meat'],
    [/frozen/, 'Frozen'],
    [/bread|bakery|pastr|cake/, 'Bakery'],
    [/beverage|drink|juice|soda|water|coffee|tea/, 'Beverages'],
    [/snack|chip|cracker|candy|chocolate|cookie/, 'Snacks'],
    [/sauce|condiment|ketchup|mustard|mayo|dressing|spread/, 'Condiments'],
    [/fruit|vegetable|produce|fresh/, 'Produce'],
  ];
  for (const [re, cat] of rules) if (re.test(joined)) return cat;
  return 'Pantry';
}

async function lookupProduct(barcode: string): Promise<{ name?: string; category?: FoodCategory }> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories_tags`
    );
    const json = await res.json();
    if (json.status !== 1 || !json.product) return {};
    const p = json.product;
    const name = [p.brands?.split(',')[0]?.trim(), p.product_name?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
    return { name: name || undefined, category: mapCategory(p.categories_tags) };
  } catch {
    return {};
  }
}

export default function BarcodeScanner({ onScanned, onClose }: BarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setLookingUp(true);
    const { name, category } = await lookupProduct(data);
    setLookingUp(false);
    onScanned(data, name, category);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No camera access. Please enable it in Settings.</Text>
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        {lookingUp ? (
          <>
            <ActivityIndicator color="#4CAF50" style={{ marginBottom: 12 }} />
            <Text style={styles.hint}>Looking up product…</Text>
          </>
        ) : (
          <Text style={styles.hint}>Point at a barcode</Text>
        )}
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        {scanned && !lookingUp && (
          <TouchableOpacity style={styles.button} onPress={() => setScanned(false)}>
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    backgroundColor: 'transparent',
    marginBottom: 24,
  },
  hint: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 24,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    padding: 24,
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
