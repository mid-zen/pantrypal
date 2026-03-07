import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { InventoryLocation, InventoryItem } from '../types';

interface LocationFolderProps {
  location: InventoryLocation;
  items: InventoryItem[];
  expanded: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export default function LocationFolder({
  location,
  items,
  expanded,
  onToggle,
  onRename,
  onDelete,
  children,
}: LocationFolderProps) {
  const expiredCount = items.filter(i => i.expiry_status === 'expired').length;
  const expiringSoonCount = items.filter(i => i.expiry_status === 'expiring_soon').length;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>{location.icon || '📦'}</Text>
          <View>
            <Text style={styles.name}>{location.name}</Text>
            <Text style={styles.count}>{items.length} items</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {expiredCount > 0 && (
            <View style={[styles.badge, styles.badgeRed]}>
              <Text style={styles.badgeText}>{expiredCount} expired</Text>
            </View>
          )}
          {expiringSoonCount > 0 && (
            <View style={[styles.badge, styles.badgeAmber]}>
              <Text style={styles.badgeText}>{expiringSoonCount} soon</Text>
            </View>
          )}

          <TouchableOpacity style={styles.menuBtn} onPress={onRename}>
            <Text style={styles.menuIcon}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuBtn} onPress={onDelete}>
            <Text style={styles.menuIcon}>🗑️</Text>
          </TouchableOpacity>

          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No items yet. Tap + to add.</Text>
          ) : (
            children
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8FFF8',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: { fontSize: 28 },
  name: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  count: { fontSize: 12, color: '#888', marginTop: 1 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeRed: { backgroundColor: '#FFEBEE' },
  badgeAmber: { backgroundColor: '#FFF8E1' },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#555' },
  menuBtn: { padding: 4 },
  menuIcon: { fontSize: 16 },
  chevron: { fontSize: 12, color: '#999', marginLeft: 4 },
  content: {
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 13,
    paddingVertical: 16,
  },
});
