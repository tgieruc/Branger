-- RPC function to join a shopping list via deep link
-- Uses SECURITY DEFINER to bypass list_members INSERT RLS
CREATE OR REPLACE FUNCTION public.join_list(p_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shopping_lists WHERE id = p_list_id) THEN
    RAISE EXCEPTION 'List not found';
  END IF;

  INSERT INTO public.list_members (list_id, user_id)
  VALUES (p_list_id, auth.uid())
  ON CONFLICT (list_id, user_id) DO NOTHING;
END;
$$;
