import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { GroceryItem as GroceryItemType } from '../types';

interface GroceryItemProps {
  item: GroceryItemType;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export default function GroceryItemRow({ item, onToggle, onDelete }: GroceryItemProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.checkbox, item.checked && styles.checkboxChecked]}
        onPress={() => onToggle(item.id, !item.checked)}
      >
        {item.checked && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={[styles.name, item.checked && styles.nameChecked]} numberOfLines={1}>
          {item.name}
        </Text>
        {(item.quantity > 1 || item.unit) && (
          <Text style={styles.meta}>
            {item.quantity} {item.unit || ''}
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
        <Text style={styles.deleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  nameChecked: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  meta: {
    fontSize: 12,
    color: '#888',
    marginTop: 1,
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 8,
  },
  deleteIcon: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '600',
  },
});
