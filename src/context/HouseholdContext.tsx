import React, { createContext, useContext } from 'react';
import { Household, HouseholdMember } from '../types';

interface HouseholdContextValue {
  household: Household | null;
  members: HouseholdMember[];
  createHousehold: (name: string) => Promise<{ error: string | null }>;
  joinHousehold: (inviteCode: string) => Promise<{ error: string | null }>;
  leaveHousehold: () => Promise<{ error: string | null }>;
  refetch: () => Promise<void>;
}

export const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  members: [],
  createHousehold: async () => ({ error: 'Not ready' }),
  joinHousehold: async () => ({ error: 'Not ready' }),
  leaveHousehold: async () => ({ error: 'Not ready' }),
  refetch: async () => {},
});

export function useHouseholdContext() {
  return useContext(HouseholdContext);
}
