import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { InventoryItem as InventoryItemType } from '../types';
import ExpiryBadge from './ExpiryBadge';

interface InventoryItemProps {
  item: InventoryItemType;
  onPress: () => void;
  onDelete: (id: string, reason: 'used' | 'thrown_out' | 'expired') => void;
  onAddToGrocery: (item: InventoryItemType) => void;
}

const SWIPE_THRESHOLD = 80;

export default function InventoryItemRow({
  item,
  onPress,
  onDelete,
  onAddToGrocery,
}: InventoryItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = React.useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -160));
        } else if (gestureState.dx > 0 && revealed) {
          translateX.setValue(Math.min(gestureState.dx - 160, 0));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -160, useNativeDriver: true }).start();
          setRevealed(true);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          setRevealed(false);
        }
      },
    })
  ).current;

  const closeActions = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    setRevealed(false);
  };

  const handleDelete = (reason: 'used' | 'thrown_out' | 'expired') => {
    closeActions();
    Alert.alert(
      'Remove Item',
      `Mark "${item.name}" as ${reason}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => onDelete(item.id, reason) },
      ]
    );
  };

  const expiryDate = item.expiry_date || item.best_before;

  return (
    <View style={styles.container}>
      {/* Swipe Actions (behind) */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.action, styles.usedAction]}
          onPress={() => handleDelete('used')}
        >
          <Text style={styles.actionIcon}>✅</Text>
          <Text style={styles.actionText}>Used</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.groceryAction]}
          onPress={() => { closeActions(); onAddToGrocery(item); }}
        >
          <Text style={styles.actionIcon}>🛒</Text>
          <Text style={styles.actionText}>Grocery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.deleteAction]}
          onPress={() => handleDelete('thrown_out')}
        >
          <Text style={styles.actionIcon}>🗑️</Text>
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main Row */}
      <Animated.View
        style={[styles.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.rowContent} onPress={onPress} activeOpacity={0.7}>
          <View style={styles.left}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {expiryDate && (
                <ExpiryBadge
                  expiryDate={expiryDate}
                  status={item.expiry_status}
                  compact
                />
              )}
            </View>
            <Text style={styles.meta}>
              {item.quantity} {item.unit || ''}{item.category ? ` · ${item.category}` : ''}
            </Text>
          </View>
          {expiryDate && (
            <ExpiryBadge expiryDate={expiryDate} status={item.expiry_status} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    width: 160,
  },
  action: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usedAction: { backgroundColor: '#4CAF50' },
  groceryAction: { backgroundColor: '#2196F3' },
  deleteAction: { backgroundColor: '#F44336' },
  actionIcon: { fontSize: 20 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  left: { flex: 1, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
});
