import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Environment ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service role client — bypasses RLS, all queries filter by user_id manually
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

// --- Access helpers ---

async function verifyListMembership(userId: string, listId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("list_members")
    .select("list_id")
    .eq("list_id", listId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function verifyItemsAccess(
  userId: string,
  itemIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const { data: items } = await supabaseAdmin
    .from("list_items")
    .select("list_id")
    .in("id", itemIds);
  if (!items || items.length === 0) return { ok: false, error: "Items not found" };

  const listIds = [...new Set(items.map((i) => i.list_id))];
  const { data: memberships } = await supabaseAdmin
    .from("list_members")
    .select("list_id")
    .eq("user_id", userId)
    .in("list_id", listIds);

  if (!memberships || memberships.length !== listIds.length) {
    return { ok: false, error: "Not a member of the list containing these items" };
  }
  return { ok: true };
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

async function handleSearchRecipes(
  userId: string,
  args: { query?: string; limit?: number }
) {
  const limit = Math.min(args.limit ?? 20, 50);
  let query = supabaseAdmin
    .from("recipes")
    .select("id, title, source_type, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (args.query) {
    query = query.ilike("title", `%${args.query}%`);
  }

  const { data, error } = await query;
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult(data);
}

async function handleGetRecipe(userId: string, args: { recipe_id: string }) {
  const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
    supabaseAdmin
      .from("recipes")
      .select("*")
      .eq("id", args.recipe_id)
      .eq("user_id", userId)
      .single(),
    supabaseAdmin
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", args.recipe_id)
      .order("position"),
    supabaseAdmin
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
  userId: string,
  args: {
    title: string;
    ingredients: { name: string; description?: string }[];
    steps: string[];
  }
) {
  const { data: recipe, error } = await supabaseAdmin
    .from("recipes")
    .insert({ title: args.title, user_id: userId, source_type: "manual" })
    .select()
    .single();
  if (error) return toolResult(`Error creating recipe: ${error.message}`, true);

  if (args.ingredients.length > 0) {
    await supabaseAdmin.from("recipe_ingredients").insert(
      args.ingredients.map((ing, i) => ({
        recipe_id: recipe.id,
        name: ing.name,
        description: ing.description ?? "",
        position: i,
      }))
    );
  }

  if (args.steps.length > 0) {
    await supabaseAdmin.from("recipe_steps").insert(
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
  userId: string,
  args: {
    recipe_id: string;
    title?: string;
    ingredients?: { name: string; description?: string }[];
    steps?: string[];
  }
) {
  // Verify ownership
  const { data: recipe } = await supabaseAdmin
    .from("recipes")
    .select("id")
    .eq("id", args.recipe_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!recipe) return toolResult("Recipe not found or not owned by you", true);

  if (args.title) {
    const { error } = await supabaseAdmin
      .from("recipes")
      .update({ title: args.title })
      .eq("id", args.recipe_id);
    if (error) return toolResult(`Error updating title: ${error.message}`, true);
  }

  if (args.ingredients) {
    await supabaseAdmin.from("recipe_ingredients").delete().eq("recipe_id", args.recipe_id);
    if (args.ingredients.length > 0) {
      await supabaseAdmin.from("recipe_ingredients").insert(
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
    await supabaseAdmin.from("recipe_steps").delete().eq("recipe_id", args.recipe_id);
    if (args.steps.length > 0) {
      await supabaseAdmin.from("recipe_steps").insert(
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

async function handleDeleteRecipe(userId: string, args: { recipe_id: string }) {
  const { error } = await supabaseAdmin
    .from("recipes")
    .delete()
    .eq("id", args.recipe_id)
    .eq("user_id", userId);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: "Recipe deleted" });
}

async function handleImportFromUrl(args: { url: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

async function handleImportFromText(args: { text: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

async function handleListShoppingLists(userId: string) {
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("list_members")
    .select("list_id")
    .eq("user_id", userId);
  if (memErr) return toolResult(`Error: ${memErr.message}`, true);
  if (!memberships || memberships.length === 0) return toolResult([]);

  const listIds = memberships.map((m) => m.list_id);
  const { data: lists, error: listErr } = await supabaseAdmin
    .from("shopping_lists")
    .select("id, name, created_at, updated_at")
    .in("id", listIds)
    .order("updated_at", { ascending: false });
  if (listErr) return toolResult(`Error: ${listErr.message}`, true);

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from("list_items")
    .select("list_id, checked")
    .in("list_id", listIds);
  if (itemsErr) return toolResult(`Error fetching item counts: ${itemsErr.message}`, true);

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

async function handleGetShoppingList(userId: string, args: { list_id: string }) {
  if (!(await verifyListMembership(userId, args.list_id))) {
    return toolResult("Not a member of this list", true);
  }

  const [listRes, itemsRes] = await Promise.all([
    supabaseAdmin.from("shopping_lists").select("*").eq("id", args.list_id).single(),
    supabaseAdmin
      .from("list_items")
      .select("id, name, description, checked, recipe_id, position")
      .eq("list_id", args.list_id)
      .order("position"),
  ]);
  if (listRes.error) return toolResult(`Error: ${listRes.error.message}`, true);
  return toolResult({ ...listRes.data, items: itemsRes.data ?? [] });
}

async function handleCreateShoppingList(userId: string, args: { name: string }) {
  const { data, error } = await supabaseAdmin.rpc("mcp_create_list_with_member", {
    p_user_id: userId,
    p_list_name: args.name,
  });
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: "Shopping list created", list_id: data });
}

async function handleAddItemsToList(
  userId: string,
  args: { list_id: string; items: { name: string; description?: string }[] }
) {
  if (args.items.length > 200) {
    return toolResult("Cannot add more than 200 items at once", true);
  }

  const { error } = await supabaseAdmin.rpc("mcp_add_items_to_list", {
    p_user_id: userId,
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
  userId: string,
  args: { list_id: string; recipe_id: string }
) {
  // Verify recipe ownership
  const { data: recipe } = await supabaseAdmin
    .from("recipes")
    .select("id")
    .eq("id", args.recipe_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!recipe) return toolResult("Recipe not found or not owned by you", true);

  const { data: ingredients, error: ingErr } = await supabaseAdmin
    .from("recipe_ingredients")
    .select("name, description")
    .eq("recipe_id", args.recipe_id)
    .order("position");
  if (ingErr) return toolResult(`Error fetching ingredients: ${ingErr.message}`, true);
  if (!ingredients || ingredients.length === 0)
    return toolResult("No ingredients found in recipe", true);

  const { error } = await supabaseAdmin.rpc("mcp_add_items_to_list", {
    p_user_id: userId,
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
  userId: string,
  args: { item_ids: string[]; checked: boolean }
) {
  const access = await verifyItemsAccess(userId, args.item_ids);
  if (!access.ok) return toolResult(access.error!, true);

  const { error } = await supabaseAdmin
    .from("list_items")
    .update({ checked: args.checked })
    .in("id", args.item_ids);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({
    message: `${args.checked ? "Checked" : "Unchecked"} ${args.item_ids.length} items`,
  });
}

async function handleRemoveItems(userId: string, args: { item_ids: string[] }) {
  const access = await verifyItemsAccess(userId, args.item_ids);
  if (!access.ok) return toolResult(access.error!, true);

  const { error } = await supabaseAdmin.from("list_items").delete().in("id", args.item_ids);
  if (error) return toolResult(`Error: ${error.message}`, true);
  return toolResult({ message: `Removed ${args.item_ids.length} items` });
}

// --- Tool Dispatcher ---

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  userId: string
) {
  switch (name) {
    case "search_recipes":
      return handleSearchRecipes(userId, args as { query?: string; limit?: number });
    case "get_recipe":
      return handleGetRecipe(userId, args as { recipe_id: string });
    case "create_recipe":
      return handleCreateRecipe(userId, args as {
        title: string;
        ingredients: { name: string; description?: string }[];
        steps: string[];
      });
    case "update_recipe":
      return handleUpdateRecipe(userId, args as {
        recipe_id: string;
        title?: string;
        ingredients?: { name: string; description?: string }[];
        steps?: string[];
      });
    case "delete_recipe":
      return handleDeleteRecipe(userId, args as { recipe_id: string });
    case "import_recipe_from_url":
      return handleImportFromUrl(args as { url: string });
    case "import_recipe_from_text":
      return handleImportFromText(args as { text: string });
    case "list_shopping_lists":
      return handleListShoppingLists(userId);
    case "get_shopping_list":
      return handleGetShoppingList(userId, args as { list_id: string });
    case "create_shopping_list":
      return handleCreateShoppingList(userId, args as { name: string });
    case "add_items_to_list":
      return handleAddItemsToList(userId, args as {
        list_id: string;
        items: { name: string; description?: string }[];
      });
    case "add_recipe_ingredients_to_list":
      return handleAddRecipeIngredientsToList(userId, args as {
        list_id: string;
        recipe_id: string;
      });
    case "check_items":
      return handleCheckItems(userId, args as { item_ids: string[]; checked: boolean });
    case "remove_items":
      return handleRemoveItems(userId, args as { item_ids: string[] });
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
    supabaseAdmin
      .rpc("update_token_last_used", { p_token_id: tokenResult.tokenId })
      .then(null, (err: unknown) => console.error("Failed to update token last_used_at:", err));

    // --- Parse JSON-RPC request ---
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32700, "Parse error: invalid JSON")),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
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
          tokenResult.userId
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
