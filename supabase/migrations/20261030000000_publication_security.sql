BEGIN;

-- A new signature does not replace the old overload.
DROP FUNCTION IF EXISTS public.join_list(uuid);
REVOKE ALL ON FUNCTION public.join_list(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_list(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.mcp_create_list_with_member(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_add_items_to_list(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_api_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_token_last_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_create_list_with_member(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_add_items_to_list(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_api_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_token_last_used(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_api_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_token(text) TO authenticated;

-- Fixed quota shared by app and MCP requests. Clients cannot reset the window.
DROP FUNCTION IF EXISTS public.check_ai_rate_limit(integer, integer);
CREATE FUNCTION public.consume_ai_quota(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.ai_rate_limits AS limits (user_id, request_count, window_start)
  VALUES (p_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    request_count = CASE WHEN limits.window_start < now() - interval '60 minutes'
      THEN 1 ELSE LEAST(limits.request_count + 1, 31) END,
    window_start = CASE WHEN limits.window_start < now() - interval '60 minutes'
      THEN now() ELSE limits.window_start END
  RETURNING request_count INTO v_count;
  RETURN v_count <= 30;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid) TO service_role;
CREATE FUNCTION public.check_ai_rate_limit()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.consume_ai_quota(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.check_ai_rate_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit() TO authenticated;

-- OCR inputs are temporary private documents, separate from published recipe photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recipe-imports', 'recipe-imports', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']);
CREATE POLICY "Users upload own OCR inputs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'recipe-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own OCR inputs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recipe-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own OCR inputs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'recipe-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
COMMIT;
