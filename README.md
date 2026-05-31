# PantryPal 🥦

Smart fridge/pantry/freezer tracker with household sharing, expiry alerts, recipe suggestions, and more.

## Setup

### 1. Clone & Install
```bash
git clone https://github.com/mid-zen/pantrypal.git
cd pantrypal
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SPOONACULAR_API_KEY=your-spoonacular-key  # optional, for recipes
```

### 3. Set Up Supabase Database
In your Supabase dashboard → SQL Editor, run the migrations in order:
```
supabase/migrations/001_initial.sql
supabase/migrations/002_fix_rls_policies.sql
supabase/migrations/003_rpc_functions.sql
supabase/migrations/004_location_temperature_and_grocery_routing.sql
```

### 4. (Optional) Enable Photo Product Recognition
The **Identify by Photo** feature uses a Supabase Edge Function that calls
Claude vision, so the API key stays off the device.
```bash
# Deploy the function
supabase functions deploy recognize-product

# Set your Anthropic key as a server-side secret
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```
Without this, manual entry and barcode scanning still work; the photo button
just returns a friendly "not configured" message.

### 5. Run the App
```bash
npx expo start
```
Scan the QR code with **Expo Go** on your phone.

## Features
- 📦 Inventory tracking with custom locations (Fridge, Freezer, Pantry, etc.)
- 🌡️ Per-location storage temperature (frozen / refrigerated / cool / room)
- 📷 **Identify by Photo** — snap a product and Claude vision fills in the name, category & storage
- 🔢 Barcode scanner with Open Food Facts product lookup
- 🛒 Grocery list that routes purchased items to the right fridge/freezer/pantry
- 🔔 Push notifications for expiring items
- 🍳 Recipe suggestions based on what's expiring
- 🗑️ Waste tracker with cost estimates
- 👨‍👩‍👧 Household sharing with real-time sync
- 📊 Expiry color-coding (green/yellow/red)

## Tech Stack
- Expo (React Native) + TypeScript
- Supabase (Auth, Database, Real-time)
- React Navigation
- Spoonacular API (recipes)
