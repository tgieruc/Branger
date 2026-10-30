import type { Database } from '@/lib/database.types';

// Row types from Supabase
type Tables = Database['public']['Tables'];

export type Recipe = Tables['recipes']['Row'];
export type RecipeInsert = Tables['recipes']['Insert'];
export type RecipeIngredient = Tables['recipe_ingredients']['Row'];
export type RecipeIngredientInsert = Tables['recipe_ingredients']['Insert'];
export type RecipeStep = Tables['recipe_steps']['Row'];
export type RecipeStepInsert = Tables['recipe_steps']['Insert'];
export type ShoppingList = Tables['shopping_lists']['Row'];
export type ShoppingListInsert = Tables['shopping_lists']['Insert'];
export type ListMember = Tables['list_members']['Row'];
export type ListItem = Tables['list_items']['Row'];
export type ListItemInsert = Tables['list_items']['Insert'];

// Composite types for UI
export type RecipeWithDetails = Recipe & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type ShoppingListWithItems = ShoppingList & {
  items: ListItem[];
  members: ListMember[];
};

// AI pipeline types
export type AIRecipeResult = {
  title: string;
  ingredients: { name: string; description: string }[];
  steps: string[];
};
