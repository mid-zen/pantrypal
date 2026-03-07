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
In your Supabase dashboard → SQL Editor, run the contents of:
```
supabase/migrations/001_initial.sql
```

### 4. Run the App
```bash
npx expo start
```
Scan the QR code with **Expo Go** on your phone.

## Features
- 📦 Inventory tracking with custom locations (Fridge, Freezer, Pantry, etc.)
- 🛒 Grocery list with auto-add to inventory on purchase
- 📷 Barcode scanner for fast item entry
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
