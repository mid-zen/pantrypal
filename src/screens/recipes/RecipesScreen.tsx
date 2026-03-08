import { useHouseholdContext } from '../../context/HouseholdContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInventory } from '../../hooks/useInventory';
import { Recipe, RecipeIngredient } from '../../types';
import { supabase } from '../../lib/supabase';

const SPOONACULAR_API_KEY = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY ?? '';

async function fetchRecipesByIngredients(ingredientNames: string[]): Promise<Recipe[]> {
  if (!SPOONACULAR_API_KEY || ingredientNames.length === 0) return [];

  const ingredients = ingredientNames.slice(0, 10).join(',');
  const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredients)}&number=12&ranking=2&ignorePantry=true&apiKey=${SPOONACULAR_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Spoonacular API error');
  return res.json();
}

async function fetchRecipeDetail(id: number): Promise<Recipe & { summary: string; readyInMinutes: number; servings: number }> {
  const url = `https://api.spoonacular.com/recipes/${id}/information?apiKey=${SPOONACULAR_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch recipe details');
  return res.json();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export default function RecipesScreen() {
  const { user } = useAuth();
  const { household } = useHouseholdContext();
  const insets = useSafeAreaInsets();
  
  const { items, deleteItem, getExpiringSoon } = useInventory(household?.id);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<(Recipe & { summary?: string; readyInMinutes?: number; servings?: number }) | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [makingRecipe, setMakingRecipe] = useState(false);

  const expiringSoon = getExpiringSoon();
  const ingredientNames = expiringSoon.length > 0
    ? expiringSoon.map(i => i.name)
    : items.slice(0, 10).map(i => i.name);

  useEffect(() => {
    if (ingredientNames.length > 0) {
      loadRecipes();
    }
  }, [items.length]);

  const loadRecipes = async () => {
    if (!SPOONACULAR_API_KEY) {
      setError('Spoonacular API key not configured. Add EXPO_PUBLIC_SPOONACULAR_API_KEY to your .env file.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await fetchRecipesByIngredients(ingredientNames);
      setRecipes(results);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  };

  const handleViewRecipe = async (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setLoadingDetail(true);

    try {
      const detail = await fetchRecipeDetail(recipe.id);
      setSelectedRecipe(detail);
    } catch (err) {
      // Keep the basic recipe data
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleMadeThis = async () => {
    if (!selectedRecipe || !household?.id) return;

    setMakingRecipe(true);

    // Remove used ingredients from inventory
    const usedIngredients = selectedRecipe.usedIngredients ?? [];
    const ingredientNameLower = usedIngredients.map(i => i.name.toLowerCase());

    const matchingItems = items.filter(item =>
      ingredientNameLower.some(name =>
        item.name.toLowerCase().includes(name) || name.includes(item.name.toLowerCase())
      )
    );

    if (matchingItems.length > 0) {
      Alert.alert(
        'Remove Ingredients?',
        `This will mark ${matchingItems.length} item(s) as used from your inventory:\n${matchingItems.map(i => i.name).join(', ')}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setMakingRecipe(false) },
          {
            text: 'Yes, remove them',
            onPress: async () => {
              for (const item of matchingItems) {
                await deleteItem(item.id, true, 'used');
              }
              setMakingRecipe(false);
              setSelectedRecipe(null);
              Alert.alert('🍽️ Enjoy your meal!', 'Ingredients have been removed from your inventory.');
            },
          },
        ]
      );
    } else {
      setMakingRecipe(false);
      setSelectedRecipe(null);
      Alert.alert('🍽️ Enjoy your meal!', 'Bon appétit!');
    }
  };

  const renderRecipeCard = ({ item: recipe }: { item: Recipe }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleViewRecipe(recipe)} activeOpacity={0.85}>
      <Image source={{ uri: recipe.image }} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{recipe.usedIngredientCount}</Text>
            <Text style={styles.metaLabel}>have</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={[styles.metaValue, { color: '#F57F17' }]}>{recipe.missedIngredientCount}</Text>
            <Text style={styles.metaLabel}>need</Text>
          </View>
        </View>

        {recipe.usedIngredients?.length > 0 && (
          <Text style={styles.ingredientPreview} numberOfLines={1}>
            Uses: {recipe.usedIngredients.map(i => i.name).join(', ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>Recipes</Text>
          <Text style={styles.headerSub}>
            {expiringSoon.length > 0
              ? `Based on ${expiringSoon.length} expiring item${expiringSoon.length !== 1 ? 's' : ''}`
              : 'Based on your inventory'}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadRecipes} disabled={loading}>
          <Text style={styles.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Ingredient chips */}
      {ingredientNames.length > 0 && (
        <View style={styles.ingredientsBar}>
          <Text style={styles.ingredientsBarLabel}>Using: </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ingredientNames.slice(0, 8).map(name => (
              <View key={name} style={styles.ingredientChip}>
                <Text style={styles.ingredientChipText}>{name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Finding recipes…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadRecipes}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🍳</Text>
          <Text style={styles.emptyTitle}>No recipes found</Text>
          <Text style={styles.emptyText}>Add items to your inventory to get recipe suggestions.</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={item => String(item.id)}
          renderItem={renderRecipeCard}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}

      {/* Recipe Detail Modal */}
      <Modal visible={!!selectedRecipe} animationType="slide" presentationStyle="pageSheet">
        {selectedRecipe && (
          <View style={styles.detailContainer}>
            <ScrollView bounces>
              <Image source={{ uri: selectedRecipe.image }} style={styles.detailImage} />

              <View style={styles.detailContent}>
                <Text style={styles.detailTitle}>{selectedRecipe.title}</Text>

                {loadingDetail ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} color="#4CAF50" />
                ) : (
                  <>
                    <View style={styles.detailMeta}>
                      {selectedRecipe.readyInMinutes && (
                        <View style={styles.detailMetaItem}>
                          <Text style={styles.detailMetaValue}>⏱️ {selectedRecipe.readyInMinutes} min</Text>
                        </View>
                      )}
                      {selectedRecipe.servings && (
                        <View style={styles.detailMetaItem}>
                          <Text style={styles.detailMetaValue}>🍽️ {selectedRecipe.servings} servings</Text>
                        </View>
                      )}
                    </View>

                    {selectedRecipe.summary && (
                      <Text style={styles.detailSummary}>{stripHtml(selectedRecipe.summary).slice(0, 300)}…</Text>
                    )}

                    {selectedRecipe.usedIngredients?.length > 0 && (
                      <View style={styles.ingredientSection}>
                        <Text style={styles.ingredientSectionTitle}>✅ You have ({selectedRecipe.usedIngredients.length})</Text>
                        {selectedRecipe.usedIngredients.map(i => (
                          <Text key={i.id} style={styles.ingredientItem}>• {i.original}</Text>
                        ))}
                      </View>
                    )}

                    {selectedRecipe.missedIngredients?.length > 0 && (
                      <View style={styles.ingredientSection}>
                        <Text style={[styles.ingredientSectionTitle, { color: '#F57F17' }]}>
                          🛒 You need ({selectedRecipe.missedIngredients.length})
                        </Text>
                        {selectedRecipe.missedIngredients.map(i => (
                          <Text key={i.id} style={styles.ingredientItem}>• {i.original}</Text>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.detailActions}>
              <TouchableOpacity
                style={styles.detailCancelBtn}
                onPress={() => setSelectedRecipe(null)}
              >
                <Text style={styles.detailCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.madethisBtn, makingRecipe && { opacity: 0.7 }]}
                onPress={handleMadeThis}
                disabled={makingRecipe}
              >
                {makingRecipe ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.madeThisText}>🍳 I Made This!</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  refreshBtnText: { color: '#4CAF50', fontSize: 13, fontWeight: '600' },
  ingredientsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FFF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
  },
  ingredientsBarLabel: { fontSize: 12, color: '#888', marginRight: 6 },
  ingredientChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    marginRight: 6,
  },
  ingredientChipText: { fontSize: 11, color: '#2E7D32', fontWeight: '500' },
  listContent: { padding: 12, paddingBottom: 40 },
  columnWrapper: { gap: 12 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardImage: { width: '100%', height: 120 },
  cardBody: { padding: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  metaItem: { alignItems: 'center' },
  metaValue: { fontSize: 16, fontWeight: '800', color: '#4CAF50' },
  metaLabel: { fontSize: 10, color: '#888' },
  metaDivider: { width: 1, height: 24, backgroundColor: '#E0E0E0', marginHorizontal: 10 },
  ingredientPreview: { fontSize: 10, color: '#888' },
  loadingText: { marginTop: 12, color: '#888', fontSize: 14 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  // Detail Modal
  detailContainer: { flex: 1, backgroundColor: '#fff' },
  detailImage: { width: '100%', height: 240 },
  detailContent: { padding: 20 },
  detailTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 12 },
  detailMeta: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  detailMetaItem: {},
  detailMetaValue: { fontSize: 14, color: '#555' },
  detailSummary: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 },
  ingredientSection: { marginBottom: 16 },
  ingredientSectionTitle: { fontSize: 15, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  ingredientItem: { fontSize: 13, color: '#444', lineHeight: 22 },
  detailActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  detailCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  detailCancelText: { fontWeight: '600', color: '#555' },
  madethisBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  madeThisText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
