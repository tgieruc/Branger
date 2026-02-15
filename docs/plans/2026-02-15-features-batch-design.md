# Feature Batch Design: Search, Pagination, Offline, Edit, CI/CD, Docs

**Date:** 2026-02-15
**Status:** Approved

## 1. Recipe Search (title + ingredients)

### Approach
Add a search bar to `recipes/index.tsx`. Use a Supabase RPC function that searches recipe title (ilike) and ingredient names (ilike via join). Debounce input at 300ms client-side.

### Database
New RPC function `search_recipes(p_query text, p_limit int, p_cursor timestamptz)`:
- Searches `recipes.title ILIKE '%query%'` OR recipe has an ingredient where `name ILIKE '%query%'`
- Returns recipes ordered by `created_at DESC`
- Respects RLS (user_id = auth.uid())
- Combines with pagination cursor

### UI
- Search bar at top of recipe list, with a search icon
- Clear button when text is present
- Debounced 300ms before triggering search
- Empty state: "No recipes match your search"
- When search is empty, show normal paginated list

## 2. Pagination (cursor-based)

### Approach
Cursor-based pagination using `(created_at, id)` composite cursor. Load 20 recipes per page. `onEndReached` triggers next page load.

### Database
The `search_recipes` RPC handles both search and pagination:
- `p_cursor` param: timestamp of last item (NULL for first page)
- `p_cursor_id` param: id of last item (for tiebreaking)
- `WHERE created_at < p_cursor OR (created_at = p_cursor AND id < p_cursor_id)`
- `LIMIT p_limit + 1` to detect if there are more pages (return extra, check length)

### UI
- `FlatList.onEndReached` triggers `loadMore()`
- Footer spinner while loading next page
- `hasMore` flag to stop fetching when no more data
- Pull-to-refresh resets to first page
- Search resets to first page

## 3. Offline Support

### Recipe Cache (view-only)
- Cache recipe list + detail data in AsyncStorage
- Keys: `@recipes_cache` (list), `@recipe_{id}` (detail with ingredients/steps)
- On app load: show cached data immediately, then fetch fresh data (stale-while-revalidate)
- Cache updates after every successful fetch
- Max cache age: not enforced (always try network, fall back to cache)

### List Offline Edits (add/remove/toggle with sync)
- Use `@react-native-community/netinfo` to detect connectivity
- When offline: queue operations in AsyncStorage under `@offline_queue`
- Queue entries: `{ id, type: 'add_item'|'delete_item'|'toggle_item', payload, timestamp }`
- Optimistic UI: apply changes to local state immediately
- When online: replay queue in order against Supabase, then clear queue
- Conflict resolution: last-write-wins (simple, sufficient for shopping lists)
- Show offline indicator banner when disconnected
- Show sync status when replaying queue

### NetInfo Integration
- Add `NetInfoProvider` at app root (or use hook)
- `useNetInfo()` hook in list screens to decide queue vs direct API
- On reconnect event: trigger queue replay automatically

## 4. Recipe Editing

### Approach
Create `recipes/edit/[id].tsx` — a new screen that reuses the manual form from create. Pre-populate with existing recipe data.

### Data Flow
1. Navigate from detail screen via edit button in header
2. Fetch full recipe with ingredients + steps
3. Pre-populate form state
4. On save:
   - Update `recipes` row (title, photo_url)
   - Delete all existing ingredients, insert new ones (simpler than diffing)
   - Delete all existing steps, insert new ones
   - All in a single flow (not transactional on client, but acceptable)

### UI
- Edit button (pencil icon) in recipe detail header, next to share/delete
- Same form as create: title, ingredients list, steps list
- No mode selector (AI modes not available for edit — recipe already exists)
- "Save Changes" button instead of "Save Recipe"
- Navigate back on success

### Photo Editing
- Show current photo if exists
- Allow replacing photo (same camera/library picker)
- Allow removing photo

## 5. GitHub Actions CI/CD

### PR Checks
Trigger: `pull_request` to `main`
- Install deps (`npm ci`)
- TypeScript check (`npx tsc --noEmit`)
- ESLint (`npx expo lint`)
- Jest tests (`npm test`)

### Main Push: Edge Function Deploy
Trigger: `push` to `main` (paths: `supabase/functions/**`)
- Install Supabase CLI
- Deploy all 3 edge functions
- Requires secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`

### Workflow Files
- `.github/workflows/ci.yml` — PR checks
- `.github/workflows/deploy-functions.yml` — edge function deploy

## 6. Documentation

### README.md
- Project description and features
- Screenshots section (placeholder)
- Tech stack overview
- Prerequisites (Node, Expo CLI, Supabase account)
- Setup instructions (clone, install, env vars, run)
- Environment variables table
- Edge function deployment
- Testing
- Project structure overview

### .env.example
- Template with all required env vars and descriptions

## 7. CLAUDE.md

Project conventions for AI-assisted development:
- Tech stack summary
- File structure conventions
- Coding patterns (direct Supabase queries, RLS, auth patterns)
- Edge function patterns (jose JWKS auth, ES256 JWT)
- Known gotchas (functions.invoke header bug, verify_jwt: false)
- Testing conventions
- Commit message format
