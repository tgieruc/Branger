-- Add input validation to RPC functions

-- Validate list name: not empty, max 100 chars
CREATE OR REPLACE FUNCTION public.create_list_with_member(list_name text)
RETURNS uuid AS $$
DECLARE
  new_list_id uuid;
  trimmed_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  trimmed_name := btrim(list_name);

  IF trimmed_name = '' OR trimmed_name IS NULL THEN
    RAISE EXCEPTION 'List name cannot be empty';
  END IF;

  IF length(trimmed_name) > 100 THEN
    RAISE EXCEPTION 'List name must be 100 characters or less';
  END IF;

  INSERT INTO public.shopping_lists (name)
    VALUES (trimmed_name)
    RETURNING id INTO new_list_id;

  INSERT INTO public.list_members (list_id, user_id)
    VALUES (new_list_id, auth.uid());

  RETURN new_list_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Validate JSONB items input: must be array, items must have name
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

  SELECT COALESCE(MAX(position), -1) + 1
    INTO v_start_pos
    FROM public.list_items
    WHERE list_id = p_list_id
    FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_name := btrim(v_item->>'name');
    IF v_name IS NULL OR v_name = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO public.list_items (list_id, name, description, recipe_id, position)
    VALUES (
      p_list_id,
      v_name,
      NULLIF(btrim(v_item->>'description'), ''),
      NULLIF(v_item->>'recipe_id', '')::uuid,
      v_start_pos + v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
