-- ============================================
-- FIX: Shared recipes RLS (Issue #3)
-- Old policy: anyone can SELECT recipes where share_token IS NOT NULL
-- New policy: shared recipe access goes through get_shared_recipe RPC function
-- ============================================
DROP POLICY "Anyone can view shared recipes" ON public.recipes;

-- For recipe_ingredients: fix the shared recipe check
DROP POLICY "Users can view own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can view own recipe ingredients"
  ON public.recipe_ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- For recipe_steps: fix the shared recipe check
DROP POLICY "Users can view own recipe steps" ON public.recipe_steps;
CREATE POLICY "Users can view own recipe steps"
  ON public.recipe_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_steps.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- Security definer function for shared recipe lookup (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_shared_recipe(p_token text)
RETURNS json AS $$
DECLARE
  v_recipe public.recipes%ROWTYPE;
  v_ingredients json;
  v_steps json;
BEGIN
  SELECT * INTO v_recipe FROM public.recipes WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(i) ORDER BY i.position)
    INTO v_ingredients
    FROM public.recipe_ingredients i
    WHERE i.recipe_id = v_recipe.id;

  SELECT json_agg(row_to_json(s) ORDER BY s.step_number)
    INTO v_steps
    FROM public.recipe_steps s
    WHERE s.recipe_id = v_recipe.id;

  RETURN json_build_object(
    'id', v_recipe.id,
    'title', v_recipe.title,
    'photo_url', v_recipe.photo_url,
    'source_type', v_recipe.source_type,
    'source_url', v_recipe.source_url,
    'share_token', v_recipe.share_token,
    'created_at', v_recipe.created_at,
    'updated_at', v_recipe.updated_at,
    'ingredients', COALESCE(v_ingredients, '[]'::json),
    'steps', COALESCE(v_steps, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FIX: list_members INSERT policy (Issue #2)
-- Old: any authenticated user can join any list
-- New: users can only insert their own user_id
-- ============================================
DROP POLICY "Authenticated users can join lists" ON public.list_members;
CREATE POLICY "Users can add themselves to lists"
  ON public.list_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- FIX: list_members DELETE policy (Issue #9)
-- Old: any member can remove any other member
-- New: members can only remove themselves
-- ============================================
DROP POLICY "Members can remove members" ON public.list_members;
CREATE POLICY "Members can remove themselves"
  ON public.list_members FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FIX: Missing create_list_with_member RPC (Issue #5)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_list_with_member(list_name text)
RETURNS uuid AS $$
DECLARE
  new_list_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.shopping_lists (name)
    VALUES (list_name)
    RETURNING id INTO new_list_id;

  INSERT INTO public.list_members (list_id, user_id)
    VALUES (new_list_id, auth.uid());

  RETURN new_list_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FIX: Race condition in list item positioning (Issue #7)
-- ============================================
CREATE OR REPLACE FUNCTION public.add_items_to_list(
  p_list_id uuid,
  p_items jsonb
)
RETURNS void AS $$
DECLARE
  v_start_pos integer;
  v_item jsonb;
  v_idx integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this list';
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1
    INTO v_start_pos
    FROM public.list_items
    WHERE list_id = p_list_id
    FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.list_items (list_id, name, description, recipe_id, position)
    VALUES (
      p_list_id,
      v_item->>'name',
      NULLIF(v_item->>'description', ''),
      NULLIF(v_item->>'recipe_id', '')::uuid,
      v_start_pos + v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FIX: delete_empty_lists missing search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_empty_lists()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_members WHERE list_id = OLD.list_id
  ) THEN
    DELETE FROM public.shopping_lists WHERE id = OLD.list_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
