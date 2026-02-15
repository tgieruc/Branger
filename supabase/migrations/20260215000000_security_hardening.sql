-- ============================================
-- SECURITY HARDENING MIGRATION
-- Fixes: storage INSERT policy, shopping_lists INSERT, list_members INSERT,
-- recipes/ingredients/steps UPDATE WITH CHECK, grant shared recipe to anon
-- ============================================

-- 1. Storage: scope INSERT to user's own folder (prevents cross-user photo overwrite)
DROP POLICY "Authenticated users can upload recipe photos" ON storage.objects;
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2. Shopping lists: remove direct INSERT (all creation goes through create_list_with_member RPC)
DROP POLICY "Authenticated users can create lists" ON public.shopping_lists;

-- 3. List members: remove self-join policy (prevents unauthorized list access)
-- Initial membership is handled by create_list_with_member SECURITY DEFINER RPC
DROP POLICY "Users can add themselves to lists" ON public.list_members;

-- 4. Recipes: add WITH CHECK to prevent ownership transfer via UPDATE
DROP POLICY "Users can update own recipes" ON public.recipes;
CREATE POLICY "Users can update own recipes"
  ON public.recipes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Recipe ingredients: add WITH CHECK to prevent re-parenting to another recipe
DROP POLICY "Users can update own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can update own recipe ingredients"
  ON public.recipe_ingredients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- 6. Recipe steps: add WITH CHECK to prevent re-parenting to another recipe
DROP POLICY "Users can update own recipe steps" ON public.recipe_steps;
CREATE POLICY "Users can update own recipe steps"
  ON public.recipe_steps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_steps.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_steps.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- 7. Grant anon access to get_shared_recipe for unauthenticated share links
GRANT EXECUTE ON FUNCTION public.get_shared_recipe(text) TO anon;
