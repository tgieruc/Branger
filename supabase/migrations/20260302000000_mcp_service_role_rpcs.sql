-- MCP server wrapper RPCs that accept explicit user_id
-- instead of using auth.uid(), allowing service_role calls

-- ============================================
-- 1. mcp_create_list_with_member
-- Same as create_list_with_member but with explicit user_id
-- ============================================
CREATE OR REPLACE FUNCTION public.mcp_create_list_with_member(
  p_user_id uuid,
  p_list_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF btrim(p_list_name) = '' OR p_list_name IS NULL THEN
    RAISE EXCEPTION 'List name is required';
  END IF;

  IF length(btrim(p_list_name)) > 100 THEN
    RAISE EXCEPTION 'List name must be 100 characters or less';
  END IF;

  INSERT INTO public.shopping_lists (name)
  VALUES (btrim(p_list_name))
  RETURNING id INTO v_list_id;

  INSERT INTO public.list_members (list_id, user_id)
  VALUES (v_list_id, p_user_id);

  RETURN v_list_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mcp_create_list_with_member TO service_role;

-- ============================================
-- 2. mcp_add_items_to_list
-- Same as add_items_to_list but with explicit user_id
-- ============================================
CREATE OR REPLACE FUNCTION public.mcp_add_items_to_list(
  p_user_id uuid,
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id AND user_id = p_user_id
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

    v_recipe_id := NULL;
    IF (v_item->>'recipe_id') IS NOT NULL AND (v_item->>'recipe_id') != '' THEN
      v_recipe_id := (v_item->>'recipe_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.recipes
        WHERE id = v_recipe_id AND user_id = p_user_id
      ) THEN
        v_recipe_id := NULL;
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

GRANT EXECUTE ON FUNCTION public.mcp_add_items_to_list TO service_role;
