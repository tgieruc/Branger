-- Paginated recipe search by title and ingredient names
-- Returns recipes where title or any ingredient name matches the query
-- Uses cursor-based pagination with (created_at, id) for stable ordering
CREATE OR REPLACE FUNCTION public.search_recipes(
  p_query text DEFAULT '',
  p_limit int DEFAULT 20,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  photo_url text,
  source_type text,
  source_url text,
  share_token text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
DECLARE
  v_query text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := btrim(p_query);

  -- Clamp limit
  IF p_limit < 1 THEN p_limit := 1; END IF;
  IF p_limit > 100 THEN p_limit := 100; END IF;

  RETURN QUERY
  SELECT DISTINCT r.id, r.user_id, r.title, r.photo_url, r.source_type,
         r.source_url, r.share_token, r.created_at, r.updated_at
  FROM public.recipes r
  LEFT JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
  WHERE r.user_id = auth.uid()
    AND (
      v_query = ''
      OR r.title ILIKE '%' || v_query || '%'
      OR ri.name ILIKE '%' || v_query || '%'
    )
    AND (
      p_cursor_time IS NULL
      OR r.created_at < p_cursor_time
      OR (r.created_at = p_cursor_time AND r.id < p_cursor_id)
    )
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
