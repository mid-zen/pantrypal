import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { recognizeProduct } from '../lib/recognizeProduct';
import { ProductRecognition } from '../types';

interface PhotoCaptureProps {
  onRecognized: (result: ProductRecognition) => void;
  onClose: () => void;
}

/**
 * Full-screen camera that snaps a photo of a product and sends it to the
 * `recognize-product` edge function to auto-fill the product name & details.
 */
export default function PhotoCapture({ onRecognized, onClose }: PhotoCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleCapture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        skipProcessing: true,
      });
      if (!photo?.base64) {
        setErrorMsg('Could not capture photo. Try again.');
        setBusy(false);
        return;
      }

      const { data, error } = await recognizeProduct(photo.base64, 'image/jpeg');
      if (error || !data) {
        setErrorMsg(error ?? 'Could not identify the item.');
        setBusy(false);
        return;
      }
      onRecognized(data);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Something went wrong.');
      setBusy(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission…</Text>
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
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topHint}>Identify by Photo</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Framing guide */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Center the product or its label, then tap the shutter</Text>
      </View>

      {/* Error toast */}
      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.shutter, busy && styles.shutterBusy]}
          onPress={handleCapture}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>
        {busy && <Text style={styles.analyzing}>Analyzing…</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: { padding: 4 },
  topHint: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: 'rgba(76,175,80,0.9)',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorBox: {
    position: 'absolute',
    bottom: 160,
    marginHorizontal: 24,
    backgroundColor: 'rgba(244,67,54,0.92)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingBottom: 48,
    paddingTop: 16,
    alignItems: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { borderColor: '#4CAF50' },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  analyzing: { color: '#fff', marginTop: 12, fontSize: 13 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center', padding: 24 },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
