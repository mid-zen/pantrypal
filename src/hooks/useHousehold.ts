import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Household, HouseholdMember } from '../types';

const HOUSEHOLD_CACHE_KEY = 'pantrypal:household';

export function useHousehold(userId: string | undefined) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHousehold = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Load cached household immediately so the app doesn't show setup screen on every launch
      const cached = await AsyncStorage.getItem(HOUSEHOLD_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.userId === userId) {
          setHousehold(parsed.household);
          setLoading(false);
          return; // Use cache; background refresh happens on next full mount
        }
      }

      setLoading(true);
      // Find household membership
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!memberData) {
        setHousehold(null);
        setLoading(false);
        return;
      }

      // Fetch household details
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('*')
        .eq('id', memberData.household_id)
        .single();

      if (householdError) throw householdError;

      setHousehold(householdData);
      await AsyncStorage.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify({ userId, household: householdData }));

      // Fetch all members
      const { data: membersData } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', memberData.household_id);

      setMembers(membersData ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  const createHousehold = useCallback(async (name: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };

    try {
      const { data, error: rpcError } = await supabase.rpc('create_household', {
        household_name: name,
      });

      if (rpcError) throw rpcError;

      // Use the returned household data directly — avoids RLS re-fetch timing issues
      if (data) {
        setHousehold(data as any);
        await AsyncStorage.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify({ userId, household: data }));
      } else {
        await fetchHousehold();
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [userId, fetchHousehold]);

  const joinHousehold = useCallback(async (inviteCode: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };

    try {
      const { data, error: rpcError } = await supabase.rpc('join_household', {
        p_invite_code: inviteCode.toUpperCase(),
      });

      if (rpcError) {
        if (rpcError.message.includes('Invalid invite code')) {
          return { error: 'Invalid invite code. Please check and try again.' };
        }
        throw rpcError;
      }

      if (data) {
        setHousehold(data as any);
      } else {
        await fetchHousehold();
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [userId, fetchHousehold]);

  const leaveHousehold = useCallback(async (): Promise<{ error: string | null }> => {
    if (!userId || !household) return { error: 'Not in a household' };

    try {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('user_id', userId)
        .eq('household_id', household.id);

      if (error) throw error;

      setHousehold(null);
      setMembers([]);
      await AsyncStorage.removeItem(HOUSEHOLD_CACHE_KEY);
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [userId, household]);

  return {
    household,
    members,
    loading,
    error,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    refetch: fetchHousehold,
  };
}
