import { useState, useEffect, useCallback } from 'react';
import { supabase, generateInviteCode } from '../lib/supabase';
import { Household, HouseholdMember } from '../types';

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
      const inviteCode = generateInviteCode();

      const { data: newHousehold, error: createError } = await supabase
        .from('households')
        .insert({ name, invite_code: inviteCode })
        .select()
        .single();

      if (createError) throw createError;

      // Add user as owner
      const { error: memberError } = await supabase
        .from('household_members')
        .insert({
          household_id: newHousehold.id,
          user_id: userId,
          role: 'owner',
        });

      if (memberError) throw memberError;

      // Create default locations
      await supabase.from('inventory_locations').insert([
        { household_id: newHousehold.id, name: 'Fridge', icon: '🧊' },
        { household_id: newHousehold.id, name: 'Freezer', icon: '❄️' },
        { household_id: newHousehold.id, name: 'Pantry', icon: '🗄️' },
      ]);

      await fetchHousehold();
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [userId, fetchHousehold]);

  const joinHousehold = useCallback(async (inviteCode: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };

    try {
      const { data: targetHousehold, error: findError } = await supabase
        .from('households')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();

      if (findError || !targetHousehold) {
        return { error: 'Invalid invite code. Please check and try again.' };
      }

      const { error: joinError } = await supabase
        .from('household_members')
        .insert({
          household_id: targetHousehold.id,
          user_id: userId,
          role: 'member',
        });

      if (joinError) {
        if (joinError.code === '23505') {
          return { error: 'You are already a member of this household.' };
        }
        throw joinError;
      }

      await fetchHousehold();
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
