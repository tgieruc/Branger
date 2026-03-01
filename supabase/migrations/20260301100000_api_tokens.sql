-- API tokens for MCP server authentication
-- Tokens are hashed with SHA-256 (via pgcrypto), plaintext never stored

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. api_tokens table
-- ============================================
CREATE TABLE public.api_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'API Token',
  token_hash  text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

CREATE INDEX api_tokens_user_id_idx ON public.api_tokens(user_id);
CREATE INDEX api_tokens_token_hash_idx ON public.api_tokens(token_hash);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can see their own tokens
CREATE POLICY "Users can view own tokens"
  ON public.api_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Users can create their own tokens
CREATE POLICY "Users can create own tokens"
  ON public.api_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete (revoke) their own tokens
CREATE POLICY "Users can delete own tokens"
  ON public.api_tokens FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 2. RPC: create_api_token
-- Generates token server-side, stores hash, returns plaintext once
-- ============================================
CREATE OR REPLACE FUNCTION public.create_api_token(p_name text DEFAULT 'API Token')
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF btrim(p_name) = '' OR p_name IS NULL THEN
    p_name := 'API Token';
  ELSIF length(btrim(p_name)) > 255 THEN
    RAISE EXCEPTION 'Token name must be 255 characters or less';
  END IF;

  p_name := btrim(p_name);

  -- Generate token: brg_ prefix + 64 hex chars (32 random bytes)
  v_token := 'brg_' || encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.api_tokens (user_id, name, token_hash, token_prefix)
  VALUES (v_user_id, btrim(p_name), v_hash, left(v_token, 12))
  RETURNING api_tokens.id INTO v_id;

  id := v_id;
  token := v_token;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_api_token TO authenticated;

-- ============================================
-- 3. RPC: validate_api_token
-- Called by MCP edge function (service role) to validate token
-- Returns user_id if valid, null if not
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_api_token(p_token_hash text)
RETURNS TABLE(user_id uuid, token_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.user_id, t.id
  FROM public.api_tokens t
  WHERE t.token_hash = p_token_hash
    AND (t.expires_at IS NULL OR t.expires_at > now());
END;
$$;

-- Grant to service_role (used by edge function)
GRANT EXECUTE ON FUNCTION public.validate_api_token TO service_role;

-- ============================================
-- 4. RPC: update_token_last_used
-- ============================================
CREATE OR REPLACE FUNCTION public.update_token_last_used(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_tokens SET last_used_at = now() WHERE id = p_token_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_token_last_used TO service_role;
