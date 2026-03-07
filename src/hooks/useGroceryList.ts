import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { GroceryItem, FoodCategory, FOOD_CATEGORIES } from '../types';

export function useGroceryList(householdId: string | undefined) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setItems(data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    fetchItems();

    if (!householdId) return;

    // Real-time subscription
    const channel = supabase
      .channel(`grocery-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_items', filter: `household_id=eq.${householdId}` },
        () => fetchItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, fetchItems]);

  const addItem = useCallback(
    async (name: string, options?: Partial<GroceryItem>): Promise<{ error: string | null }> => {
      if (!householdId) return { error: 'No household' };
      try {
        const { error } = await supabase.from('grocery_items').insert({
          household_id: householdId,
          name,
          quantity: options?.quantity ?? 1,
          unit: options?.unit || null,
          category: options?.category || null,
          added_by: options?.added_by || null,
        });
        if (error) throw error;
        await fetchItems();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [householdId, fetchItems]
  );

  const checkItem = useCallback(
    async (id: string, checked: boolean): Promise<{ error: string | null }> => {
      try {
        const { error } = await supabase
          .from('grocery_items')
          .update({
            checked,
            checked_at: checked ? new Date().toISOString() : null,
          })
          .eq('id', id);
        if (error) throw error;
        await fetchItems();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [fetchItems]
  );

  const deleteItem = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      try {
        const { error } = await supabase.from('grocery_items').delete().eq('id', id);
        if (error) throw error;
        await fetchItems();
        return { error: null };
      } catch (err: any) {
        return { error: err.message };
      }
    },
    [fetchItems]
  );

  const clearChecked = useCallback(async (): Promise<{ error: string | null }> => {
    if (!householdId) return { error: 'No household' };
    try {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('household_id', householdId)
        .eq('checked', true);
      if (error) throw error;
      await fetchItems();
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [householdId, fetchItems]);

  const getItemsByCategory = useCallback(() => {
    const grouped: Record<string, GroceryItem[]> = {};
    const uncategorized: GroceryItem[] = [];

    for (const item of items) {
      if (item.category) {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      } else {
        uncategorized.push(item);
      }
    }

    if (uncategorized.length > 0) grouped['Other'] = uncategorized;

    // Sort by category order
    const result: Array<{ category: string; data: GroceryItem[] }> = [];
    for (const cat of [...FOOD_CATEGORIES, 'Other']) {
      if (grouped[cat] && grouped[cat].length > 0) {
        result.push({ category: cat, data: grouped[cat] });
      }
    }

    return result;
  }, [items]);

  // Smart suggestions: most frequently added items not currently in list
  const getSuggestions = useCallback(async (): Promise<string[]> => {
    if (!householdId) return [];

    try {
      const { data } = await supabase
        .from('grocery_items')
        .select('name')
        .eq('household_id', householdId)
        .eq('checked', true)
        .order('checked_at', { ascending: false })
        .limit(50);

      if (!data) return [];

      const currentNames = new Set(items.map(i => i.name.toLowerCase()));
      const freq: Record<string, number> = {};

      for (const item of data) {
        const name = item.name.toLowerCase();
        if (!currentNames.has(name)) {
          freq[name] = (freq[name] || 0) + 1;
        }
      }

      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
    } catch {
      return [];
    }
  }, [householdId, items]);

  return {
    items,
    loading,
    error,
    addItem,
    checkItem,
    deleteItem,
    clearChecked,
    getItemsByCategory,
    getSuggestions,
    refetch: fetchItems,
  };
}
