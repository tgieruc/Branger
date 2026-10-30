-- Run as database owner against a migrated development database. Always rolls back.
BEGIN;
DO $$
DECLARE f text; role_name text;
BEGIN
  IF to_regprocedure('public.join_list(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Invite-free join overload still exists';
  END IF;
  IF to_regprocedure('public.check_ai_rate_limit(integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Caller-controlled quota overload still exists';
  END IF;
  FOREACH f IN ARRAY ARRAY[
    'public.mcp_create_list_with_member(uuid,text)',
    'public.mcp_add_items_to_list(uuid,uuid,jsonb)',
    'public.validate_api_token(text)',
    'public.update_token_last_used(uuid)',
    'public.consume_ai_quota(uuid)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(role_name, f, 'EXECUTE') THEN
        RAISE EXCEPTION '% can execute %', role_name, f;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute %', f;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.check_ai_rate_limit()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous quota access';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.check_ai_rate_limit()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated quota access missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recipe-imports' AND public = false) THEN
    RAISE EXCEPTION 'OCR bucket is not private';
  END IF;
END;
$$;

-- Exercise the fixed quota independently for two disposable users.
DO $$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); i integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (a), (b);
  FOR i IN 1..30 LOOP
    IF public.consume_ai_quota(a) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Quota rejected request % prematurely', i;
    END IF;
  END LOOP;
  IF public.consume_ai_quota(a) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Quota bypass'; END IF;
  IF public.consume_ai_quota(b) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quota not user-scoped'; END IF;
  UPDATE public.ai_rate_limits SET window_start = now() - interval '61 minutes' WHERE user_id = a;
  IF public.consume_ai_quota(a) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quota failed to reset'; END IF;
  IF public.consume_ai_quota(NULL) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Missing user accepted'; END IF;
END;
$$;
ROLLBACK;
