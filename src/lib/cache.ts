import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe, RecipeWithDetails } from '@/lib/types';

const RECIPES_LIST_KEY = '@recipes_cache';
const RECIPE_DETAIL_PREFIX = '@recipe_';

export async function getCachedRecipeList(): Promise<Recipe[] | null> {
  try {
    const data = await AsyncStorage.getItem(RECIPES_LIST_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCachedRecipeList(recipes: Recipe[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECIPES_LIST_KEY, JSON.stringify(recipes));
  } catch {
    // Cache write failure is non-critical
  }
}

export async function getCachedRecipeDetail(id: string): Promise<RecipeWithDetails | null> {
  try {
    const data = await AsyncStorage.getItem(RECIPE_DETAIL_PREFIX + id);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCachedRecipeDetail(id: string, recipe: RecipeWithDetails): Promise<void> {
  try {
    await AsyncStorage.setItem(RECIPE_DETAIL_PREFIX + id, JSON.stringify(recipe));
  } catch {
    // Cache write failure is non-critical
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(
      (k) => k === RECIPES_LIST_KEY || k.startsWith(RECIPE_DETAIL_PREFIX)
    );
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Cache clear failure is non-critical
  }
}
