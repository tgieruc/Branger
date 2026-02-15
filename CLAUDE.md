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
