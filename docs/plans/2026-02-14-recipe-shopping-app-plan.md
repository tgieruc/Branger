# Recipe & Shopping List App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first recipe & shopping list app with AI-powered recipe creation and collaborative list sharing.

**Architecture:** Expo (React Native) frontend with Expo Router for navigation, Supabase backend (Cloud for dev, self-hosted for prod) handling auth, database, storage, realtime, and edge functions. AI pipeline uses OpenAI for recipe structuring and Mistral for photo OCR.

**Tech Stack:** Expo SDK 52+, TypeScript, Expo Router, Supabase JS v2, Supabase Edge Functions (Deno), OpenAI API, Mistral API

**Design Doc:** `docs/plans/2026-02-14-recipe-shopping-app-design.md`

---

## Phase 1: Project Foundation

### Task 1: Scaffold Expo Project

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `app/_layout.tsx`, `app/index.tsx`

**Step 1: Create Expo project**

Run:
```bash
cd /Users/tgieruc/Documents/branger
npx create-expo-app@latest . --template blank-typescript
```

Expected: Expo project scaffolded with TypeScript template.

**Step 2: Install core dependencies**

Run:
```bash
npx expo install @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage
npx expo install expo-router expo-linking expo-constants expo-status-bar
npx expo install expo-image-picker expo-camera
npm install react-native-safe-area-context react-native-screens react-native-gesture-handler
```

**Step 3: Configure Expo Router in app.json**

Update `app.json` to include:
```json
{
  "expo": {
    "name": "Branger",
    "slug": "branger",
    "scheme": "branger",
    "web": {
      "bundler": "metro",
      "output": "server"
    },
    "plugins": ["expo-router"]
  }
}
```

**Step 4: Create root layout**

Create `app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Create `app/index.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Branger</Text>
    </View>
  );
}
```

**Step 5: Verify the app runs**

Run: `npx expo start`
Expected: App launches in Expo Go showing "Branger" text.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Expo project with TypeScript and Router"
```

---

### Task 2: Set Up Supabase Project + CLI

**Files:**
- Create: `supabase/config.toml`, `.env.local`

**Step 1: Install Supabase CLI**

Run:
```bash
npm install supabase --save-dev
```

**Step 2: Create Supabase cloud project**

Go to https://supabase.com/dashboard and create a new project named "branger". Note the Project URL and anon key.

**Step 3: Initialize Supabase locally**

Run:
```bash
npx supabase init
```

Expected: Creates `supabase/` directory with `config.toml`.

**Step 4: Link to cloud project**

Run:
```bash
npx supabase link --project-ref <your-project-ref>
```

**Step 5: Create .env.local**

Create `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Add `.env.local` to `.gitignore`.

**Step 6: Commit**

```bash
git add supabase/ .gitignore
git commit -m "feat: initialize Supabase CLI and link cloud project"
```

---

### Task 3: Database Schema Migration

**Files:**
- Create: `supabase/migrations/20260214000000_initial_schema.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260214000000_initial_schema.sql`:
```sql
-- ============================================
-- RECIPES
-- ============================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  photo_url text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'text_ai', 'url_ai', 'photo_ai')),
  source_url text,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes(user_id);
create index recipes_share_token_idx on public.recipes(share_token) where share_token is not null;

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  position integer not null default 0
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  step_number integer not null,
  instruction text not null
);

create index recipe_steps_recipe_id_idx on public.recipe_steps(recipe_id);

-- ============================================
-- SHOPPING LISTS (collaborative, no single owner)
-- ============================================
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.shopping_lists(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  unique(list_id, user_id)
);

create index list_members_user_id_idx on public.list_members(user_id);
create index list_members_list_id_idx on public.list_members(list_id);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.shopping_lists(id) on delete cascade not null,
  name text not null,
  description text,
  checked boolean not null default false,
  recipe_id uuid references public.recipes(id) on delete set null,
  position integer not null default 0
);

create index list_items_list_id_idx on public.list_items(list_id);

-- ============================================
-- AUTO-DELETE LIST WHEN LAST MEMBER LEAVES
-- ============================================
create or replace function public.delete_empty_lists()
returns trigger as $$
begin
  if not exists (
    select 1 from public.list_members where list_id = OLD.list_id
  ) then
    delete from public.shopping_lists where id = OLD.list_id;
  end if;
  return OLD;
end;
$$ language plpgsql security definer;

create trigger on_last_member_leaves
  after delete on public.list_members
  for each row execute function public.delete_empty_lists();

-- ============================================
-- AUTO-UPDATE updated_at
-- ============================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at();

create trigger shopping_lists_updated_at
  before update on public.shopping_lists
  for each row execute function public.update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;

-- RECIPES: owner can CRUD, anyone with share_token can SELECT
create policy "Users can view own recipes"
  on public.recipes for select
  using (auth.uid() = user_id);

create policy "Anyone can view shared recipes"
  on public.recipes for select
  using (share_token is not null);

create policy "Users can insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id);

create policy "Users can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);

-- RECIPE INGREDIENTS: same as parent recipe
create policy "Users can view own recipe ingredients"
  on public.recipe_ingredients for select
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and (recipes.user_id = auth.uid() or recipes.share_token is not null)
    )
  );

create policy "Users can manage own recipe ingredients"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can update own recipe ingredients"
  on public.recipe_ingredients for update
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own recipe ingredients"
  on public.recipe_ingredients for delete
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

-- RECIPE STEPS: same pattern
create policy "Users can view own recipe steps"
  on public.recipe_steps for select
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and (recipes.user_id = auth.uid() or recipes.share_token is not null)
    )
  );

create policy "Users can manage own recipe steps"
  on public.recipe_steps for insert
  with check (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can update own recipe steps"
  on public.recipe_steps for update
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own recipe steps"
  on public.recipe_steps for delete
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

-- SHOPPING LISTS: members can view
create policy "Members can view their lists"
  on public.shopping_lists for select
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create lists"
  on public.shopping_lists for insert
  with check (auth.uid() is not null);

create policy "Members can update their lists"
  on public.shopping_lists for update
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can delete their lists"
  on public.shopping_lists for delete
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

-- LIST MEMBERS: members can view/manage membership
create policy "Members can view list members"
  on public.list_members for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.list_members lm
      where lm.list_id = list_members.list_id
        and lm.user_id = auth.uid()
    )
  );

create policy "Authenticated users can join lists"
  on public.list_members for insert
  with check (auth.uid() is not null);

create policy "Members can remove members"
  on public.list_members for delete
  using (
    exists (
      select 1 from public.list_members lm
      where lm.list_id = list_members.list_id
        and lm.user_id = auth.uid()
    )
  );

-- LIST ITEMS: members of the list can CRUD
create policy "Members can view list items"
  on public.list_items for select
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can add list items"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can update list items"
  on public.list_items for update
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can delete list items"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

-- ============================================
-- STORAGE BUCKET for recipe photos
-- ============================================
insert into storage.buckets (id, name, public)
  values ('recipe-photos', 'recipe-photos', true);

create policy "Authenticated users can upload recipe photos"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-photos'
    and auth.uid() is not null
  );

create policy "Anyone can view recipe photos"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

create policy "Users can delete own recipe photos"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

**Step 2: Apply the migration**

Run:
```bash
npx supabase db push
```

Expected: Migration applied successfully.

**Step 3: Verify tables in Supabase dashboard**

Open Supabase Dashboard → Table Editor. Confirm all 6 tables exist with correct columns.

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add database schema with RLS policies"
```

---

### Task 4: TypeScript Types + Supabase Client

**Files:**
- Create: `lib/supabase.ts`, `lib/types.ts`

**Step 1: Generate Supabase types**

Run:
```bash
npx supabase gen types typescript --linked > lib/database.types.ts
```

**Step 2: Create app-level types**

Create `lib/types.ts`:
```ts
import type { Database } from './database.types';

// Row types from Supabase
type Tables = Database['public']['Tables'];

export type Recipe = Tables['recipes']['Row'];
export type RecipeInsert = Tables['recipes']['Insert'];
export type RecipeIngredient = Tables['recipe_ingredients']['Row'];
export type RecipeIngredientInsert = Tables['recipe_ingredients']['Insert'];
export type RecipeStep = Tables['recipe_steps']['Row'];
export type RecipeStepInsert = Tables['recipe_steps']['Insert'];
export type ShoppingList = Tables['shopping_lists']['Row'];
export type ShoppingListInsert = Tables['shopping_lists']['Insert'];
export type ListMember = Tables['list_members']['Row'];
export type ListItem = Tables['list_items']['Row'];
export type ListItemInsert = Tables['list_items']['Insert'];

// Composite types for UI
export type RecipeWithDetails = Recipe & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type ShoppingListWithItems = ShoppingList & {
  items: ListItem[];
  members: ListMember[];
};

// AI pipeline types
export type AIRecipeResult = {
  title: string;
  ingredients: { name: string; description: string }[];
  steps: string[];
};
```

**Step 3: Create Supabase client**

Create `lib/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

**Step 4: Commit**

```bash
git add lib/
git commit -m "feat: add Supabase client and TypeScript types"
```

---

## Phase 2: Authentication

### Task 5: Auth Context Provider

**Files:**
- Create: `lib/auth.tsx`

**Step 1: Create the auth context**

Create `lib/auth.tsx`:
```tsx
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

**Step 2: Commit**

```bash
git add lib/auth.tsx
git commit -m "feat: add auth context provider with sign up/in/out"
```

---

### Task 6: Auth Screens + Root Layout with Auth Guard

**Files:**
- Modify: `app/_layout.tsx`
- Create: `app/login.tsx`, `app/register.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/recipes/index.tsx`, `app/(tabs)/lists/index.tsx`

**Step 1: Update root layout with auth guard**

Replace `app/_layout.tsx`:
```tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup) {
      router.replace('/(tabs)/recipes');
    }
  }, [session, loading, segments]);

  if (loading) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGuard>
        <Slot />
      </AuthGuard>
    </AuthProvider>
  );
}
```

**Step 2: Create login screen**

Create `app/login.tsx`:
```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Branger</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
      <Link href="/register" style={styles.link}>
        Don't have an account? Sign Up
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 48 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, marginBottom: 16, fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, textAlign: 'center', color: '#007AFF' },
});
```

**Step 3: Create register screen**

Create `app/register.tsx`:
```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Check your email to confirm your account');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Create Account</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
      </TouchableOpacity>
      <Link href="/login" style={styles.link}>
        Already have an account? Sign In
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 48 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, marginBottom: 16, fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, textAlign: 'center', color: '#007AFF' },
});
```

**Step 4: Create tab layout**

Create `app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Step 5: Create placeholder tab screens**

Create `app/(tabs)/recipes/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function RecipesLayout() {
  return <Stack />;
}
```

Create `app/(tabs)/recipes/index.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native';

export default function RecipesScreen() {
  return (
    <View style={styles.container}>
      <Text>Recipes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
```

Create `app/(tabs)/lists/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function ListsLayout() {
  return <Stack />;
}
```

Create `app/(tabs)/lists/index.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native';

export default function ListsScreen() {
  return (
    <View style={styles.container}>
      <Text>Shopping Lists</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
```

**Step 6: Delete the old `app/index.tsx`**

Remove `app/index.tsx` — Expo Router will now use the tab layout as the default.

**Step 7: Test auth flow**

Run: `npx expo start`
Expected: App shows login screen. After registering + logging in, redirects to tabs.

**Step 8: Commit**

```bash
git add app/ lib/
git commit -m "feat: add auth screens and tab navigation with auth guard"
```

---

## Phase 3: Recipes CRUD

### Task 7: Recipe List Screen

**Files:**
- Modify: `app/(tabs)/recipes/index.tsx`
- Create: `components/RecipeCard.tsx`

**Step 1: Create RecipeCard component**

Create `components/RecipeCard.tsx`:
```tsx
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import type { Recipe } from '../lib/types';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/(tabs)/recipes/${recipe.id}`} asChild>
      <TouchableOpacity style={styles.card}>
        {recipe.photo_url && (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        )}
        <View style={styles.info}>
          <Text style={styles.title}>{recipe.title}</Text>
          <Text style={styles.date}>
            {new Date(recipe.created_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    marginHorizontal: 16, marginVertical: 6, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  image: { width: 80, height: 80 },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  date: { fontSize: 12, color: '#888', marginTop: 4 },
});
```

**Step 2: Implement recipe list screen with data fetching**

Replace `app/(tabs)/recipes/index.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { RecipeCard } from '../../../components/RecipeCard';
import type { Recipe } from '../../../lib/types';

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecipes = async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setRecipes(data);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    fetchRecipes();
  }, []));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No recipes yet. Tap + to create one.</Text>
        }
      />
      <Link href="/(tabs)/recipes/create" asChild>
        <TouchableOpacity style={styles.fab}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#007AFF', justifyContent: 'center',
    alignItems: 'center', elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
});
```

**Step 3: Commit**

```bash
git add app/(tabs)/recipes/index.tsx components/RecipeCard.tsx
git commit -m "feat: add recipe list screen with FAB"
```

---

### Task 8: Manual Recipe Creation Screen

**Files:**
- Create: `app/(tabs)/recipes/create.tsx`

**Step 1: Create manual recipe form**

Create `app/(tabs)/recipes/create.tsx`:
```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

type Ingredient = { name: string; description: string };
type Step = { instruction: string };

export default function CreateRecipeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', description: '' },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '' }]);
  const [saving, setSaving] = useState(false);

  // --- AI state (will be wired in Task 14) ---
  const [mode, setMode] = useState<'manual' | 'text' | 'url' | 'photo'>('manual');

  const addIngredient = () =>
    setIngredients([...ingredients, { name: '', description: '' }]);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const removeIngredient = (index: number) =>
    setIngredients(ingredients.filter((_, i) => i !== index));

  const addStep = () => setSteps([...steps, { instruction: '' }]);

  const updateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index].instruction = value;
    setSteps(updated);
  };

  const removeStep = (index: number) =>
    setSteps(steps.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }

    const validIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());

    setSaving(true);

    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({ title: title.trim(), user_id: user!.id, source_type: 'manual' })
      .select()
      .single();

    if (error || !recipe) {
      Alert.alert('Error', error?.message ?? 'Failed to create recipe');
      setSaving(false);
      return;
    }

    if (validIngredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        validIngredients.map((ing, i) => ({
          recipe_id: recipe.id,
          name: ing.name.trim(),
          description: ing.description.trim(),
          position: i,
        }))
      );
    }

    if (validSteps.length > 0) {
      await supabase.from('recipe_steps').insert(
        validSteps.map((step, i) => ({
          recipe_id: recipe.id,
          step_number: i + 1,
          instruction: step.instruction.trim(),
        }))
      );
    }

    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="Recipe title"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Ingredients</Text>
      {ingredients.map((ing, i) => (
        <View key={i} style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Item (e.g. tomato)"
            value={ing.name}
            onChangeText={(v) => updateIngredient(i, 'name', v)}
          />
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Amount (e.g. 1 can)"
            value={ing.description}
            onChangeText={(v) => updateIngredient(i, 'description', v)}
          />
          <TouchableOpacity onPress={() => removeIngredient(i)}>
            <Ionicons name="close-circle" size={24} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={addIngredient} style={styles.addRow}>
        <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
        <Text style={styles.addText}>Add ingredient</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Steps</Text>
      {steps.map((step, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.stepNumber}>{i + 1}.</Text>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Instruction"
            value={step.instruction}
            onChangeText={(v) => updateStep(i, v)}
            multiline
          />
          <TouchableOpacity onPress={() => removeStep(i)}>
            <Ionicons name="close-circle" size={24} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={addStep} style={styles.addRow}>
        <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
        <Text style={styles.addText}>Add step</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Recipe'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addText: { color: '#007AFF', marginLeft: 6 },
  saveButton: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

**Step 2: Test by creating a recipe**

Run: `npx expo start`
Expected: Navigate to create screen, fill form, save. Recipe appears in list.

**Step 3: Commit**

```bash
git add app/(tabs)/recipes/create.tsx
git commit -m "feat: add manual recipe creation screen"
```

---

### Task 9: Recipe Detail Screen

**Files:**
- Create: `app/(tabs)/recipes/[id].tsx`

**Step 1: Create recipe detail screen**

Create `app/(tabs)/recipes/[id].tsx`:
```tsx
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import type { RecipeWithDetails } from '../../../lib/types';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (!recipeData) {
      setLoading(false);
      return;
    }

    const { data: ingredients } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', id)
      .order('position');

    const { data: steps } = await supabase
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', id)
      .order('step_number');

    setRecipe({
      ...recipeData,
      ingredients: ingredients ?? [],
      steps: steps ?? [],
    });
    setLoading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('recipes').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!recipe) return;
    if (recipe.share_token) {
      Alert.alert('Share Link', `Share this token: ${recipe.share_token}`);
      return;
    }
    const token = crypto.randomUUID();
    await supabase.from('recipes').update({ share_token: token }).eq('id', id);
    setRecipe({ ...recipe, share_token: token });
    Alert.alert('Share Link', `Share this token: ${token}`);
  };

  const handleAddToList = async () => {
    if (!recipe) return;
    // Fetch user's lists
    const { data: memberships } = await supabase
      .from('list_members')
      .select('list_id, shopping_lists(id, name)')
      .eq('user_id', user!.id);

    const lists = memberships
      ?.map((m: any) => m.shopping_lists)
      .filter(Boolean) ?? [];

    if (lists.length === 0) {
      Alert.alert('No Lists', 'Create a shopping list first, then add recipe ingredients to it.');
      return;
    }

    Alert.alert(
      'Add to List',
      'Select a list:',
      [
        ...lists.map((list: any) => ({
          text: list.name,
          onPress: async () => {
            const maxPos = await supabase
              .from('list_items')
              .select('position')
              .eq('list_id', list.id)
              .order('position', { ascending: false })
              .limit(1)
              .single();

            const startPos = (maxPos.data?.position ?? -1) + 1;

            await supabase.from('list_items').insert(
              recipe.ingredients.map((ing, i) => ({
                list_id: list.id,
                name: ing.name,
                description: ing.description || null,
                recipe_id: recipe.id,
                position: startPos + i,
              }))
            );
            Alert.alert('Done', `Added ${recipe.ingredients.length} items to ${list.name}`);
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text>Recipe not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {recipe.photo_url && (
        <Image source={{ uri: recipe.photo_url }} style={styles.image} />
      )}
      <Text style={styles.title}>{recipe.title}</Text>

      <View style={styles.actions}>
        <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
          <Ionicons name="share-outline" size={20} color="#007AFF" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAddToList} style={styles.actionButton}>
          <Ionicons name="cart-outline" size={20} color="#007AFF" />
          <Text style={styles.actionText}>Add to List</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={20} color="#ff3b30" />
          <Text style={[styles.actionText, { color: '#ff3b30' }]}>Delete</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Ingredients</Text>
      {recipe.ingredients.map((ing) => (
        <View key={ing.id} style={styles.ingredientRow}>
          <Text style={styles.ingredientName}>{ing.name}</Text>
          <Text style={styles.ingredientDesc}>{ing.description}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Steps</Text>
      {recipe.steps.map((step) => (
        <View key={step.id} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{step.step_number}.</Text>
          <Text style={styles.stepText}>{step.instruction}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: 200 },
  title: { fontSize: 24, fontWeight: 'bold', padding: 16, paddingBottom: 8 },
  actions: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: '#007AFF', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '600', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  ingredientName: { fontSize: 15, fontWeight: '500', marginRight: 8 },
  ingredientDesc: { fontSize: 15, color: '#666' },
  stepRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
});
```

**Step 2: Test navigation and detail view**

Run: `npx expo start`
Expected: Tap a recipe card → navigates to detail screen with ingredients and steps.

**Step 3: Commit**

```bash
git add app/(tabs)/recipes/[id].tsx
git commit -m "feat: add recipe detail screen with share, delete, add-to-list"
```

---

## Phase 4: Shopping Lists

### Task 10: Shopping Lists Screen

**Files:**
- Modify: `app/(tabs)/lists/index.tsx`

**Step 1: Implement lists screen**

Replace `app/(tabs)/lists/index.tsx`:
```tsx
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

type ListSummary = {
  id: string;
  name: string;
  item_count: number;
  unchecked_count: number;
};

export default function ListsScreen() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchLists = async () => {
    const { data: memberships } = await supabase
      .from('list_members')
      .select('list_id')
      .eq('user_id', user!.id);

    if (!memberships || memberships.length === 0) {
      setLists([]);
      setLoading(false);
      return;
    }

    const listIds = memberships.map((m) => m.list_id);

    const { data: listsData } = await supabase
      .from('shopping_lists')
      .select('id, name')
      .in('id', listIds)
      .order('updated_at', { ascending: false });

    if (!listsData) {
      setLists([]);
      setLoading(false);
      return;
    }

    // Get item counts for each list
    const summaries: ListSummary[] = [];
    for (const list of listsData) {
      const { count: totalCount } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      const { count: uncheckedCount } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id)
        .eq('checked', false);

      summaries.push({
        id: list.id,
        name: list.name,
        item_count: totalCount ?? 0,
        unchecked_count: uncheckedCount ?? 0,
      });
    }

    setLists(summaries);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    fetchLists();
  }, []));

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const { data: list, error } = await supabase
      .from('shopping_lists')
      .insert({ name: newName.trim() })
      .select()
      .single();

    if (error || !list) {
      Alert.alert('Error', error?.message ?? 'Failed to create list');
      return;
    }

    // Add creator as first member
    await supabase.from('list_members').insert({
      list_id: list.id,
      user_id: user!.id,
    });

    setNewName('');
    setShowCreate(false);
    fetchLists();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link href={`/(tabs)/lists/${item.id}`} asChild>
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>
                  {item.unchecked_count} remaining / {item.item_count} total
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          </Link>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No lists yet. Tap + to create one.</Text>
        }
      />

      {showCreate && (
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            placeholder="List name"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <TouchableOpacity onPress={handleCreate}>
            <Ionicons name="checkmark-circle" size={32} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(!showCreate)}>
        <Ionicons name={showCreate ? 'close' : 'add'} size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#888', marginTop: 4 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: '#fff', borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  createInput: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 15, marginRight: 8,
  },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#007AFF', justifyContent: 'center',
    alignItems: 'center', elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
});
```

**Step 2: Commit**

```bash
git add app/(tabs)/lists/index.tsx
git commit -m "feat: add shopping lists screen with create"
```

---

### Task 11: List Detail Screen (Checklist + Members)

**Files:**
- Create: `app/(tabs)/lists/[id].tsx`

**Step 1: Create list detail screen**

Create `app/(tabs)/lists/[id].tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import type { ShoppingList, ListItem, ListMember } from '../../../lib/types';

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');

  const fetchData = async () => {
    const [listRes, itemsRes, membersRes] = await Promise.all([
      supabase.from('shopping_lists').select('*').eq('id', id).single(),
      supabase.from('list_items').select('*').eq('list_id', id).order('position'),
      supabase.from('list_members').select('*').eq('list_id', id),
    ]);

    if (listRes.data) setList(listRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for items
    const channel = supabase
      .channel(`list-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'list_items',
        filter: `list_id=eq.${id}`,
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const toggleItem = async (item: ListItem) => {
    await supabase
      .from('list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from('list_items').delete().eq('id', itemId);
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;

    const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) : -1;

    await supabase.from('list_items').insert({
      list_id: id,
      name: newItemName.trim(),
      description: newItemDesc.trim() || null,
      position: maxPos + 1,
    });

    setNewItemName('');
    setNewItemDesc('');
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave List',
      members.length === 1
        ? 'You are the last member. The list will be deleted.'
        : 'Are you sure you want to leave this list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('list_members')
              .delete()
              .eq('list_id', id)
              .eq('user_id', user!.id);
            router.back();
          },
        },
      ]
    );
  };

  const handleAddMember = () => {
    Alert.prompt('Add Member', 'Enter their email address:', async (email) => {
      if (!email?.trim()) return;

      // Look up user by email via a simple approach:
      // We use supabase admin or a function. For now, share via list ID.
      Alert.alert(
        'Share List',
        `Share this list ID with them: ${id}\n\n(In-app member invite coming soon)`
      );
    });
  };

  const clearChecked = async () => {
    const checkedIds = items.filter((i) => i.checked).map((i) => i.id);
    if (checkedIds.length === 0) return;

    await supabase.from('list_items').delete().in('id', checkedIds);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Sort: unchecked first, then checked
  const sortedItems = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.position - b.position;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{list?.name}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleAddMember} style={styles.headerButton}>
            <Ionicons name="person-add-outline" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearChecked} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeave} style={styles.headerButton}>
            <Ionicons name="exit-outline" size={20} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => toggleItem(item)}
            onLongPress={() => deleteItem(item.id)}
          >
            <Ionicons
              name={item.checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={item.checked ? '#34c759' : '#ccc'}
            />
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, item.checked && styles.checkedText]}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={[styles.itemDesc, item.checked && styles.checkedText]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      <View style={styles.addRow}>
        <TextInput
          style={[styles.addInput, { flex: 2 }]}
          placeholder="Item name"
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={addItem}
        />
        <TextInput
          style={[styles.addInput, { flex: 1, marginLeft: 8 }]}
          placeholder="Amount"
          value={newItemDesc}
          onChangeText={setNewItemDesc}
          onSubmitEditing={addItem}
        />
        <TouchableOpacity onPress={addItem} style={styles.addButton}>
          <Ionicons name="add-circle" size={36} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerButton: { padding: 4 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  itemInfo: { marginLeft: 12, flex: 1 },
  itemName: { fontSize: 16 },
  itemDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  checkedText: { textDecorationLine: 'line-through', color: '#bbb' },
  addRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fafafa',
  },
  addInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15,
  },
  addButton: { marginLeft: 8 },
});
```

**Step 2: Test the list flow**

Run: `npx expo start`
Expected: Create a list, tap it, add items, check/uncheck, delete items via long press.

**Step 3: Commit**

```bash
git add app/(tabs)/lists/[id].tsx
git commit -m "feat: add list detail with checklist, realtime, and membership"
```

---

## Phase 5: AI Recipe Pipeline

### Task 12: Edge Function — Text to Recipe

**Files:**
- Create: `supabase/functions/parse-recipe-text/index.ts`

**Step 1: Create the edge function**

Run:
```bash
npx supabase functions new parse-recipe-text
```

Replace `supabase/functions/parse-recipe-text/index.ts`:
```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a recipe parser. Given free-form text about a recipe, extract it into a structured JSON format.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe Title",
  "ingredients": [
    { "name": "ingredient name", "description": "amount/qualifier" }
  ],
  "steps": ["step 1 instruction", "step 2 instruction"]
}

Rules:
- "name" is the item itself (e.g., "tomato", "spaghetti", "butter")
- "description" is the amount or qualifier (e.g., "1 can", "400g", "2 tablespoons", "1 large")
- Steps should be clear, concise instructions
- If the text is unclear, make reasonable assumptions
- Return ONLY the JSON, no markdown, no explanation`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    const recipe = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(recipe), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Set the OpenAI secret**

Run:
```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

**Step 3: Deploy**

Run:
```bash
npx supabase functions deploy parse-recipe-text
```

**Step 4: Commit**

```bash
git add supabase/functions/parse-recipe-text/
git commit -m "feat: add edge function for text-to-recipe AI parsing"
```

---

### Task 13: Edge Function — URL to Recipe

**Files:**
- Create: `supabase/functions/parse-recipe-url/index.ts`

**Step 1: Create the edge function**

Run:
```bash
npx supabase functions new parse-recipe-url
```

Replace `supabase/functions/parse-recipe-url/index.ts`:
```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a recipe parser. Given the text content scraped from a recipe webpage, extract it into a structured JSON format.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe Title",
  "ingredients": [
    { "name": "ingredient name", "description": "amount/qualifier" }
  ],
  "steps": ["step 1 instruction", "step 2 instruction"]
}

Rules:
- "name" is the item itself (e.g., "tomato", "spaghetti", "butter")
- "description" is the amount or qualifier (e.g., "1 can", "400g", "2 tablespoons", "1 large")
- Ignore ads, navigation, comments, and other non-recipe content
- Steps should be clear, concise instructions
- Return ONLY the JSON, no markdown, no explanation`;

function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Limit to avoid token overflow
  return text.slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch the webpage
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeParser/1.0)" },
    });
    const html = await pageResponse.text();
    const pageText = extractTextFromHtml(html);

    // Send to OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `URL: ${url}\n\nPage content:\n${pageText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    const recipe = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(recipe), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Deploy**

Run:
```bash
npx supabase functions deploy parse-recipe-url
```

**Step 3: Commit**

```bash
git add supabase/functions/parse-recipe-url/
git commit -m "feat: add edge function for URL-to-recipe AI parsing"
```

---

### Task 14: Edge Function — Photo to Recipe

**Files:**
- Create: `supabase/functions/parse-recipe-photo/index.ts`

**Step 1: Create the edge function**

Run:
```bash
npx supabase functions new parse-recipe-photo
```

Replace `supabase/functions/parse-recipe-photo/index.ts`:
```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;

const SYSTEM_PROMPT = `You are a recipe parser. Given OCR-extracted text from a recipe photo, extract it into a structured JSON format.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe Title",
  "ingredients": [
    { "name": "ingredient name", "description": "amount/qualifier" }
  ],
  "steps": ["step 1 instruction", "step 2 instruction"]
}

Rules:
- "name" is the item itself (e.g., "tomato", "spaghetti", "butter")
- "description" is the amount or qualifier (e.g., "1 can", "400g", "2 tablespoons", "1 large")
- OCR text may have errors — correct obvious misspellings
- Steps should be clear, concise instructions
- Return ONLY the JSON, no markdown, no explanation`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { image_url } = await req.json();

    if (!image_url || typeof image_url !== "string") {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 1: OCR with Mistral pixtral
    const ocrResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "pixtral-large-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL text from this image. Return only the raw text, preserving the structure as much as possible.",
              },
              {
                type: "image_url",
                image_url: { url: image_url },
              },
            ],
          },
        ],
      }),
    });

    const ocrData = await ocrResponse.json();
    const extractedText = ocrData.choices[0].message.content;

    // Step 2: Structure with OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `OCR extracted text:\n\n${extractedText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    const recipe = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(recipe), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Set the Mistral secret**

Run:
```bash
npx supabase secrets set MISTRAL_API_KEY=your-mistral-key
```

**Step 3: Deploy**

Run:
```bash
npx supabase functions deploy parse-recipe-photo
```

**Step 4: Commit**

```bash
git add supabase/functions/parse-recipe-photo/
git commit -m "feat: add edge function for photo-to-recipe via Mistral OCR + OpenAI"
```

---

### Task 15: Wire AI Modes into Recipe Creator

**Files:**
- Modify: `app/(tabs)/recipes/create.tsx`
- Create: `lib/ai.ts`

**Step 1: Create AI client helper**

Create `lib/ai.ts`:
```ts
import { supabase } from './supabase';
import type { AIRecipeResult } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function callEdgeFunction(
  functionName: string,
  body: Record<string, string>
): Promise<AIRecipeResult> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI parsing failed');
  }

  return response.json();
}

export async function parseRecipeFromText(text: string): Promise<AIRecipeResult> {
  return callEdgeFunction('parse-recipe-text', { text });
}

export async function parseRecipeFromUrl(url: string): Promise<AIRecipeResult> {
  return callEdgeFunction('parse-recipe-url', { url });
}

export async function parseRecipeFromPhoto(imageUrl: string): Promise<AIRecipeResult> {
  return callEdgeFunction('parse-recipe-photo', { image_url: imageUrl });
}
```

**Step 2: Update create screen with AI modes**

Replace `app/(tabs)/recipes/create.tsx` with a version that adds segmented mode selector (manual/text/url/photo) at the top.

Key additions to the existing create screen:

- Add a mode selector at the top: `manual | text | url | photo`
- For `text` mode: show a large TextInput + "Generate" button. On generate, call `parseRecipeFromText`, then populate the form fields with the result.
- For `url` mode: show a URL TextInput + "Import" button. On import, call `parseRecipeFromUrl`, then populate the form.
- For `photo` mode: show a camera/gallery picker. On photo selected, upload to Supabase Storage, get public URL, call `parseRecipeFromPhoto`, then populate the form.
- After AI generates a result, switch to manual mode view (the form) with pre-filled data so user can review and edit before saving.
- The save logic remains identical — it already handles the form data.

The full replacement code for `app/(tabs)/recipes/create.tsx`:
```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, SegmentedControlIOS, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto } from '../../../lib/ai';

type Ingredient = { name: string; description: string };
type Step = { instruction: string };
type Mode = 'manual' | 'text' | 'url' | 'photo';

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'manual', label: 'Manual', icon: 'create-outline' },
  { key: 'text', label: 'Text', icon: 'document-text-outline' },
  { key: 'url', label: 'URL', icon: 'link-outline' },
  { key: 'photo', label: 'Photo', icon: 'camera-outline' },
];

export default function CreateRecipeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>('manual');
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', description: '' }]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '' }]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // AI input state
  const [aiText, setAiText] = useState('');
  const [aiUrl, setAiUrl] = useState('');

  const sourceTypeMap: Record<Mode, string> = {
    manual: 'manual',
    text: 'text_ai',
    url: 'url_ai',
    photo: 'photo_ai',
  };

  const populateFromAI = (result: { title: string; ingredients: { name: string; description: string }[]; steps: string[] }) => {
    setTitle(result.title);
    setIngredients(
      result.ingredients.length > 0
        ? result.ingredients
        : [{ name: '', description: '' }]
    );
    setSteps(
      result.steps.length > 0
        ? result.steps.map((s) => ({ instruction: s }))
        : [{ instruction: '' }]
    );
  };

  const handleAiText = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseRecipeFromText(aiText);
      populateFromAI(result);
      setMode('manual'); // Switch to form for review
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
  };

  const handleAiUrl = async () => {
    if (!aiUrl.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseRecipeFromUrl(aiUrl);
      populateFromAI(result);
      setMode('manual');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
  };

  const handleAiPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setAiLoading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user!.id}/${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('recipe-photos')
        .upload(fileName, blob, { contentType: asset.mimeType || 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('recipe-photos')
        .getPublicUrl(fileName);

      const parsed = await parseRecipeFromPhoto(publicUrl);
      populateFromAI(parsed);
      setMode('manual');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
  };

  // --- Ingredient/step helpers (same as before) ---
  const addIngredient = () => setIngredients([...ingredients, { name: '', description: '' }]);
  const updateIngredient = (i: number, field: keyof Ingredient, value: string) => {
    const u = [...ingredients]; u[i][field] = value; setIngredients(u);
  };
  const removeIngredient = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));
  const addStep = () => setSteps([...steps, { instruction: '' }]);
  const updateStep = (i: number, v: string) => {
    const u = [...steps]; u[i].instruction = v; setSteps(u);
  };
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title'); return; }
    const validIngs = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());
    setSaving(true);

    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({
        title: title.trim(),
        user_id: user!.id,
        source_type: sourceTypeMap[mode] || 'manual',
        source_url: mode === 'url' ? aiUrl : null,
      })
      .select()
      .single();

    if (error || !recipe) {
      Alert.alert('Error', error?.message ?? 'Failed'); setSaving(false); return;
    }

    if (validIngs.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        validIngs.map((ing, i) => ({
          recipe_id: recipe.id, name: ing.name.trim(),
          description: ing.description.trim(), position: i,
        }))
      );
    }

    if (validSteps.length > 0) {
      await supabase.from('recipe_steps').insert(
        validSteps.map((s, i) => ({
          recipe_id: recipe.id, step_number: i + 1, instruction: s.instruction.trim(),
        }))
      );
    }

    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode selector */}
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeButton, mode === m.key && styles.modeActive]}
            onPress={() => setMode(m.key)}
          >
            <Ionicons name={m.icon as any} size={18} color={mode === m.key ? '#fff' : '#007AFF'} />
            <Text style={[styles.modeText, mode === m.key && styles.modeTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {aiLoading && (
        <View style={styles.aiLoading}>
          <ActivityIndicator size="large" />
          <Text style={styles.aiLoadingText}>Parsing recipe...</Text>
        </View>
      )}

      {/* AI input areas */}
      {mode === 'text' && !aiLoading && (
        <View>
          <Text style={styles.label}>Paste recipe text</Text>
          <TextInput
            style={[styles.input, { height: 160, textAlignVertical: 'top' }]}
            placeholder="Paste a recipe here..."
            value={aiText}
            onChangeText={setAiText}
            multiline
          />
          <TouchableOpacity style={styles.aiButton} onPress={handleAiText}>
            <Text style={styles.aiButtonText}>Generate Recipe</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'url' && !aiLoading && (
        <View>
          <Text style={styles.label}>Recipe URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://example.com/recipe"
            value={aiUrl}
            onChangeText={setAiUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity style={styles.aiButton} onPress={handleAiUrl}>
            <Text style={styles.aiButtonText}>Import Recipe</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'photo' && !aiLoading && (
        <View>
          <TouchableOpacity style={styles.photoButton} onPress={handleAiPhoto}>
            <Ionicons name="camera-outline" size={32} color="#007AFF" />
            <Text style={styles.photoText}>Pick a photo of a recipe</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual form (always shown for manual mode, shown after AI populates) */}
      {(mode === 'manual') && !aiLoading && (
        <>
          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} placeholder="Recipe title" value={title} onChangeText={setTitle} />

          <Text style={styles.label}>Ingredients</Text>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.row}>
              <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Item" value={ing.name} onChangeText={(v) => updateIngredient(i, 'name', v)} />
              <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Amount" value={ing.description} onChangeText={(v) => updateIngredient(i, 'description', v)} />
              <TouchableOpacity onPress={() => removeIngredient(i)}>
                <Ionicons name="close-circle" size={24} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addIngredient} style={styles.addRow}>
            <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.addText}>Add ingredient</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Steps</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.stepNumber}>{i + 1}.</Text>
              <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Instruction" value={step.instruction} onChangeText={(v) => updateStep(i, v)} multiline />
              <TouchableOpacity onPress={() => removeStep(i)}>
                <Ionicons name="close-circle" size={24} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addStep} style={styles.addRow}>
            <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.addText}>Add step</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Recipe'}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#007AFF',
  },
  modeActive: { backgroundColor: '#007AFF' },
  modeText: { fontSize: 13, color: '#007AFF' },
  modeTextActive: { color: '#fff' },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addText: { color: '#007AFF', marginLeft: 6 },
  saveButton: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aiButton: {
    backgroundColor: '#5856D6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12,
  },
  aiButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aiLoading: { alignItems: 'center', paddingVertical: 48 },
  aiLoadingText: { marginTop: 12, color: '#888', fontSize: 16 },
  photoButton: {
    alignItems: 'center', paddingVertical: 48, borderWidth: 2,
    borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 12, marginTop: 8,
  },
  photoText: { marginTop: 8, color: '#007AFF', fontSize: 16 },
});
```

**Step 3: Test all AI modes**

Run: `npx expo start`
Expected: Text mode generates recipe from pasted text. URL mode imports from a URL. Photo mode lets you pick a photo and extract a recipe.

**Step 4: Commit**

```bash
git add lib/ai.ts app/(tabs)/recipes/create.tsx
git commit -m "feat: wire AI recipe creation (text, URL, photo) into create screen"
```

---

## Phase 6: Shared Recipe View

### Task 16: Shared Recipe Screen

**Files:**
- Create: `app/share/[token].tsx`

**Step 1: Create shared recipe screen**

Create `app/share/[token].tsx`:
```tsx
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { RecipeWithDetails } from '../../lib/types';

export default function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSharedRecipe();
  }, [token]);

  const fetchSharedRecipe = async () => {
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*')
      .eq('share_token', token)
      .single();

    if (!recipeData) { setLoading(false); return; }

    const [ingRes, stepsRes] = await Promise.all([
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeData.id).order('position'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', recipeData.id).order('step_number'),
    ]);

    setRecipe({
      ...recipeData,
      ingredients: ingRes.data ?? [],
      steps: stepsRes.data ?? [],
    });
    setLoading(false);
  };

  const handleSaveCopy = async () => {
    if (!user || !recipe) {
      Alert.alert('Sign in', 'You need to sign in to save recipes.');
      return;
    }

    const { data: newRecipe, error } = await supabase
      .from('recipes')
      .insert({
        title: recipe.title,
        user_id: user.id,
        source_type: recipe.source_type,
        photo_url: recipe.photo_url,
      })
      .select()
      .single();

    if (error || !newRecipe) {
      Alert.alert('Error', 'Failed to save recipe');
      return;
    }

    if (recipe.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map((ing, i) => ({
          recipe_id: newRecipe.id,
          name: ing.name,
          description: ing.description,
          position: i,
        }))
      );
    }

    if (recipe.steps.length > 0) {
      await supabase.from('recipe_steps').insert(
        recipe.steps.map((step, i) => ({
          recipe_id: newRecipe.id,
          step_number: i + 1,
          instruction: step.instruction,
        }))
      );
    }

    Alert.alert('Saved!', 'Recipe saved to your collection.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/recipes') },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (!recipe) {
    return <View style={styles.center}><Text>Recipe not found or link expired.</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{recipe.title}</Text>

      {user && (
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveCopy}>
          <Text style={styles.saveText}>Save to My Recipes</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>Ingredients</Text>
      {recipe.ingredients.map((ing) => (
        <View key={ing.id} style={styles.ingredientRow}>
          <Text style={styles.ingredientName}>{ing.name}</Text>
          <Text style={styles.ingredientDesc}>{ing.description}</Text>
        </View>
      ))}

      <Text style={styles.section}>Steps</Text>
      {recipe.steps.map((step) => (
        <View key={step.id} style={styles.stepRow}>
          <Text style={styles.stepNum}>{step.step_number}.</Text>
          <Text style={styles.stepText}>{step.instruction}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  saveButton: {
    backgroundColor: '#34c759', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingVertical: 6 },
  ingredientName: { fontSize: 15, fontWeight: '500', marginRight: 8 },
  ingredientDesc: { fontSize: 15, color: '#666' },
  stepRow: { flexDirection: 'row', paddingVertical: 6 },
  stepNum: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
});
```

**Step 2: Test shared recipe link**

1. Share a recipe from the detail screen to get a token
2. Navigate to `/share/{token}`
3. Expected: Recipe is displayed read-only with "Save to My Recipes" button

**Step 3: Commit**

```bash
git add app/share/
git commit -m "feat: add shared recipe view with save-copy functionality"
```

---

## Phase 7: Polish & Final Integration

### Task 17: Sign Out Button + Profile Header

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Step 1: Add sign-out to tab bar**

Update `app/(tabs)/_layout.tsx` to add a sign-out button in the header:
```tsx
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';

export default function TabLayout() {
  const { signOut } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerRight: () => (
          <TouchableOpacity onPress={signOut} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Step 2: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: add sign-out button to tab header"
```

---

### Task 18: Enable Supabase Realtime for Lists

**Files:**
- Create: `supabase/migrations/20260214000001_enable_realtime.sql`

**Step 1: Write realtime migration**

Create `supabase/migrations/20260214000001_enable_realtime.sql`:
```sql
alter publication supabase_realtime add table public.list_items;
alter publication supabase_realtime add table public.list_members;
```

**Step 2: Apply migration**

Run:
```bash
npx supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260214000001_enable_realtime.sql
git commit -m "feat: enable Supabase Realtime for list_items and list_members"
```

---

### Task 19: End-to-End Smoke Test

**No files to create — manual testing checklist.**

**Step 1: Test auth flow**
- Register a new account
- Log out
- Log in with the same account
- Expected: All work without errors

**Step 2: Test recipe CRUD**
- Create a recipe manually (title + ingredients + steps)
- View recipe detail
- Delete a recipe
- Expected: List updates correctly

**Step 3: Test AI recipe creation**
- Create recipe from text (paste a recipe)
- Create recipe from URL (paste a recipe blog URL)
- Create recipe from photo (pick a photo of a recipe)
- Expected: All three produce structured recipes that can be edited and saved

**Step 4: Test shopping lists**
- Create a shopping list
- Add items manually
- Check/uncheck items
- Clear checked items
- Leave list (should delete since you're the only member)

**Step 5: Test recipe → list integration**
- Create a recipe with ingredients
- Open recipe detail → "Add to List" → select a list
- Expected: Ingredients appear in the shopping list

**Step 6: Test sharing**
- Share a recipe (generate share token)
- Open the share link
- Save a copy to your account
- Expected: New recipe appears in your list

**Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
