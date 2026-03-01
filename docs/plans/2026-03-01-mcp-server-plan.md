# Branger MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server as a Supabase Edge Function that exposes Branger's recipe and shopping list functionality to any AI agent via Streamable HTTP, authenticated with user-generated API tokens.

**Architecture:** Single Edge Function (`mcp-server`) receives JSON-RPC 2.0 POST requests. API tokens are validated against an `api_tokens` table (service role), then a user-scoped HS256 JWT is minted so all operations go through existing RLS policies. 14 tools: 7 recipe, 5 list, 2 AI import.

**Tech Stack:** Deno (Edge Function), jose (JWT signing), @supabase/supabase-js, PostgreSQL (migration), React Native/Expo (token UI)

**Design doc:** `docs/plans/2026-03-01-mcp-server-design.md`

---

## Task 1: Database Migration — `api_tokens` table

**Files:**
- Create: `supabase/migrations/20260301100000_api_tokens.sql`

**Step 1: Write the migration**

```sql
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
  END IF;

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
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

**Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local > src/lib/database.types.ts`

**Step 4: Commit**

```bash
git add supabase/migrations/20260301100000_api_tokens.sql src/lib/database.types.ts
git commit -m "feat: add api_tokens table and RPC functions for MCP auth"
```

---

## Task 2: MCP Server Edge Function — Core

**Files:**
- Create: `supabase/functions/mcp-server/index.ts`

This is the main edge function implementing the MCP Streamable HTTP protocol.

**Step 1: Create the edge function file**

The edge function handles:
1. CORS preflight
2. Token validation (hash + lookup via service role)
3. JWT minting for user impersonation (HS256 with SUPABASE_JWT_SECRET)
4. JSON-RPC 2.0 routing (`initialize`, `tools/list`, `tools/call`)
5. Tool dispatch to handlers

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT } from "jsr:@panva/jose@6";

// --- Environment ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;

// Service role client for token validation
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Auth helpers ---

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateToken(
  bearerToken: string
): Promise<{ userId: string; tokenId: string } | null> {
  const tokenHash = await hashToken(bearerToken);
  const { data, error } = await supabaseAdmin.rpc("validate_api_token", {
    p_token_hash: tokenHash,
  });
  if (error || !data || data.length === 0) return null;
  return { userId: data[0].user_id, tokenId: data[0].token_id };
}

async function mintUserJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({
    sub: userId,
    role: "authenticated",
    iss: "supabase",
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

function createUserClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// --- JSON-RPC helpers ---

function jsonRpcResponse(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(content: unknown, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      },
    ],
    isError,
  };
}

// --- Tool Definitions ---

const TOOLS = [
  // Recipe tools
  {
    name: "search_recipes",
    description:
      "Search the user's recipes by title or ingredient name. Returns a list of matching recipes with IDs, titles, and source info.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (optional, omit to list all)" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
    },
  },
  {
    name: "get_recipe",
    description:
      "Get a recipe's full details including title, ingredients (with quantities), steps, photo URL, and source.",
    inputSchema: {
      type: "object",
      properties: {
        recipe_id: { type: "string", description: "UUID of the recipe" },
      },
      required: ["recipe_id"],
    },
  },
  {
    name: "create_recipe",
    description: "Create a new recipe with title, ingredients, and steps.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Recipe title" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Ingredient name (e.g. 'butter')" },
              description: {
                type: "string",
                description: "Quantity/qualifier (e.g. '2 tablespoons')",
              },
            },
            required: ["name"],
          },
          description: "List of ingredients",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of instruction steps",
        },
      },
      required: ["title", "ingredients", "steps"],
    },
  },
  {
    name: "update_recipe",
    description:
      "Update a recipe. Only provide fields you want to change. Ingredients and steps are replaced entirely if provided.",
    inputSchema: {
      type: "object",
      properties: {
        recipe_id: { type: "string", description: "UUID of the recipe" },
        title: { type: "string", description: "New title" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["name"],
          },
        },
        steps: { type: "array", items: { type: "string" } },
      },
      required: ["recipe_id"],
    },
  },
  {
    name: "delete_recipe",
    description: "Permanently delete a recipe and all its ingredients/steps.",
    inputSchema: {
      type: "object",
      properties: {
        recipe_id: { type: "string", description: "UUID of the recipe" },
      },
      required: ["recipe_id"],
    },
  },
  {
    name: "import_recipe_from_url",
    description:
      "Use AI to parse a recipe from a URL. Returns the parsed recipe data (title, ingredients, steps). Call create_recipe to save it.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the recipe page" },
      },
      required: ["url"],
    },
  },
  {
    name: "import_recipe_from_text",
    description:
      "Use AI to parse a recipe from raw text. Returns parsed recipe data. Call create_recipe to save it.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Raw text containing a recipe (max 15,000 chars)",
        },
      },
      required: ["text"],
    },
  },
  // Shopping list tools
  {
    name: "list_shopping_lists",
    description: "List all shopping lists the user is a member of, with item counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_shopping_list",
    description: "Get a shopping list with all its items (name, description, checked status).",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "UUID of the shopping list" },
      },
      required: ["list_id"],
    },
  },
  {
    name: "create_shopping_list",
    description: "Create a new shopping list.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the list" },
      },
      required: ["name"],
    },
  },
  {
    name: "add_items_to_list",
    description:
      "Add items to a shopping list. Each item has a name and optional description (quantity).",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "UUID of the shopping list" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name" },
              description: { type: "string", description: "Quantity or notes" },
            },
            required: ["name"],
          },
        },
      },
      required: ["list_id", "items"],
    },
  },
  {
    name: "add_recipe_ingredients_to_list",
    description: "Add all ingredients from a recipe to a shopping list.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "UUID of the shopping list" },
        recipe_id: { type: "string", description: "UUID of the recipe" },
      },
      required: ["list_id", "recipe_id"],
    },
  },
  {
    name: "check_items",
    description: "Check or uncheck items in a shopping list.",
    inputSchema: {
      type: "object",
      properties: {
        item_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs of items to update",
        },
        checked: { type: "boolean", description: "true to check, false to uncheck" },
      },
      required: ["item_ids", "checked"],
    },
  },
  {
    name: "remove_items",
    description: "Remove items from a shopping list.",
    inputSchema: {
      type: "object",
      properties: {
        item_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs of items to remove",
        },
      },
      required: ["item_ids"],
    },
  },
];

// --- Tool Handlers ---

type SupabaseClient = ReturnType<typeof createClient>;

async function handleSearchRecipes(
  supabase: SupabaseClient,
  args: { query?: string; limit?: number }
) {
  const limit = Math.min(args.limit ?? 20, 50);
  if (args.query) {
    const { data, error } = await supabase.rpc("search_recipes", {
      p_query: args.query,
      p_limit: limit,
    });
    if (error) return toolResult(`Error: ${error.message}`, true);
    return toolResult(data);
  }
  const { data, error } = await supabase
    .from("recipes")
    .select("id, title, source_type, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult(data);
}

async function handleGetRecipe(supabase: SupabaseClient, args: { recipe_id: string }) {
  const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", args.recipe_id).single(),
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", args.recipe_id)
      .order("position"),
    supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", args.recipe_id)
      .order("step_number"),
  ]);
  if (recipeRes.error) return toolResult(`Error: ${recipeRes.error.message}`, true);
  return toolResult({
    ...recipeRes.data,
    ingredients: ingredientsRes.data ?? [],
    steps: stepsRes.data ?? [],
  });
}

async function handleCreateRecipe(
  supabase: SupabaseClient,
  userId: string,
  args: {
    title: string;
    ingredients: { name: string; description?: string }[];
    steps: string[];
  }
) {
  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({ title: args.title, user_id: userId, source_type: "manual" })
    .select()
    .single();
  if (error) return toolResult(`Error creating recipe: ${error.message}`, true);

  if (args.ingredients.length > 0) {
    await supabase.from("recipe_ingredients").insert(
      args.ingredients.map((ing, i) => ({
        recipe_id: recipe.id,
        name: ing.name,
        description: ing.description ?? "",
        position: i,
      }))
    );
  }

  if (args.steps.length > 0) {
    await supabase.from("recipe_steps").insert(
      args.steps.map((instruction, i) => ({
        recipe_id: recipe.id,
        step_number: i + 1,
        instruction,
      }))
    );
  }

  return toolResult({ message: "Recipe created", recipe_id: recipe.id, title: recipe.title });
}

async function handleUpdateRecipe(
  supabase: SupabaseClient,
  args: {
    recipe_id: string;
    title?: string;
    ingredients?: { name: string; description?: string }[];
    steps?: string[];
  }
) {
  if (args.title) {
    const { error } = await supabase
      .from("recipes")
      .update({ title: args.title })
      .eq("id", args.recipe_id);
    if (error) return toolResult(`Error updating title: ${error.message}`, true);
  }

  if (args.ingredients) {
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", args.recipe_id);
    if (args.ingredients.length > 0) {
      await supabase.from("recipe_ingredients").insert(
        args.ingredients.map((ing, i) => ({
          recipe_id: args.recipe_id,
          name: ing.name,
          description: ing.description ?? "",
          position: i,
        }))
      );
    }
  }

  if (args.steps) {
    await supabase.from("recipe_steps").delete().eq("recipe_id", args.recipe_id);
    if (args.steps.length > 0) {
      await supabase.from("recipe_steps").insert(
        args.steps.map((instruction, i) => ({
          recipe_id: args.recipe_id,
          step_number: i + 1,
          instruction,
        }))
      );
    }
  }

  return toolResult({ message: "Recipe updated", recipe_id: args.recipe_id });
}

async function handleDeleteRecipe(supabase: SupabaseClient, args: { recipe_id: string }) {
  const { error } = await supabase.from("recipes").delete().eq("id", args.recipe_id);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: "Recipe deleted" });
}

async function handleImportFromUrl(
  userJwt: string,
  args: { url: string }
) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userJwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ url: args.url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    return toolResult(`AI import failed: ${err.error}`, true);
  }
  const recipe = await res.json();
  return toolResult({
    message: "Recipe parsed successfully. Call create_recipe to save it.",
    ...recipe,
  });
}

async function handleImportFromText(
  userJwt: string,
  args: { text: string }
) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userJwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text: args.text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    return toolResult(`AI import failed: ${err.error}`, true);
  }
  const recipe = await res.json();
  return toolResult({
    message: "Recipe parsed successfully. Call create_recipe to save it.",
    ...recipe,
  });
}

async function handleListShoppingLists(supabase: SupabaseClient, userId: string) {
  // Get user's list memberships
  const { data: memberships, error: memErr } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("user_id", userId);
  if (memErr) return toolResult(`Error: ${memErr.message}`, true);
  if (!memberships || memberships.length === 0) return toolResult([]);

  const listIds = memberships.map((m) => m.list_id);
  const { data: lists, error: listErr } = await supabase
    .from("shopping_lists")
    .select("id, name, created_at, updated_at")
    .in("id", listIds)
    .order("updated_at", { ascending: false });
  if (listErr) return toolResult(`Error: ${listErr.message}`, true);

  // Get item counts per list
  const { data: items } = await supabase
    .from("list_items")
    .select("list_id, checked")
    .in("list_id", listIds);

  const counts: Record<string, { total: number; checked: number }> = {};
  for (const item of items ?? []) {
    if (!counts[item.list_id]) counts[item.list_id] = { total: 0, checked: 0 };
    counts[item.list_id].total++;
    if (item.checked) counts[item.list_id].checked++;
  }

  return toolResult(
    (lists ?? []).map((l) => ({
      ...l,
      item_count: counts[l.id]?.total ?? 0,
      checked_count: counts[l.id]?.checked ?? 0,
    }))
  );
}

async function handleGetShoppingList(supabase: SupabaseClient, args: { list_id: string }) {
  const [listRes, itemsRes] = await Promise.all([
    supabase.from("shopping_lists").select("*").eq("id", args.list_id).single(),
    supabase
      .from("list_items")
      .select("id, name, description, checked, recipe_id, position")
      .eq("list_id", args.list_id)
      .order("position"),
  ]);
  if (listRes.error) return toolResult(`Error: ${listRes.error.message}`, true);
  return toolResult({ ...listRes.data, items: itemsRes.data ?? [] });
}

async function handleCreateShoppingList(supabase: SupabaseClient, args: { name: string }) {
  const { data, error } = await supabase.rpc("create_list_with_member", {
    list_name: args.name,
  });
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: "Shopping list created", list_id: data });
}

async function handleAddItemsToList(
  supabase: SupabaseClient,
  args: { list_id: string; items: { name: string; description?: string }[] }
) {
  const { error } = await supabase.rpc("add_items_to_list", {
    p_list_id: args.list_id,
    p_items: args.items.map((i) => ({
      name: i.name,
      description: i.description ?? "",
    })),
  });
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: `Added ${args.items.length} items to list` });
}

async function handleAddRecipeIngredientsToList(
  supabase: SupabaseClient,
  args: { list_id: string; recipe_id: string }
) {
  // Fetch recipe ingredients
  const { data: ingredients, error: ingErr } = await supabase
    .from("recipe_ingredients")
    .select("name, description")
    .eq("recipe_id", args.recipe_id)
    .order("position");
  if (ingErr) return toolResult(`Error fetching ingredients: ${ingErr.message}`, true);
  if (!ingredients || ingredients.length === 0)
    return toolResult("No ingredients found in recipe", true);

  const { error } = await supabase.rpc("add_items_to_list", {
    p_list_id: args.list_id,
    p_items: ingredients.map((i) => ({
      name: i.name,
      description: i.description ?? "",
      recipe_id: args.recipe_id,
    })),
  });
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: `Added ${ingredients.length} ingredients to list` });
}

async function handleCheckItems(
  supabase: SupabaseClient,
  args: { item_ids: string[]; checked: boolean }
) {
  const { error } = await supabase
    .from("list_items")
    .update({ checked: args.checked })
    .in("id", args.item_ids);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({
    message: `${args.checked ? "Checked" : "Unchecked"} ${args.item_ids.length} items`,
  });
}

async function handleRemoveItems(supabase: SupabaseClient, args: { item_ids: string[] }) {
  const { error } = await supabase.from("list_items").delete().in("id", args.item_ids);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: `Removed ${args.item_ids.length} items` });
}

// --- Tool Dispatcher ---

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  userJwt: string
) {
  switch (name) {
    case "search_recipes":
      return handleSearchRecipes(supabase, args as { query?: string; limit?: number });
    case "get_recipe":
      return handleGetRecipe(supabase, args as { recipe_id: string });
    case "create_recipe":
      return handleCreateRecipe(supabase, userId, args as {
        title: string;
        ingredients: { name: string; description?: string }[];
        steps: string[];
      });
    case "update_recipe":
      return handleUpdateRecipe(supabase, args as {
        recipe_id: string;
        title?: string;
        ingredients?: { name: string; description?: string }[];
        steps?: string[];
      });
    case "delete_recipe":
      return handleDeleteRecipe(supabase, args as { recipe_id: string });
    case "import_recipe_from_url":
      return handleImportFromUrl(userJwt, args as { url: string });
    case "import_recipe_from_text":
      return handleImportFromText(userJwt, args as { text: string });
    case "list_shopping_lists":
      return handleListShoppingLists(supabase, userId);
    case "get_shopping_list":
      return handleGetShoppingList(supabase, args as { list_id: string });
    case "create_shopping_list":
      return handleCreateShoppingList(supabase, args as { name: string });
    case "add_items_to_list":
      return handleAddItemsToList(supabase, args as {
        list_id: string;
        items: { name: string; description?: string }[];
      });
    case "add_recipe_ingredients_to_list":
      return handleAddRecipeIngredientsToList(supabase, args as {
        list_id: string;
        recipe_id: string;
      });
    case "check_items":
      return handleCheckItems(supabase, args as { item_ids: string[]; checked: boolean });
    case "remove_items":
      return handleRemoveItems(supabase, args as { item_ids: string[] });
    default:
      return toolResult(`Unknown tool: ${name}`, true);
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // --- Auth: validate API token ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer brg_")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid API token. Expected: Bearer brg_..." }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const bearerToken = authHeader.replace("Bearer ", "");

    const tokenResult = await validateToken(bearerToken);
    if (!tokenResult) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired API token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update last_used_at (fire-and-forget)
    supabaseAdmin.rpc("update_token_last_used", { p_token_id: tokenResult.tokenId });

    // Mint user JWT and create scoped client
    const userJwt = await mintUserJwt(tokenResult.userId);
    const supabase = createUserClient(userJwt);

    // --- Parse JSON-RPC request ---
    const body = await req.json();
    const { id, method, params } = body;

    let result;

    switch (method) {
      case "initialize":
        result = jsonRpcResponse(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: {
            name: "branger-mcp",
            version: "1.0.0",
          },
        });
        break;

      case "notifications/initialized":
        // Notification — no response needed, but return empty for HTTP
        return new Response("", { status: 204, headers: corsHeaders });

      case "tools/list":
        result = jsonRpcResponse(id, { tools: TOOLS });
        break;

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        const toolResponse = await dispatchTool(
          toolName,
          toolArgs,
          supabase,
          tokenResult.userId,
          userJwt
        );
        result = jsonRpcResponse(id, toolResponse);
        break;
      }

      default:
        result = jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("MCP server error:", error);
    return new Response(
      JSON.stringify(jsonRpcError(null, -32603, "Internal server error")),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
```

**Step 2: Set the JWT secret**

Get the JWT secret from Supabase Dashboard > Settings > API > JWT Settings > JWT Secret.

Run: `npx supabase secrets set SUPABASE_JWT_SECRET=<your-jwt-secret>`

**Step 3: Deploy the edge function**

Run: `npx supabase functions deploy mcp-server --no-verify-jwt`

Note: `--no-verify-jwt` is required because this function validates API tokens, not Supabase JWTs.

**Step 4: Test with curl**

```bash
# First, create a token via the Supabase SQL editor or RPC:
# SELECT * FROM create_api_token('Test Token');
# Copy the token value

# Test initialize
curl -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Authorization: Bearer brg_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Test tools/list
curl -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Authorization: Bearer brg_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Test search_recipes
curl -X POST https://<project-ref>.supabase.co/functions/v1/mcp-server \
  -H "Authorization: Bearer brg_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_recipes","arguments":{}}}'
```

**Step 5: Commit**

```bash
git add supabase/functions/mcp-server/index.ts
git commit -m "feat: add MCP server edge function with 14 tools"
```

---

## Task 3: App — Token Management UI

**Files:**
- Create: `src/app/(tabs)/settings/api-tokens.tsx`
- Modify: `src/app/(tabs)/settings/index.tsx` (add navigation row)

**Step 1: Add API Tokens row to settings screen**

In `src/app/(tabs)/settings/index.tsx`, add a new section between ACCOUNT and APPEARANCE:

```tsx
{/* API Tokens Section */}
<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>INTEGRATIONS</Text>
<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
  <TouchableOpacity
    style={styles.row}
    onPress={() => router.push('/(tabs)/settings/api-tokens')}
    accessibilityLabel="Manage API tokens"
    accessibilityRole="button"
  >
    <Ionicons name="key-outline" size={20} color={colors.primary} style={styles.rowIcon} />
    <View style={{ flex: 1 }}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>API Tokens</Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Connect AI agents to your account</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.chevron} style={{ marginLeft: 'auto' }} />
  </TouchableOpacity>
</View>
```

**Step 2: Create the API Tokens screen**

`src/app/(tabs)/settings/api-tokens.tsx`:

```tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import ConfirmDialog from '@/components/ConfirmDialog';

type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

const MCP_ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mcp-server`;

export default function ApiTokensScreen() {
  const colors = useColors();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'endpoint' | null>(null);

  const fetchTokens = useCallback(async () => {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('id, name, token_prefix, last_used_at, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setTokens(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTokens();
    }, [fetchTokens])
  );

  const handleCreate = async () => {
    const name = newTokenName.trim() || 'API Token';
    const { data, error } = await supabase.rpc('create_api_token', { p_name: name });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNewTokenValue(data[0].token);
    setNewTokenName('');
    fetchTokens();
  };

  const handleDelete = async () => {
    if (!deleteTokenId) return;
    const { error } = await supabase.from('api_tokens').delete().eq('id', deleteTokenId);
    if (error) {
      Alert.alert('Error', error.message);
    }
    setDeleteTokenId(null);
    fetchTokens();
  };

  const copyToClipboard = async (text: string, type: 'token' | 'endpoint') => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(text);
    } else {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(text);
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'API Tokens' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* MCP Endpoint */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>MCP ENDPOINT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => copyToClipboard(MCP_ENDPOINT, 'endpoint')}
            accessibilityLabel="Copy MCP endpoint URL"
            accessibilityRole="button"
          >
            <Text style={[styles.endpointText, { color: colors.textSecondary }]} numberOfLines={1}>
              {MCP_ENDPOINT}
            </Text>
            <Ionicons
              name={copied === 'endpoint' ? 'checkmark' : 'copy-outline'}
              size={18}
              color={copied === 'endpoint' ? colors.success : colors.primary}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Use this URL to connect AI agents (Claude, etc.) to your Branger account via MCP.
        </Text>

        {/* Tokens List */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>TOKENS</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          {loading ? (
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary }}>Loading...</Text>
            </View>
          ) : tokens.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary }}>No tokens yet</Text>
            </View>
          ) : (
            tokens.map((token, index) => (
              <View key={token.id}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
                )}
                <View style={styles.tokenRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tokenName, { color: colors.text }]}>{token.name}</Text>
                    <Text style={[styles.tokenMeta, { color: colors.textSecondary }]}>
                      {token.token_prefix}... · Created {formatDate(token.created_at)}
                      {token.last_used_at ? ` · Last used ${formatDate(token.last_used_at)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDeleteTokenId(token.id)}
                    accessibilityLabel={`Revoke token ${token.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: colors.primary }]}
          onPress={() => setCreateModalVisible(true)}
          accessibilityLabel="Generate new API token"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.generateButtonText}>Generate Token</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Create Token Modal */}
      <Modal visible={createModalVisible && !newTokenValue} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Generate API Token</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}
              placeholder="Token name (optional)"
              placeholderTextColor={colors.textSecondary}
              value={newTokenName}
              onChangeText={setNewTokenName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.borderLight }]}
                onPress={() => { setCreateModalVisible(false); setNewTokenName(''); }}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreate}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Show Token Modal (shown once after creation) */}
      <Modal visible={!!newTokenValue} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Token Created</Text>
            <Text style={[styles.warningText, { color: colors.danger }]}>
              Copy this token now. It won't be shown again.
            </Text>
            <TouchableOpacity
              style={[styles.tokenDisplay, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}
              onPress={() => newTokenValue && copyToClipboard(newTokenValue, 'token')}
              accessibilityLabel="Copy token"
              accessibilityRole="button"
            >
              <Text style={[styles.tokenText, { color: colors.text }]} selectable>
                {newTokenValue}
              </Text>
              <Ionicons
                name={copied === 'token' ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copied === 'token' ? colors.success : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}
              onPress={() => { setNewTokenValue(null); setCreateModalVisible(false); }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        visible={!!deleteTokenId}
        title="Revoke Token"
        message="Any agent using this token will lose access. This cannot be undone."
        confirmLabel="Revoke"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTokenId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  hint: { fontSize: 13, marginBottom: 24, marginLeft: 16, marginRight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  endpointText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tokenName: { fontSize: 16, fontWeight: '500' },
  tokenMeta: { fontSize: 13, marginTop: 2 },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  warningText: { fontSize: 14, marginBottom: 12 },
  tokenDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  tokenText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
});
```

**Step 3: Commit**

```bash
git add src/app/\(tabs\)/settings/index.tsx src/app/\(tabs\)/settings/api-tokens.tsx
git commit -m "feat: add API token management UI in settings"
```

---

## Task 4: Deploy & End-to-End Test

**Step 1: Apply migration**

Run: `npx supabase db push`

**Step 2: Set JWT secret**

Get JWT secret from Supabase Dashboard > Settings > API > JWT Settings.

Run: `npx supabase secrets set SUPABASE_JWT_SECRET=<your-jwt-secret>`

**Step 3: Deploy edge function**

Run: `npx supabase functions deploy mcp-server --no-verify-jwt`

**Step 4: Generate a token**

In the Supabase SQL Editor:
```sql
-- Temporarily authenticate as a user to create a token
SELECT * FROM create_api_token('Test Token');
```

Or test via the app UI.

**Step 5: Test MCP with Claude Desktop**

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "branger": {
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp-server",
      "headers": {
        "Authorization": "Bearer brg_<your-token>"
      }
    }
  }
}
```

Restart Claude Desktop and verify the Branger tools appear.

**Step 6: Commit and finalize**

```bash
git add -A
git commit -m "feat: Branger MCP server — complete implementation"
```
