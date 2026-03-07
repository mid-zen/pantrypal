import { useState, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, isValid } from 'date-fns';
import { supabase } from '../lib/supabase';
import {
  InventoryItem,
  InventoryLocation,
  ExpiryStatus,
  FoodCategory,
  DEFAULT_SHELF_LIFE,
} from '../types';

export function daysUntilExpiry(dateString: string): number {
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return Infinity;
    return differenceInDays(date, new Date());
  } catch {
    return Infinity;
  }
}

export function getExpiryStatus(item: InventoryItem): ExpiryStatus {
  const expiryDate = item.expiry_date || item.best_before;
  if (!expiryDate) return 'unknown';

  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return 'expired';
  if (days <= 3) return 'expiring_soon';
  return 'good';
}

export function predictExpiryDate(category: FoodCategory | string, dateAdded: string): string {
  const shelfLife = DEFAULT_SHELF_LIFE[category as FoodCategory] ?? 14;
  const addedDate = parseISO(dateAdded);
  const expiry = new Date(addedDate);
  expiry.setDate(expiry.getDate() + shelfLife);
  return expiry.toISOString().split('T')[0];
}

export function useInventory(householdId: string | undefined) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [{ data: locData, error: locErr }, { data: itemData, error: itemErr }] =
        await Promise.all([
          supabase
            .from('inventory_locations')
            .select('*')
            .eq('household_id', householdId)
            .order('created_at'),
          supabase
            .from('inventory_items')
            .select('*')
            .eq('household_id', householdId)
            .order('created_at', { ascending: false }),
        ]);

      if (locErr) throw locErr;
      if (itemErr) throw itemErr;

      setLocations(locData ?? []);

      // Attach computed expiry status
      const enriched = (itemData ?? []).map((item: InventoryItem) => ({
        ...item,
        expiry_status: getExpiryStatus(item),
      }));
      setItems(enriched);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    fetchAll();

    if (!householdId) return;

    // Real-time subscription
    const channel = supabase
      .channel(`inventory-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `household_id=eq.${householdId}` },
        () => fetchAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_locations', filter: `household_id=eq.${householdId}` },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, fetchAll]);

  const addItem = useCallback(
    async (item: Partial<InventoryItem>): Promise<{ error: string | null }> => {
      if (!householdId) return { error: 'No household' };

      // If no expiry date but we have a category, predict it
      let expiry_date = item.expiry_date;
      if (!expiry_date && !item.best_before && item.category) {
        expiry_date = predictExpiryDate(item.category, item.date_added || new Date().toISOString().split('T')[0]);
      }

      try {
        const { error } = await supabase.from('inventory_items').insert({
          household_id: householdId,
          location_id: item.location_id || null,
          name: item.name,
          quantity: item.quantity ?? 1,
          unit: item.unit || null,
          barcode: item.barcode || null,
          category: item.category || null,
          date_added: item.date_added || new Date().toISOString().split('T')[0],
          best_before: item.best_before || null,
          expiry_date: expiry_date || null,
          notes: item.notes || null,
          added_by: item.added_by || null,
        });

        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [householdId, fetchAll]
  );

  const updateItem = useCallback(
    async (id: string, updates: Partial<InventoryItem>): Promise<{ error: string | null }> => {
      try {
        const { error } = await supabase
          .from('inventory_items')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [fetchAll]
  );

  const deleteItem = useCallback(
    async (id: string, logWaste = false, reason: 'expired' | 'used' | 'thrown_out' = 'thrown_out'): Promise<{ error: string | null }> => {
      try {
        const item = items.find(i => i.id === id);

        if (item && logWaste) {
          await supabase.from('waste_log').insert({
            household_id: householdId,
            item_name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            estimated_value: null,
            reason,
          });
        }

        const { error } = await supabase.from('inventory_items').delete().eq('id', id);
        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [items, householdId, fetchAll]
  );

  const addLocation = useCallback(
    async (name: string, icon?: string): Promise<{ error: string | null }> => {
      if (!householdId) return { error: 'No household' };
      try {
        const { error } = await supabase.from('inventory_locations').insert({
          household_id: householdId,
          name,
          icon: icon || null,
        });
        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [householdId, fetchAll]
  );

  const updateLocation = useCallback(
    async (id: string, name: string, icon?: string): Promise<{ error: string | null }> => {
      try {
        const { error } = await supabase
          .from('inventory_locations')
          .update({ name, icon: icon || null })
          .eq('id', id);
        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [fetchAll]
  );

  const deleteLocation = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      try {
        const { error } = await supabase.from('inventory_locations').delete().eq('id', id);
        if (error) throw error;
        await fetchAll();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [fetchAll]
  );

  const getItemsByLocation = useCallback(
    (locationId: string | null) =>
      items.filter(item => item.location_id === locationId),
    [items]
  );

  const getExpiringSoon = useCallback(
    () => items.filter(item => item.expiry_status === 'expiring_soon' || item.expiry_status === 'expired'),
    [items]
  );

  return {
    items,
    locations,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    addLocation,
    updateLocation,
    deleteLocation,
    getItemsByLocation,
    getExpiringSoon,
    refetch: fetchAll,
  };
}
