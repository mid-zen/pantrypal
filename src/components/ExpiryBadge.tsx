import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ExpiryStatus } from '../types';
import { daysUntilExpiry } from '../hooks/useInventory';

interface ExpiryBadgeProps {
  expiryDate: string | null;
  status?: ExpiryStatus;
  compact?: boolean;
}

const STATUS_COLORS: Record<ExpiryStatus, { bg: string; text: string; border: string }> = {
  good: { bg: '#E8F5E9', text: '#2E7D32', border: '#4CAF50' },
  expiring_soon: { bg: '#FFF8E1', text: '#F57F17', border: '#FFC107' },
  expired: { bg: '#FFEBEE', text: '#C62828', border: '#F44336' },
  unknown: { bg: '#F5F5F5', text: '#757575', border: '#BDBDBD' },
};

export default function ExpiryBadge({ expiryDate, status = 'unknown', compact = false }: ExpiryBadgeProps) {
  const colors = STATUS_COLORS[status];

  const getLabel = () => {
    if (!expiryDate) return 'No date';
    const days = daysUntilExpiry(expiryDate);
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return 'Expires today!';
    if (days === 1) return 'Expires tomorrow';
    if (days <= 7) return `${days}d left`;
    return expiryDate;
  };

  if (compact) {
    return (
      <View style={[styles.dot, { backgroundColor: colors.border }]} />
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.text }]}>{getLabel()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
