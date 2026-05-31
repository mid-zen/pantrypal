export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  user?: {
    email: string;
  };
}

/**
 * Storage temperature class for a location. Drives the (future) feature that
 * suggests the best place to store a given food, and lets photo recognition
 * route items to the right shelf.
 */
export type StorageTemperature = 'frozen' | 'refrigerated' | 'cool' | 'room';

export interface InventoryLocation {
  id: string;
  household_id: string;
  name: string;
  icon: string | null;
  /** Categorical storage temperature, or null if not set. */
  temperature_type: StorageTemperature | null;
  /** Optional exact temperature in °C (overrides the category for display). */
  temperature_c: number | null;
  created_at: string;
}

export const TEMPERATURE_LABELS: Record<StorageTemperature, string> = {
  frozen: 'Frozen (≈ −18 °C)',
  refrigerated: 'Refrigerated (≈ 4 °C)',
  cool: 'Cool / Cellar (≈ 12 °C)',
  room: 'Room temp (≈ 20 °C)',
};

/** Short label for compact UI (badges, chips). */
export const TEMPERATURE_SHORT: Record<StorageTemperature, string> = {
  frozen: 'Frozen',
  refrigerated: 'Fridge',
  cool: 'Cool',
  room: 'Room',
};

export const TEMPERATURE_TYPES: StorageTemperature[] = ['frozen', 'refrigerated', 'cool', 'room'];

export type ExpiryStatus = 'good' | 'expiring_soon' | 'expired' | 'unknown';

export interface InventoryItem {
  id: string;
  household_id: string;
  location_id: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  barcode: string | null;
  category: string | null;
  date_added: string;
  best_before: string | null;
  expiry_date: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  // computed
  expiry_status?: ExpiryStatus;
}

export interface GroceryItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  checked: boolean;
  checked_at: string | null;
  added_by: string | null;
  /** Where this item should be filed once purchased (fridge/freezer/pantry…). */
  target_location_id: string | null;
  created_at: string;
}

/** Result of identifying a product from a photo (or barcode lookup). */
export interface ProductRecognition {
  name: string;
  category: FoodCategory | null;
  /** Suggested storage temperature class for this product. */
  storage: StorageTemperature | null;
  /** Rough shelf life in days from today, if the model can estimate it. */
  expiry_estimate_days: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  notes: string | null;
}

export interface WasteLog {
  id: string;
  household_id: string;
  item_name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  estimated_value: number | null;
  reason: 'expired' | 'used' | 'thrown_out';
  logged_at: string;
}

export interface Recipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  usedIngredients: RecipeIngredient[];
  missedIngredients: RecipeIngredient[];
  readyInMinutes?: number;
  servings?: number;
  summary?: string;
}

export interface RecipeIngredient {
  id: number;
  name: string;
  amount: number;
  unit: string;
  original: string;
  image: string;
}

export type FoodCategory =
  | 'Produce'
  | 'Dairy'
  | 'Meat'
  | 'Seafood'
  | 'Bakery'
  | 'Frozen'
  | 'Pantry'
  | 'Beverages'
  | 'Condiments'
  | 'Snacks'
  | 'Other';

// Default shelf life in days per category
export const DEFAULT_SHELF_LIFE: Record<FoodCategory, number> = {
  Produce: 7,
  Dairy: 10,
  Meat: 3,
  Seafood: 2,
  Bakery: 5,
  Frozen: 90,
  Pantry: 365,
  Beverages: 30,
  Condiments: 180,
  Snacks: 60,
  Other: 14,
};

export const FOOD_CATEGORIES: FoodCategory[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Bakery',
  'Frozen',
  'Pantry',
  'Beverages',
  'Condiments',
  'Snacks',
  'Other',
];

export const LOCATION_ICONS: Record<string, string> = {
  Fridge: '🧊',
  Freezer: '❄️',
  Pantry: '🗄️',
  Cabinet: '🚪',
  Cellar: '🏚️',
  Counter: '🪴',
};

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Household: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  InventoryTab: undefined;
  GroceryTab: undefined;
  RecipesTab: undefined;
  WasteTab: undefined;
  SettingsTab: undefined;
};

export type InventoryStackParamList = {
  Inventory: undefined;
  AddItem: { locationId?: string } | undefined;
  ItemDetail: { item: InventoryItem };
};
