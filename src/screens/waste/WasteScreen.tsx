import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
// BarChart replaced with custom implementation (no external dependency)
import { useAuth } from '../../hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { WasteLog } from '../../types';
import { format, subWeeks, subMonths, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Period = 'week' | 'month';

interface WeeklyStat {
  label: string;
  value: number;
  frontColor: string;
}

const REASON_LABELS: Record<string, string> = {
  expired: '🗓️ Expired',
  used: '✅ Used Up',
  thrown_out: '🗑️ Thrown Out',
};

const REASON_COLORS: Record<string, string> = {
  expired: '#F44336',
  used: '#4CAF50',
  thrown_out: '#FF9800',
};

export default function WasteScreen() {
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  const insets = useSafeAreaInsets();
  

  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');

  const fetchLogs = useCallback(async () => {
    if (!household?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const since = period === 'week'
        ? subWeeks(new Date(), 8).toISOString()
        : subMonths(new Date(), 3).toISOString();

      const { data, error } = await supabase
        .from('waste_log')
        .select('*')
        .eq('household_id', household.id)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false });

      if (error) throw error;
      setLogs(data ?? []);
    } catch (err) {
      console.error('Failed to fetch waste logs:', err);
    } finally {
      setLoading(false);
    }
  }, [household?.id, period]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalWasted = logs.filter(l => l.reason !== 'used').length;
  const totalUsed = logs.filter(l => l.reason === 'used').length;
  const estimatedValue = logs
    .filter(l => l.reason !== 'used' && l.estimated_value)
    .reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);

  // Build weekly bar chart data
  const buildBarData = (): WeeklyStat[] => {
    const weeks = period === 'week'
      ? eachWeekOfInterval({ start: subWeeks(new Date(), 7), end: new Date() })
      : eachWeekOfInterval({ start: subMonths(new Date(), 3), end: new Date() });

    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart);
      const weekLogs = logs.filter(l => {
        const logDate = new Date(l.logged_at);
        return logDate >= weekStart && logDate <= weekEnd && l.reason !== 'used';
      });

      return {
        label: format(weekStart, 'MMM d'),
        value: weekLogs.length,
        frontColor: weekLogs.length > 5 ? '#F44336' : weekLogs.length > 2 ? '#FF9800' : '#4CAF50',
      };
    });
  };

  const barData = buildBarData();

  // Category breakdown
  const categoryBreakdown = logs
    .filter(l => l.reason !== 'used' && l.category)
    .reduce<Record<string, number>>((acc, l) => {
      const cat = l.category!;
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

  const topCategories = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const recentLogs = logs.slice(0, 10);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Waste Tracker</Text>
        <View style={styles.periodToggle}>
          <TouchableOpacity
            style={[styles.periodBtn, period === 'week' && styles.periodBtnActive]}
            onPress={() => setPeriod('week')}
          >
            <Text style={[styles.periodBtnText, period === 'week' && styles.periodBtnTextActive]}>
              8 Weeks
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodBtn, period === 'month' && styles.periodBtnActive]}
            onPress={() => setPeriod('month')}
          >
            <Text style={[styles.periodBtnText, period === 'month' && styles.periodBtnTextActive]}>
              3 Months
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderTopColor: '#F44336' }]}>
          <Text style={styles.summaryValue}>{totalWasted}</Text>
          <Text style={styles.summaryLabel}>Wasted</Text>
        </View>
        <View style={[styles.summaryCard, { borderTopColor: '#4CAF50' }]}>
          <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>{totalUsed}</Text>
          <Text style={styles.summaryLabel}>Used Up</Text>
        </View>
        {estimatedValue > 0 && (
          <View style={[styles.summaryCard, { borderTopColor: '#FF9800' }]}>
            <Text style={[styles.summaryValue, { color: '#FF9800' }]}>${estimatedValue.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Est. Value</Text>
          </View>
        )}
      </View>

      {/* Bar Chart — custom, no external library */}
      {barData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Waste</Text>
          <View style={styles.chartContainer}>
            {barData.map((bar, i) => {
              const maxVal = Math.max(...barData.map(d => d.value), 1);
              const heightPct = (bar.value / maxVal) * 120;
              return (
                <View key={i} style={styles.chartBarWrapper}>
                  <Text style={styles.chartBarValue}>{bar.value > 0 ? bar.value : ''}</Text>
                  <View style={[styles.chartBar, { height: Math.max(heightPct, 4), backgroundColor: bar.frontColor }]} />
                  <Text style={styles.chartBarLabel}>{bar.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Top Wasted Categories */}
      {topCategories.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Wasted Categories</Text>
          {topCategories.map(([cat, count]) => (
            <View key={cat} style={styles.categoryRow}>
              <Text style={styles.categoryName}>{cat}</Text>
              <View style={styles.categoryBarContainer}>
                <View
                  style={[
                    styles.categoryBar,
                    { width: `${(count / (topCategories[0][1] || 1)) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.categoryCount}>{count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Logs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Log</Text>
        {recentLogs.length === 0 ? (
          <Text style={styles.emptyText}>No waste logged yet. Great job! 🎉</Text>
        ) : (
          recentLogs.map(log => (
            <View key={log.id} style={styles.logRow}>
              <View style={[styles.logDot, { backgroundColor: REASON_COLORS[log.reason] || '#888' }]} />
              <View style={styles.logContent}>
                <Text style={styles.logName}>{log.item_name}</Text>
                <Text style={styles.logMeta}>
                  {REASON_LABELS[log.reason] || log.reason}
                  {log.category ? ` · ${log.category}` : ''}
                  {log.quantity > 1 ? ` · ×${log.quantity}` : ''}
                </Text>
              </View>
              <Text style={styles.logDate}>
                {format(new Date(log.logged_at), 'MMM d')}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Reduce Waste Tips</Text>
        <Text style={styles.tip}>• Check the Inventory tab for expiring items</Text>
        <Text style={styles.tip}>• Cook recipes using expiring ingredients</Text>
        <Text style={styles.tip}>• Move items expiring soon to the front of your fridge</Text>
        <Text style={styles.tip}>• Enable notifications for 3-day expiry alerts</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 2,
  },
  periodBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  periodBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  periodBtnText: { fontSize: 12, color: '#888', fontWeight: '500' },
  periodBtnTextActive: { color: '#1a1a1a', fontWeight: '700' },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryValue: { fontSize: 26, fontWeight: '800', color: '#F44336' },
  summaryLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 16,
    marginBottom: 0,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  categoryName: { width: 70, fontSize: 13, color: '#555' },
  categoryBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryBar: {
    height: '100%',
    backgroundColor: '#F44336',
    borderRadius: 4,
  },
  categoryCount: { width: 24, fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'right' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logContent: { flex: 1 },
  logName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  logMeta: { fontSize: 12, color: '#888', marginTop: 1 },
  logDate: { fontSize: 11, color: '#bbb' },
  emptyText: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingVertical: 12 },
  tipsCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    margin: 16,
    padding: 20,
  },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: '#2E7D32', marginBottom: 12 },
  tip: { fontSize: 13, color: '#555', lineHeight: 22 },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 20,
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: 18,
    borderRadius: 4,
    minHeight: 4,
  },
  chartBarValue: {
    fontSize: 10,
    color: '#888',
    marginBottom: 2,
  },
  chartBarLabel: {
    fontSize: 8,
    color: '#aaa',
    marginTop: 4,
    textAlign: 'center',
  },
});
