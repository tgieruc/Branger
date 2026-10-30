-- Security fixes from full codebase review
-- Fixes: invite_token for lists, WITH CHECK on UPDATE policies,
-- recipe_id validation, and AI rate limiting

-- ============================================
-- 1. Add invite_token to shopping_lists
-- ============================================
ALTER TABLE public.shopping_lists
  ADD COLUMN invite_token text UNIQUE DEFAULT gen_random_uuid()::text;

-- Backfill existing lists
UPDATE public.shopping_lists
  SET invite_token = gen_random_uuid()::text
  WHERE invite_token IS NULL;

ALTER TABLE public.shopping_lists
  ALTER COLUMN invite_token SET NOT NULL;

CREATE INDEX shopping_lists_invite_token_idx
  ON public.shopping_lists(invite_token);

-- ============================================
-- 2. Update join_list to require invite_token
-- ============================================
CREATE OR REPLACE FUNCTION public.join_list(p_list_id uuid, p_invite_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_invite_token IS NULL OR btrim(p_invite_token) = '' THEN
    RAISE EXCEPTION 'Invite token is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shopping_lists
    WHERE id = p_list_id AND invite_token = p_invite_token
  ) THEN
    RAISE EXCEPTION 'List not found';
  END IF;

  INSERT INTO public.list_members (list_id, user_id)
  VALUES (p_list_id, auth.uid())
  ON CONFLICT (list_id, user_id) DO NOTHING;
END;
$$;

-- ============================================
-- 3. Add WITH CHECK to shopping_lists UPDATE policy
-- ============================================
DROP POLICY "Members can update their lists" ON public.shopping_lists;
CREATE POLICY "Members can update their lists"
  ON public.shopping_lists FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.list_members
      WHERE list_members.list_id = shopping_lists.id
        AND list_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.list_members
      WHERE list_members.list_id = shopping_lists.id
        AND list_members.user_id = auth.uid()
    )
  );

-- ============================================
-- 4. Add WITH CHECK to list_items UPDATE policy
-- ============================================
DROP POLICY "Members can update list items" ON public.list_items;
CREATE POLICY "Members can update list items"
  ON public.list_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.list_members
      WHERE list_members.list_id = list_items.list_id
        AND list_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.list_members
      WHERE list_members.list_id = list_items.list_id
        AND list_members.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. Validate recipe_id ownership in add_items_to_list
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
  v_name text;
  v_recipe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this list';
  END IF;

  IF jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Cannot add more than 200 items at once';
  END IF;

  -- Lock existing rows to prevent concurrent position conflicts
  PERFORM 1 FROM public.list_items WHERE list_id = p_list_id FOR UPDATE;

  SELECT COALESCE(MAX(position), -1) + 1
    INTO v_start_pos
    FROM public.list_items
    WHERE list_id = p_list_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_name := btrim(v_item->>'name');
    IF v_name IS NULL OR v_name = '' THEN
      CONTINUE;
    END IF;

    -- Validate recipe_id ownership if provided
    v_recipe_id := NULL;
    IF (v_item->>'recipe_id') IS NOT NULL AND (v_item->>'recipe_id') != '' THEN
      v_recipe_id := (v_item->>'recipe_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.recipes
        WHERE id = v_recipe_id AND user_id = auth.uid()
      ) THEN
        v_recipe_id := NULL; -- Silently drop invalid recipe_id
      END IF;
    END IF;

    INSERT INTO public.list_items (list_id, name, description, recipe_id, position)
    VALUES (
      p_list_id,
      v_name,
      NULLIF(btrim(v_item->>'description'), ''),
      v_recipe_id,
      v_start_pos + v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 6. AI rate limiting
-- ============================================
CREATE TABLE public.ai_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  request_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  max_requests integer DEFAULT 30,
  window_minutes integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Upsert: reset window if expired, otherwise increment
  INSERT INTO public.ai_rate_limits (user_id, request_count, window_start)
  VALUES (v_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    request_count = CASE
      WHEN ai_rate_limits.window_start < now() - (window_minutes || ' minutes')::interval
      THEN 1
      ELSE ai_rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN ai_rate_limits.window_start < now() - (window_minutes || ' minutes')::interval
      THEN now()
      ELSE ai_rate_limits.window_start
    END
  RETURNING request_count INTO v_current_count;

  RETURN v_current_count <= max_requests;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit TO authenticated;
