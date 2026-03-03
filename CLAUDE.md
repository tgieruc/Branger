# Branger

Recipe & collaborative shopping list app with AI-powered recipe import.

## Tech Stack

- **Frontend:** React Native 0.81.5, Expo SDK 54, Expo Router v6, TypeScript 5.9
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI:** Mistral Large (recipe parsing), Mistral OCR (photo text extraction)
- **MCP:** Streamable HTTP MCP server with OAuth 2.1 + API token auth
- **Hosting:** Expo web build served by Caddy on Proxmox LXC behind Cloudflare Tunnel
- **Testing:** Jest 29 + React Native Testing Library

## Project Structure

```
src/
  app/           # Expo Router file-based routes
    (tabs)/      # Authenticated tab navigation (recipes, lists)
    oauth/       # OAuth 2.1 consent screen for MCP clients
    share/       # Public shared recipe viewer
  components/    # Reusable UI components
  hooks/         # Custom React hooks
  lib/           # Business logic (supabase client, auth, ai, types)
  constants/     # Theme constants
supabase/
  functions/
    mcp-server/  # MCP server (Streamable HTTP, JSON-RPC 2.0)
    parse-recipe-text/   # AI recipe parsing from text
    parse-recipe-url/    # AI recipe parsing from URL
    parse-recipe-photo/  # AI recipe parsing from photo (OCR)
  migrations/    # PostgreSQL migrations (run in order)
```

## Key Patterns

### Supabase Client
- Client initialized in `src/lib/supabase.ts` with platform-specific storage
- Uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars
- All data access goes through the Supabase JS client (`supabase.from('table')`)

### Authentication
- Auth context in `src/lib/auth.tsx` provides `useAuth()` hook
- Supabase Auth with email/password, session persisted in AsyncStorage
- ES256 JWT tokens (asymmetric), NOT HS256
- OAuth 2.1 server enabled in Supabase for MCP client authorization

### MCP Server
- Edge function at `supabase/functions/mcp-server/index.ts`
- Streamable HTTP transport (JSON-RPC 2.0 over POST)
- **Dual auth:** `brg_` API tokens (SHA-256 hashed) + Supabase OAuth JWTs
- Uses service role client (`supabaseAdmin`) — bypasses RLS, filters by `user_id` manually
- Serves RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- Points to Supabase as authorization server (supports Dynamic Client Registration)
- 14 tools: recipe CRUD, search, import (URL/text), shopping list management
- Access verification helpers for list membership and item ownership

### Edge Functions
- Deploy with `verify_jwt: false` — auth is done in-function via jose JWKS
- Use direct `fetch()` with explicit `Authorization: Bearer` + `apikey` headers
- Do NOT use `supabase.functions.invoke()` — has a header bug in React Native/Expo web
- See `src/lib/ai.ts` for the pattern
- Parse functions accept service role key for internal MCP calls

### Database
- All tables have Row Level Security (RLS) enabled
- Complex operations use `SECURITY DEFINER` RPC functions
- MCP wrapper RPCs: `mcp_create_list_with_member`, `mcp_add_items_to_list`
- API tokens table with `create_api_token` / `validate_api_token` RPCs
- Migrations in `supabase/migrations/` — run in timestamp order

### OAuth 2.1 Flow
- Supabase built-in OAuth 2.1 server (beta) with Dynamic Client Registration
- Consent screen at `src/app/oauth/consent.tsx` (Expo web route)
- `_layout.tsx` treats `/oauth` as public route + handles post-login redirect via AsyncStorage
- MCP server 401 response includes `WWW-Authenticate` header for OAuth discovery
- Claude Code / Claude Cowork can auto-discover and authenticate via `/mcp`

### UI Conventions
- `maxWidth: 600, width: '100%', alignSelf: 'center'` on all screen containers
- `StyleSheet.create()` at bottom of each file
- Ionicons for all icons
- `#007AFF` primary color, `#ff3b30` destructive color, `#34c759` success color
- `Alert.alert()` for user-facing errors
- Accessibility labels on all interactive elements

### State Management
- No global state library — React Context for auth, component-level useState for UI
- `useFocusEffect` for screen-level data fetching
- `RefreshControl` for pull-to-refresh
- Supabase Realtime for collaborative list updates

## Deployment

### Web App (OAuth consent + public share pages)
- Build: `npx expo export --platform web` → outputs to `dist/`
- Hosted on Caddy in Proxmox LXC (192.168.1.151) behind Cloudflare Tunnel
- Public URL: `https://branger.hertzsprungrussell.org`
- Caddyfile uses `try_files {path} {path}.html /index.html` for SPA routing

### Edge Functions
- Deploy: `npx supabase functions deploy <function-name> --no-verify-jwt`
- MCP server URL: `https://jeboglcuuutpwymxcejn.supabase.co/functions/v1/mcp-server`

## Commands

```bash
npm start          # Start Expo dev server
npm test           # Run Jest tests
npm run lint       # Run ESLint
npx tsc --noEmit   # TypeScript check (no output)
npx expo export --platform web  # Build web app for deployment
npx supabase functions deploy mcp-server --no-verify-jwt  # Deploy MCP server
```

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=     # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY= # Supabase anonymous key
```

Edge functions also need (set in Supabase dashboard):
```
MISTRAL_API_KEY=     # For all recipe parsing (OCR + structuring)
```
