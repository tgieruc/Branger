# Features Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add recipe search, pagination, offline support, recipe editing, CI/CD, documentation, and CLAUDE.md to the Branger app.

**Architecture:** Cursor-based pagination via Supabase RPC that also handles search. Offline support uses AsyncStorage cache for recipes (stale-while-revalidate) and an offline queue for list operations with NetInfo-based sync. Recipe editing reuses the create form pattern. GitHub Actions for CI on PRs and edge function deploy on main push.

**Tech Stack:** React Native/Expo, Supabase (Postgres + Edge Functions), AsyncStorage, @react-native-community/netinfo, GitHub Actions

---

## Parallel Execution Map

```
Wave 1 (all independent, can run simultaneously):
  Task 1: CLAUDE.md
  Task 2: Documentation (README + .env.example)
  Task 3: GitHub Actions CI/CD
  Task 4: Database migration (search_recipes RPC)
  Task 5: Recipe edit screen

Wave 2 (depends on Task 4: migration):
  Task 6: Recipe search + pagination UI

Wave 3 (depends on Task 6: search/pagination):
  Task 7: Offline support - recipe cache
  Task 8: Offline support - list offline queue + sync
  (Task 8 can run in parallel with Task 7)
```

---

### Task 1: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Step 1: Create CLAUDE.md**

```markdown
# Branger

Recipe & collaborative shopping list app with AI-powered recipe import.

## Tech Stack

- **Frontend:** React Native 0.81.5, Expo SDK 54, Expo Router v6, TypeScript 5.9
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI:** OpenAI GPT-4o (recipe parsing), Mistral pixtral-large (photo OCR)
- **Testing:** Jest 29 + React Native Testing Library

## Project Structure

```
src/
  app/           # Expo Router file-based routes
    (tabs)/      # Authenticated tab navigation (recipes, lists)
    share/       # Public shared recipe viewer
  components/    # Reusable UI components
  hooks/         # Custom React hooks
  lib/           # Business logic (supabase client, auth, ai, types)
  constants/     # Theme constants
supabase/
  functions/     # Deno Edge Functions (parse-recipe-text, parse-recipe-url, parse-recipe-photo)
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

### Edge Functions
- Deploy with `verify_jwt: false` — auth is done in-function via jose JWKS
- Use direct `fetch()` with explicit `Authorization: Bearer` + `apikey` headers
- Do NOT use `supabase.functions.invoke()` — has a header bug in React Native/Expo web
- See `src/lib/ai.ts` for the pattern

### Database
- All tables have Row Level Security (RLS) enabled
- Complex operations use `SECURITY DEFINER` RPC functions
- Migrations in `supabase/migrations/` — run in timestamp order

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

## Commands

```bash
npm start          # Start Expo dev server
npm test           # Run Jest tests
npm run lint       # Run ESLint
npx tsc --noEmit   # TypeScript check (no output)
```

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=     # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY= # Supabase anonymous key
```

Edge functions also need (set in Supabase dashboard):
```
OPENAI_API_KEY=      # For recipe text/URL/photo parsing
MISTRAL_API_KEY=     # For photo OCR
```
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project conventions"
```

---

### Task 2: Documentation (README + .env.example)

**Files:**
- Modify: `README.md`
- Create: `.env.example`

**Step 1: Create .env.example**

```
# Supabase project configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Edge function secrets (set in Supabase dashboard, not here)
# OPENAI_API_KEY=your-openai-key
# MISTRAL_API_KEY=your-mistral-key
```

**Step 2: Rewrite README.md**

```markdown
# Branger

A recipe & collaborative shopping list app with AI-powered recipe import. Built with React Native (Expo) and Supabase.

## Features

- **AI Recipe Import** — paste text, enter a URL, or take a photo to auto-parse recipes
- **Manual Recipe Creation** — full form with ingredients and step-by-step instructions
- **Recipe Sharing** — generate shareable links for any recipe
- **Collaborative Shopping Lists** — create lists, invite others, real-time sync
- **Add to List** — add recipe ingredients to any shopping list in one tap
- **Cross-Platform** — iOS, Android, and web

## Tech Stack

- React Native 0.81 + Expo SDK 54
- Expo Router v6 (file-based routing)
- Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- OpenAI GPT-4o + Mistral (AI recipe parsing)
- TypeScript

## Prerequisites

- Node.js 18+
- npm or yarn
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase account](https://supabase.com) (or self-hosted instance)
- OpenAI API key (for AI features)
- Mistral API key (for photo OCR)

## Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd branger
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase URL and anon key
   ```

3. **Set up Supabase:**
   - Create a new Supabase project
   - Run migrations in order from `supabase/migrations/`
   - Set edge function secrets in the Supabase dashboard:
     - `OPENAI_API_KEY`
     - `MISTRAL_API_KEY`

4. **Deploy edge functions:**
   ```bash
   npx supabase functions deploy parse-recipe-text --no-verify-jwt
   npx supabase functions deploy parse-recipe-url --no-verify-jwt
   npx supabase functions deploy parse-recipe-photo --no-verify-jwt
   ```

5. **Start the app:**
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |
| `OPENAI_API_KEY` | OpenAI API key (set in Supabase dashboard) |
| `MISTRAL_API_KEY` | Mistral API key (set in Supabase dashboard) |

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## Project Structure

```
src/
  app/              # Screens (Expo Router file-based routing)
  components/       # Reusable UI components
  hooks/            # Custom React hooks
  lib/              # Business logic, Supabase client, types
supabase/
  functions/        # Edge Functions (Deno)
  migrations/       # PostgreSQL migrations
```

## License

Private
```

**Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: rewrite README with setup guide, add .env.example"
```

---

### Task 3: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-functions.yml`

**Step 1: Create CI workflow**

File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: TypeScript check
        run: npx tsc --noEmit
      - name: Lint
        run: npx expo lint
      - name: Test
        run: npm test
```

**Step 2: Create deploy workflow**

File: `.github/workflows/deploy-functions.yml`

```yaml
name: Deploy Edge Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Link Supabase project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - name: Deploy functions
        run: |
          supabase functions deploy parse-recipe-text --no-verify-jwt
          supabase functions deploy parse-recipe-url --no-verify-jwt
          supabase functions deploy parse-recipe-photo --no-verify-jwt
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

**Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions for PR checks and edge function deploy"
```

---

### Task 4: Database Migration (search_recipes RPC)

**Files:**
- Create: `supabase/migrations/20260215100000_search_recipes_rpc.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2: Apply the migration via Supabase MCP or CLI**

**Step 3: Commit**

```bash
git add supabase/migrations/20260215100000_search_recipes_rpc.sql
git commit -m "feat: add search_recipes RPC with pagination support"
```

---

### Task 5: Recipe Edit Screen

**Files:**
- Create: `src/app/(tabs)/recipes/edit/[id].tsx`
- Modify: `src/app/(tabs)/recipes/[id].tsx` (add edit button to header)

**Step 1: Create the edit screen**

File: `src/app/(tabs)/recipes/edit/[id].tsx`

This screen reuses the same form pattern as `create.tsx` but:
- Fetches existing recipe data on mount
- Pre-populates title, ingredients, steps
- Shows current photo with option to replace/remove
- On save: updates recipe row, deletes+reinserts ingredients and steps
- Navigates back on success

Key implementation details:
- Fetch recipe with ingredients + steps using same pattern as `[id].tsx` detail screen
- Use same `Ingredient` and `Step` types from create screen
- `handleSave` does: `supabase.from('recipes').update(...)`, then delete old ingredients/steps, then insert new ones
- Add photo replace: show current photo with "Change" and "Remove" buttons
- Photo upload reuses same pattern from create (ImagePicker + storage upload)

**Step 2: Add edit button to recipe detail header**

In `src/app/(tabs)/recipes/[id].tsx`, add a pencil icon button in the `headerRight` that navigates to `/(tabs)/recipes/edit/${id}`.

**Step 3: Commit**

```bash
git add src/app/(tabs)/recipes/edit/
git add src/app/(tabs)/recipes/[id].tsx
git commit -m "feat: add recipe editing with full form"
```

---

### Task 6: Recipe Search + Pagination UI

**Depends on:** Task 4 (migration must be applied)

**Files:**
- Modify: `src/app/(tabs)/recipes/index.tsx`
- Modify: `src/lib/types.ts` (if needed for RPC return type)

**Step 1: Update recipes index with search + pagination**

Replace `fetchRecipes` with calls to `search_recipes` RPC:

```typescript
const PAGE_SIZE = 20;

const [recipes, setRecipes] = useState<Recipe[]>([]);
const [searchQuery, setSearchQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');
const [loading, setLoading] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);
const [hasMore, setHasMore] = useState(true);
const [refreshing, setRefreshing] = useState(false);

// Debounce search input
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
  return () => clearTimeout(timer);
}, [searchQuery]);

// Reset and fetch when search changes
useEffect(() => {
  setRecipes([]);
  setHasMore(true);
  fetchRecipes(true);
}, [debouncedQuery]);

const fetchRecipes = async (reset = false) => {
  if (!reset && !hasMore) return;

  const lastRecipe = reset ? null : recipes[recipes.length - 1];
  const { data } = await supabase.rpc('search_recipes', {
    p_query: debouncedQuery,
    p_limit: PAGE_SIZE,
    p_cursor_time: lastRecipe?.created_at ?? null,
    p_cursor_id: lastRecipe?.id ?? null,
  });

  if (data) {
    if (reset) {
      setRecipes(data);
    } else {
      setRecipes(prev => [...prev, ...data]);
    }
    setHasMore(data.length === PAGE_SIZE);
  }
  setLoading(false);
  setLoadingMore(false);
};
```

**Step 2: Add search bar UI**

Add a `TextInput` search bar above the `FlatList` with a search icon and clear button.

**Step 3: Add pagination to FlatList**

```typescript
<FlatList
  ...
  onEndReached={() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchRecipes(false);
    }
  }}
  onEndReachedThreshold={0.5}
  ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} /> : null}
/>
```

**Step 4: Commit**

```bash
git add src/app/(tabs)/recipes/index.tsx
git commit -m "feat: add recipe search and cursor-based pagination"
```

---

### Task 7: Offline Support — Recipe Cache

**Depends on:** Task 6 (search/pagination in place)

**Files:**
- Create: `src/lib/cache.ts`
- Modify: `src/app/(tabs)/recipes/index.tsx` (use cache)
- Modify: `src/app/(tabs)/recipes/[id].tsx` (use cache)

**Step 1: Create cache utility**

File: `src/lib/cache.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECIPES_LIST_KEY = '@recipes_cache';
const RECIPE_DETAIL_PREFIX = '@recipe_';

export async function getCachedRecipeList(): Promise<Recipe[] | null> {
  const data = await AsyncStorage.getItem(RECIPES_LIST_KEY);
  return data ? JSON.parse(data) : null;
}

export async function setCachedRecipeList(recipes: Recipe[]): Promise<void> {
  await AsyncStorage.setItem(RECIPES_LIST_KEY, JSON.stringify(recipes));
}

export async function getCachedRecipeDetail(id: string): Promise<RecipeWithDetails | null> {
  const data = await AsyncStorage.getItem(RECIPE_DETAIL_PREFIX + id);
  return data ? JSON.parse(data) : null;
}

export async function setCachedRecipeDetail(id: string, recipe: RecipeWithDetails): Promise<void> {
  await AsyncStorage.setItem(RECIPE_DETAIL_PREFIX + id, JSON.stringify(recipe));
}
```

**Step 2: Integrate stale-while-revalidate in recipe list**

On mount: load from cache immediately → show cached data → fetch fresh data → update cache.

**Step 3: Integrate in recipe detail**

Same pattern: show cached detail immediately, then fetch fresh.

**Step 4: Commit**

```bash
git add src/lib/cache.ts src/app/(tabs)/recipes/index.tsx src/app/(tabs)/recipes/[id].tsx
git commit -m "feat: add offline recipe caching with stale-while-revalidate"
```

---

### Task 8: Offline Support — List Offline Queue + Sync

**Can run in parallel with Task 7**

**Files:**
- Install: `@react-native-community/netinfo`
- Create: `src/lib/offline-queue.ts`
- Create: `src/lib/net-info.tsx` (context provider)
- Modify: `src/app/_layout.tsx` (add NetInfoProvider)
- Modify: `src/app/(tabs)/lists/[id].tsx` (use offline queue)

**Step 1: Install NetInfo**

```bash
npx expo install @react-native-community/netinfo
```

**Step 2: Create NetInfo context**

File: `src/lib/net-info.tsx`

Provides `useIsOnline()` hook. Wraps `@react-native-community/netinfo`'s `useNetInfo()`.

**Step 3: Create offline queue**

File: `src/lib/offline-queue.ts`

```typescript
type QueueEntry = {
  id: string;
  type: 'add_item' | 'delete_item' | 'toggle_item';
  payload: Record<string, unknown>;
  timestamp: number;
};

// Functions: enqueue(), getQueue(), clearQueue(), replayQueue()
// replayQueue processes entries in order, calling supabase for each
```

**Step 4: Integrate in list detail screen**

- Check `useIsOnline()` before making API calls
- If offline: enqueue operation, apply optimistically to local state
- If online: direct API call (current behavior)
- On reconnect: replay queue automatically
- Show offline banner when disconnected

**Step 5: Add NetInfoProvider to root layout**

Wrap app in `<NetInfoProvider>` in `src/app/_layout.tsx`.

**Step 6: Commit**

```bash
git add package.json src/lib/offline-queue.ts src/lib/net-info.tsx
git add src/app/_layout.tsx src/app/(tabs)/lists/[id].tsx
git commit -m "feat: add offline list editing with sync queue"
```

---

## Task Dependency Summary

```
Task 1 (CLAUDE.md)          → independent
Task 2 (Docs)               → independent
Task 3 (GitHub Actions)     → independent
Task 4 (Migration)          → independent
Task 5 (Recipe Edit)        → independent
Task 6 (Search+Pagination)  → blocked by Task 4
Task 7 (Recipe Cache)       → blocked by Task 6
Task 8 (List Offline Queue) → independent (can start anytime)
```
