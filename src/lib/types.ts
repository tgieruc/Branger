// Standalone types matching the self-hosted API response shapes

// Matches server RecipeOut
export type Recipe = {
  id: string;
  title: string;
  photo_url: string | null;
  share_token: string | null;
  source_type: string;
  source_url: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  created_at: string;
  updated_at: string;
};

// Matches server IngredientOut
export type RecipeIngredient = {
  id: string;
  name: string;
  description: string;
  position: number;
};

// Matches server StepOut
export type RecipeStep = {
  id: string;
  step_number: number;
  instruction: string;
};

export type RecipeWithDetails = Recipe & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

// Matches server ItemOut
export type ListItem = {
  id: string;
  list_id: string;
  name: string;
  description: string | null;
  checked: boolean;
  recipe_id: string | null;
  position: number;
  created_at: string;
};

export type AIRecipeResult = {
  title: string;
  ingredients: { name: string; description: string }[];
  steps: string[];
};
