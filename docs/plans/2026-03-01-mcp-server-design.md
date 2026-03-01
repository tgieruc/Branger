# Branger MCP Server Design

**Date:** 2026-03-01
**Status:** Approved

## Overview

An MCP (Model Context Protocol) server that exposes Branger's recipe and shopping list functionality to any AI agent. Deployed as a Supabase Edge Function using Streamable HTTP transport. Authenticated via user-generated API tokens from the app's settings screen.

## Architecture

```
AI Agent  ──POST (JSON-RPC)──▶  mcp-server (Edge Function)  ──▶  Supabase (PostgREST + RPCs)
          ◀──JSON response────                                     All RLS enforced
```

The MCP server is a stateless translation layer:
1. Receives MCP tool call via Streamable HTTP (POST with JSON-RPC 2.0)
2. Validates API token against `api_tokens` table
3. Mints a short-lived JWT for the token's owner
4. Creates a Supabase client authenticated as that user (all RLS policies enforced)
5. Executes the corresponding Supabase query/RPC
6. Returns result as JSON-RPC response

## API Token System

### Database Table

```sql
CREATE TABLE api_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz
);
```

### Token Lifecycle

1. User generates token in Settings > API Tokens
2. App creates random token: `brg_` + 43 chars base62 (256 bits entropy)
3. SHA-256 hash stored in `api_tokens`, plaintext shown once to user
4. On MCP request: hash incoming token, look up row, mint JWT for `user_id`
5. User can revoke tokens from settings (deletes row)

### RLS Policies

- Users can SELECT/INSERT/DELETE their own tokens only
- MCP edge function uses service role for token lookup (caller not yet authenticated)

## MCP Tools (14 total)

### Recipes (7 tools)

| Tool | Input | Description |
|------|-------|-------------|
| `search_recipes` | `query?, limit?` | Search user's recipes by title/ingredient |
| `get_recipe` | `recipe_id` | Get full recipe with ingredients and steps |
| `create_recipe` | `title, ingredients[], steps[]` | Create a recipe manually |
| `update_recipe` | `recipe_id, title?, ingredients?, steps?` | Update any part of a recipe |
| `delete_recipe` | `recipe_id` | Delete a recipe |
| `import_recipe_from_url` | `url` | AI-parse recipe from URL, return structured data |
| `import_recipe_from_text` | `text` | AI-parse recipe from text, return structured data |

### Shopping Lists (7 tools)

| Tool | Input | Description |
|------|-------|-------------|
| `list_shopping_lists` | (none) | List all shopping lists with item counts |
| `get_shopping_list` | `list_id` | Get list with all items |
| `create_shopping_list` | `name` | Create a new shopping list |
| `add_items_to_list` | `list_id, items[]` | Add items (name + optional description) |
| `add_recipe_ingredients_to_list` | `list_id, recipe_id` | Add recipe's ingredients to a list |
| `check_items` | `item_ids[], checked` | Check or uncheck items |
| `remove_items` | `item_ids[]` | Remove items from a list |

### Excluded Operations

- Photo upload (agents don't have camera access)
- List member management (user-level action)
- Share token generation (UI concern)
- Auth operations (irrelevant for API tokens)

## MCP Protocol

### Transport: Streamable HTTP

Single endpoint: `POST /functions/v1/mcp-server`

Supported JSON-RPC methods:
- `initialize` → server info + capabilities
- `tools/list` → 14 tool definitions with JSON schemas
- `tools/call` → execute tool, return result

### Auth Flow Per Request

1. Extract `Authorization: Bearer brg_...`
2. SHA-256 hash the token
3. Look up `api_tokens` by `token_hash` (service role)
4. If not found or expired → 401
5. Update `last_used_at`
6. Mint short-lived JWT for `token.user_id` using Supabase JWT secret
7. Create authenticated Supabase client
8. Execute tool, return result

### Error Handling

- Invalid/missing token → HTTP 401
- Tool not found → JSON-RPC `-32601`
- Invalid params → JSON-RPC `-32602`
- Supabase errors → tool result with `isError: true`

### Rate Limiting

- AI tools: existing `check_ai_rate_limit` RPC (30 requests/hour)
- Non-AI tools: no rate limit initially (Supabase handles connection limits)

## App Changes

### Settings Screen (`src/app/(tabs)/settings.tsx`)

Add "API Tokens" section:
1. Display MCP endpoint URL (copyable)
2. List active tokens: name, prefix (`brg_a1b2...`), created date, last used
3. "Generate Token" button → modal with name field, generates and shows token once
4. Swipe-to-delete on each token to revoke
