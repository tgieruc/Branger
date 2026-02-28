# UX Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full UX overhaul — warm empty states with SVG illustrations, toast system, Reanimated animations, haptic feedback, form UX fixes, color consistency, and dead code cleanup.

**Architecture:** New shared components (`EmptyState`, `Toast`, `SkeletonCard`, SVG illustrations) are consumed by existing screens. A `ToastProvider` wraps the app in `_layout.tsx`. Reanimated `Animated.View` replaces `View` where animations are needed. No structural changes to navigation or data flow.

**Tech Stack:** React Native Reanimated (already installed), react-native-svg (to install), expo-haptics (already installed)

---

### Task 1: Install react-native-svg

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npx expo install react-native-svg`
Expected: Package added to package.json dependencies

**Step 2: Verify install**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-native-svg for empty state illustrations"
```

---

### Task 2: Create Toast system

**Files:**
- Create: `src/lib/toast.tsx`
- Create: `src/components/Toast.tsx`
- Modify: `src/app/_layout.tsx`

**Step 1: Create toast context**

Create `src/lib/toast.tsx`:

```tsx
import { createContext, useContext, useCallback, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

type ToastMessage = {
  id: number;
  text: string;
  type: ToastType;
};

type ToastContextValue = {
  toasts: ToastMessage[];
  show: (text: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  show: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
```

**Step 2: Create Toast component**

Create `src/components/Toast.tsx`:

```tsx
import { StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/lib/toast';
import { useColors } from '@/hooks/useColors';

const TYPE_COLORS = {
  success: { light: '#34c759', dark: '#30d158' },
  error: { light: '#ff3b30', dark: '#ff453a' },
  info: { light: '#007AFF', dark: '#0A84FF' },
};

export function ToastContainer() {
  const { toasts } = useToast();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = colors.background === '#000';

  return (
    <>
      {toasts.map((toast) => (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={[
            styles.toast,
            { top: insets.top + 8 },
            { backgroundColor: isDark ? TYPE_COLORS[toast.type].dark : TYPE_COLORS[toast.type].light },
          ]}
        >
          <Animated.Text style={styles.toastText}>{toast.text}</Animated.Text>
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    zIndex: 9999,
    alignItems: 'center',
    maxWidth: 600,
    alignSelf: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
```

**Step 3: Wire ToastProvider into root layout**

Modify `src/app/_layout.tsx` — wrap inside ThemeProvider:

Add import at top:
```tsx
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/Toast';
```

Change the `RootLayout` return to:
```tsx
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NetInfoProvider>
          <ToastProvider>
            <OTAUpdater />
            <AuthGuard>
              <Slot />
            </AuthGuard>
            <ToastContainer />
          </ToastProvider>
        </NetInfoProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All 28 tests pass

**Step 5: Commit**

```bash
git add src/lib/toast.tsx src/components/Toast.tsx src/app/_layout.tsx
git commit -m "feat: add toast notification system with Reanimated animations"
```

---

### Task 3: Create EmptyState component and SVG illustrations

**Files:**
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/illustrations/EmptyCookbook.tsx`
- Create: `src/components/illustrations/EmptyShoppingBag.tsx`
- Create: `src/components/illustrations/EmptyChecklist.tsx`
- Create: `src/components/illustrations/NotFound.tsx`

**Step 1: Create reusable EmptyState wrapper**

Create `src/components/EmptyState.tsx`:

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  illustration: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ illustration, title, subtitle, actionLabel, onAction }: Props) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.illustration}>{illustration}</View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.buttonText }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  illustration: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Step 2: Create EmptyCookbook SVG**

Create `src/components/illustrations/EmptyCookbook.tsx`:

```tsx
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyCookbook({ size = 140 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 140 140" fill="none">
      {/* Book body */}
      <Rect x="25" y="30" width="90" height="85" rx="6" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Book spine */}
      <Rect x="25" y="30" width="12" height="85" rx="3" fill={primary} opacity={0.8} />
      {/* Page lines */}
      <Path d="M50 55 L100 55" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 67 L95 67" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 79 L90 79" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 91 L85 91" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      {/* Steam curves */}
      <G opacity={0.5}>
        <Path d="M65 25 C65 18, 72 18, 72 12" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M78 28 C78 20, 85 20, 85 14" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M91 25 C91 18, 98 18, 98 12" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
      </G>
      {/* Sparkle dots */}
      <Circle cx="55" cy="18" r="2" fill={primary} opacity={0.3} />
      <Circle cx="105" cy="22" r="1.5" fill={primary} opacity={0.3} />
    </Svg>
  );
}
```

**Step 3: Create EmptyShoppingBag SVG**

Create `src/components/illustrations/EmptyShoppingBag.tsx`:

```tsx
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyShoppingBag({ size = 140 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 140 140" fill="none">
      {/* Bag body */}
      <Path d="M30 50 L30 115 C30 119 33 122 37 122 L103 122 C107 122 110 119 110 115 L110 50 Z" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Bag handle */}
      <Path d="M50 50 L50 35 C50 25 60 18 70 18 C80 18 90 25 90 35 L90 50" stroke={primary} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Checklist lines */}
      <Rect x="45" y="65" width="10" height="10" rx="2" stroke={primary} strokeWidth="1.5" fill="none" />
      <Line x1="62" y1="70" x2="95" y2="70" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <Rect x="45" y="85" width="10" height="10" rx="2" stroke={primary} strokeWidth="1.5" fill="none" />
      <Line x1="62" y1="90" x2="90" y2="90" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <Rect x="45" y="105" width="10" height="10" rx="2" stroke={muted} strokeWidth="1.5" fill="none" opacity={0.3} />
      <Line x1="62" y1="110" x2="85" y2="110" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
    </Svg>
  );
}
```

**Step 4: Create EmptyChecklist SVG**

Create `src/components/illustrations/EmptyChecklist.tsx`:

```tsx
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyChecklist({ size = 80 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;

  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Clipboard */}
      <Rect x="15" y="12" width="50" height="60" rx="5" stroke={muted} strokeWidth="2" fill="none" opacity={0.4} />
      {/* Clipboard clip */}
      <Rect x="28" y="8" width="24" height="10" rx="3" fill={primary} opacity={0.6} />
      {/* Empty lines */}
      <Line x1="25" y1="32" x2="55" y2="32" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <Line x1="25" y1="44" x2="50" y2="44" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <Line x1="25" y1="56" x2="45" y2="56" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
    </Svg>
  );
}
```

**Step 5: Create NotFound SVG**

Create `src/components/illustrations/NotFound.tsx`:

```tsx
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function NotFound({ size = 120 }: { size?: number }) {
  const colors = useColors();
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* Plate */}
      <Ellipse cx="60" cy="70" rx="45" ry="12" fill={bg} stroke={muted} strokeWidth="2" />
      <Ellipse cx="60" cy="65" rx="45" ry="12" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Question mark */}
      <Path
        d="M52 40 C52 30, 68 30, 68 40 C68 48, 60 47, 60 55"
        stroke={muted}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      <Circle cx="60" cy="62" r="2" fill={muted} opacity={0.6} />
    </Svg>
  );
}
```

**Step 6: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/components/EmptyState.tsx src/components/illustrations/
git commit -m "feat: add EmptyState component and SVG illustrations"
```

---

### Task 4: Wire empty states into screens

**Files:**
- Modify: `src/app/(tabs)/recipes/index.tsx`
- Modify: `src/app/(tabs)/lists/index.tsx`
- Modify: `src/app/(tabs)/lists/[id].tsx`
- Modify: `src/app/(tabs)/recipes/[id].tsx`
- Modify: `src/app/share/[token].tsx`

**Step 1: Recipes empty state**

In `src/app/(tabs)/recipes/index.tsx`:

Add imports:
```tsx
import { useRouter } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
import { EmptyCookbook } from '@/components/illustrations/EmptyCookbook';
```

Add router: `const router = useRouter();` inside the component (after `const colors = useColors();`).

Replace the `ListEmptyComponent` (the `<Text>` element) with:
```tsx
ListEmptyComponent={
  searchQuery.length > 0 ? (
    <Text style={[styles.empty, { color: colors.textTertiary }]}>
      No recipes match your search.
    </Text>
  ) : (
    <EmptyState
      illustration={<EmptyCookbook />}
      title="Your cookbook is empty"
      subtitle="Import a recipe from a URL, photo, or add one manually"
      actionLabel="Add Your First Recipe"
      onAction={() => router.push('/(tabs)/recipes/create')}
    />
  )
}
```

Also add `backgroundColor: colors.background` to the loading center state:
```tsx
if (loading) {
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}
```

**Step 2: Lists empty state**

In `src/app/(tabs)/lists/index.tsx`:

Add imports:
```tsx
import { EmptyState } from '@/components/EmptyState';
import { EmptyShoppingBag } from '@/components/illustrations/EmptyShoppingBag';
```

Replace `ListEmptyComponent`:
```tsx
ListEmptyComponent={
  <EmptyState
    illustration={<EmptyShoppingBag />}
    title="No shopping lists yet"
    subtitle="Create a list and add ingredients from your recipes"
    actionLabel="Create a List"
    onAction={() => setShowCreate(true)}
  />
}
```

Add background to loading state: `<View style={[styles.center, { backgroundColor: colors.background }]}>`.

**Step 3: List detail empty state**

In `src/app/(tabs)/lists/[id].tsx`:

Add imports:
```tsx
import { EmptyChecklist } from '@/components/illustrations/EmptyChecklist';
```

Add `ListEmptyComponent` to the FlatList (it currently has none):
```tsx
ListEmptyComponent={
  <View style={styles.emptyList}>
    <EmptyChecklist />
    <Text style={[styles.emptyListText, { color: colors.textTertiary }]}>
      This list is empty. Add items below!
    </Text>
  </View>
}
```

Add styles:
```tsx
emptyList: { alignItems: 'center', paddingTop: 64 },
emptyListText: { fontSize: 15, marginTop: 16, textAlign: 'center' },
```

Add background to loading state: `<View style={[styles.center, { backgroundColor: colors.background }]}>`.

**Step 4: Recipe detail not-found state**

In `src/app/(tabs)/recipes/[id].tsx`:

Add imports:
```tsx
import { EmptyState } from '@/components/EmptyState';
import { NotFound } from '@/components/illustrations/NotFound';
```

Replace the not-found block (lines 169-174):
```tsx
if (!recipe) {
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <EmptyState
        illustration={<NotFound />}
        title="Recipe not found"
        subtitle="This recipe may have been deleted"
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
    </View>
  );
}
```

Add background to loading state: `<View style={[styles.center, { backgroundColor: colors.background }]}>`.

**Step 5: Shared recipe error state**

In `src/app/share/[token].tsx`:

Add imports:
```tsx
import { EmptyState } from '@/components/EmptyState';
import { NotFound } from '@/components/illustrations/NotFound';
```

Replace the not-found block (line 98-99):
```tsx
if (!recipe) {
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <EmptyState
        illustration={<NotFound />}
        title="Recipe not found"
        subtitle="This recipe may have been deleted or the link has expired"
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
    </View>
  );
}
```

Add background to loading state: `<View style={[styles.center, { backgroundColor: colors.background }]}>`.

**Step 6: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/app/
git commit -m "feat: add warm empty states with SVG illustrations to all screens"
```

---

### Task 5: Update ConfirmDialog with destructive prop

**Files:**
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/app/(tabs)/settings/index.tsx`

**Step 1: Add destructive prop**

In `src/components/ConfirmDialog.tsx`, update the Props type:
```tsx
type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
```

Update the component signature:
```tsx
export default function ConfirmDialog({
  visible, title, message, confirmLabel = 'Delete', destructive = true, onConfirm, onCancel,
}: Props) {
```

Change the confirm button background:
```tsx
<TouchableOpacity style={[styles.confirmBtn, { backgroundColor: destructive ? colors.danger : colors.primary }]} onPress={onConfirm}>
```

**Step 2: Use non-destructive for sign out**

In `src/app/(tabs)/settings/index.tsx`, update the ConfirmDialog:
```tsx
<ConfirmDialog
  visible={logoutVisible}
  title="Sign Out"
  message="Are you sure you want to sign out?"
  confirmLabel="Sign Out"
  destructive={false}
  onConfirm={() => { setLogoutVisible(false); signOut(); }}
  onCancel={() => setLogoutVisible(false)}
/>
```

**Step 3: Run tests & commit**

Run: `npm test`

```bash
git add src/components/ConfirmDialog.tsx src/app/\(tabs\)/settings/index.tsx
git commit -m "feat: add destructive prop to ConfirmDialog for non-destructive actions"
```

---

### Task 6: Login and Register UX polish

**Files:**
- Modify: `src/app/login.tsx`
- Modify: `src/app/register.tsx`
- Modify: `src/app/(tabs)/settings/change-password.tsx`

**Step 1: Update login.tsx**

Replace the full file content with password toggle, keyboard flow, and textContentType:

Add `useRef` to the `react` import. Add `View` to the react-native import. Add `Ionicons` import:
```tsx
import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
```

Add state and ref inside the component:
```tsx
const [showPassword, setShowPassword] = useState(false);
const passwordRef = useRef<TextInput>(null);
```

Update the email TextInput — add:
```
returnKeyType="next"
textContentType="emailAddress"
onSubmitEditing={() => passwordRef.current?.focus()}
blurOnSubmit={false}
```

Replace the password TextInput with a View wrapper:
```tsx
<View style={[styles.inputRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
  <TextInput
    ref={passwordRef}
    style={[styles.inputInner, { color: colors.text }]}
    placeholder="Password"
    placeholderTextColor={colors.placeholder}
    value={password}
    onChangeText={setPassword}
    secureTextEntry={!showPassword}
    returnKeyType="done"
    textContentType="password"
    onSubmitEditing={handleLogin}
  />
  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textTertiary} />
  </TouchableOpacity>
</View>
```

Fix buttonText style — change `color: '#fff'` to remove the hardcode (use inline instead):
```tsx
<Text style={[styles.buttonText, { color: colors.buttonText }]}>...</Text>
```

Add styles:
```tsx
inputRow: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderRadius: 8,
  marginBottom: 16,
},
inputInner: {
  flex: 1,
  padding: 12,
  fontSize: 16,
},
eyeButton: {
  padding: 12,
},
```

Update buttonText style to remove `color`:
```tsx
buttonText: { fontSize: 16, fontWeight: '600' },
```

**Step 2: Update register.tsx**

Same pattern as login — add `useRef`, `Ionicons`, `View` imports.

Add states:
```tsx
const [showPassword, setShowPassword] = useState(false);
const [showConfirm, setShowConfirm] = useState(false);
const passwordRef = useRef<TextInput>(null);
const confirmRef = useRef<TextInput>(null);
```

Email field: add `returnKeyType="next"`, `textContentType="emailAddress"`, `onSubmitEditing={() => passwordRef.current?.focus()}`, `blurOnSubmit={false}`.

Password field: wrap in View with eye toggle (same pattern), add `textContentType="newPassword"`, `returnKeyType="next"`, `onSubmitEditing={() => confirmRef.current?.focus()}`.

After the password input View, add a hint:
```tsx
<Text style={[styles.hint, { color: colors.textTertiary }]}>At least 6 characters</Text>
```

Confirm field: wrap in View with eye toggle, `textContentType="newPassword"`, `returnKeyType="done"`, `onSubmitEditing={handleRegister}`.

After successful register, navigate to login:
```tsx
if (error) {
  Alert.alert('Error', error.message);
} else {
  router.replace('/login');
}
```

Add `useRouter` import from `expo-router` and `const router = useRouter();` in component. Remove the Alert.alert for success (replaced by toast — but toast won't work here since login screen is outside the auth group. For now, use `Alert.alert` to show success before navigating).

Actually, keep the Alert for registration success since it's important, but then navigate:
```tsx
} else {
  Alert.alert('Success', 'Check your email to confirm your account', [
    { text: 'OK', onPress: () => router.replace('/login') },
  ]);
}
```

Add the same styles as login (`inputRow`, `inputInner`, `eyeButton`), plus:
```tsx
hint: { fontSize: 13, marginTop: -10, marginBottom: 16 },
```

Fix buttonText: `{ fontSize: 16, fontWeight: '600' }` (remove hardcoded `color: '#fff'`), and use `colors.buttonText` inline.

**Step 3: Update change-password.tsx**

Same pattern — add `useRef`, `Ionicons`, `View` imports.

Add states:
```tsx
const [showCurrent, setShowCurrent] = useState(false);
const [showNew, setShowNew] = useState(false);
const [showConfirm, setShowConfirm] = useState(false);
const newRef = useRef<TextInput>(null);
const confirmRef = useRef<TextInput>(null);
```

Wrap each password field in a View with eye toggle. Add `returnKeyType="next"` / `"done"` chain.

Fix `buttonText` style: remove `color: '#fff'`, use `{ color: colors.buttonText }` inline.

**Step 4: Run tests & commit**

Run: `npm test`

```bash
git add src/app/login.tsx src/app/register.tsx src/app/\(tabs\)/settings/change-password.tsx
git commit -m "feat: add password toggles, keyboard flow, and AutoFill hints to auth forms"
```

---

### Task 7: Fix color consistency — remove aiPurple from action buttons

**Files:**
- Modify: `src/app/(tabs)/recipes/create.tsx`

**Step 1: Replace aiPurple with primary on buttons**

In `src/app/(tabs)/recipes/create.tsx`, find the two AI buttons:

Change `backgroundColor: colors.aiPurple` to `backgroundColor: colors.primary` in both:
- The "Generate Recipe" button (text mode)
- The "Import Recipe" button (url mode)

Search for `colors.aiPurple` and replace with `colors.primary` (2 occurrences).

**Step 2: Verify & commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/\(tabs\)/recipes/create.tsx
git commit -m "fix: unify AI import button colors to primary blue"
```

---

### Task 8: Fix stable keys in create/edit recipe

**Files:**
- Modify: `src/app/(tabs)/recipes/create.tsx`
- Modify: `src/app/(tabs)/recipes/edit/[id].tsx`

**Step 1: Update create.tsx**

Add `import * as Crypto from 'expo-crypto';` at the top.

Change the Ingredient and Step types to include an `id`:
```tsx
type Ingredient = { id: string; name: string; description: string };
type Step = { id: string; instruction: string };
```

Update initial state:
```tsx
const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: Crypto.randomUUID(), name: '', description: '' }]);
const [steps, setSteps] = useState<Step[]>([{ id: Crypto.randomUUID(), instruction: '' }]);
```

Update `populateFromAI`:
```tsx
setIngredients(
  result.ingredients.length > 0
    ? result.ingredients.map((i) => ({ ...i, id: Crypto.randomUUID() }))
    : [{ id: Crypto.randomUUID(), name: '', description: '' }]
);
setSteps(
  result.steps.length > 0
    ? result.steps.map((s) => ({ id: Crypto.randomUUID(), instruction: s }))
    : [{ id: Crypto.randomUUID(), instruction: '' }]
);
```

Update `addIngredient`:
```tsx
const addIngredient = () => setIngredients([...ingredients, { id: Crypto.randomUUID(), name: '', description: '' }]);
```

Update `addStep`:
```tsx
const addStep = () => setSteps([...steps, { id: Crypto.randomUUID(), instruction: '' }]);
```

Update `removeIngredient` and `removeStep` to filter by `id`:
```tsx
const removeIngredient = (id: string) => setIngredients(ingredients.filter((ing) => ing.id !== id));
const removeStep = (id: string) => setSteps(steps.filter((s) => s.id !== id));
```

Change `key={i}` to `key={ing.id}` and `key={step.id}` in the JSX maps.

Update the remove button onPress to use `ing.id` / `step.id` instead of index.

**Step 2: Update edit/[id].tsx**

Apply the same pattern. The edit screen fetches ingredients from the DB which already have `id` fields, so just ensure the type matches and new items get UUIDs.

**Step 3: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/recipes/create.tsx src/app/\(tabs\)/recipes/edit/
git commit -m "fix: use stable UUID keys for ingredient and step lists"
```

---

### Task 9: Wire HapticTab into tab bar

**Files:**
- Modify: `src/app/(tabs)/_layout.tsx`

**Step 1: Add import and tabBarButton**

Add import:
```tsx
import { HapticTab } from '@/components/haptic-tab';
```

Add `tabBarButton: HapticTab` to the `screenOptions`:
```tsx
screenOptions={{
  tabBarActiveTintColor: colors.primary,
  tabBarStyle: { backgroundColor: colors.tabBarBackground, borderTopColor: colors.tabBarBorder },
  sceneStyle: { backgroundColor: colors.background },
  tabBarButton: HapticTab,
}}
```

**Step 2: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/_layout.tsx
git commit -m "feat: wire HapticTab for iOS haptic feedback on tab presses"
```

---

### Task 10: FAB safe area and RecipeCard improvements

**Files:**
- Modify: `src/app/(tabs)/recipes/index.tsx`
- Modify: `src/app/(tabs)/lists/index.tsx`
- Modify: `src/components/RecipeCard.tsx`

**Step 1: FAB safe area in recipes**

In `src/app/(tabs)/recipes/index.tsx`:

Add import:
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

Inside component:
```tsx
const insets = useSafeAreaInsets();
```

Update the FAB style — change `styles.fab` to include dynamic bottom:
```tsx
style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.primary, bottom: Math.max(24, insets.bottom + 8) }])}
```

**Step 2: FAB safe area in lists**

Same pattern in `src/app/(tabs)/lists/index.tsx` — add `useSafeAreaInsets`, update FAB bottom.

Also update the `createRow` bottom margin to account for safe area.

**Step 3: RecipeCard uniform height**

In `src/components/RecipeCard.tsx`:

Add a min height to the card and a placeholder when no photo:
```tsx
{recipe.photo_url ? (
  <Image source={{ uri: recipe.photo_url }} style={styles.image} />
) : (
  <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
    <Ionicons name="restaurant-outline" size={28} color={colors.textTertiary} />
  </View>
)}
```

Add import: `import { Ionicons } from '@expo/vector-icons';`

Add style:
```tsx
imagePlaceholder: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
```

**Step 4: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/recipes/index.tsx src/app/\(tabs\)/lists/index.tsx src/components/RecipeCard.tsx
git commit -m "feat: add FAB safe area insets and uniform recipe card height"
```

---

### Task 11: List detail improvements — clear-checked confirm and pull-to-refresh

**Files:**
- Modify: `src/app/(tabs)/lists/[id].tsx`

**Step 1: Add confirmation for clear checked**

Add a new state:
```tsx
const [clearCheckedVisible, setClearCheckedVisible] = useState(false);
```

Change the "Clear checked" button onPress:
```tsx
<TouchableOpacity onPress={() => setClearCheckedVisible(true)} style={styles.clearChecked}>
```

Add a new ConfirmDialog at the bottom of the JSX:
```tsx
<ConfirmDialog
  visible={clearCheckedVisible}
  title="Clear Checked Items"
  message={`Remove ${checkedCount} checked item${checkedCount !== 1 ? 's' : ''} from the list?`}
  confirmLabel="Clear"
  onConfirm={() => { setClearCheckedVisible(false); clearChecked(); }}
  onCancel={() => setClearCheckedVisible(false)}
/>
```

**Step 2: Add RefreshControl**

Add `RefreshControl` to imports. Add state:
```tsx
const [refreshing, setRefreshing] = useState(false);
```

Add to FlatList:
```tsx
refreshControl={
  <RefreshControl refreshing={refreshing} onRefresh={async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }} />
}
```

**Step 3: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/lists/\[id\].tsx
git commit -m "feat: add clear-checked confirmation and pull-to-refresh to list detail"
```

---

### Task 12: Replace Alert.alert with toasts for success messages

**Files:**
- Modify: `src/app/(tabs)/recipes/create.tsx`
- Modify: `src/app/(tabs)/recipes/[id].tsx`
- Modify: `src/app/(tabs)/settings/change-password.tsx`

**Step 1: Create recipe — toast after save**

In `src/app/(tabs)/recipes/create.tsx`:

Add import: `import { useToast } from '@/lib/toast';`
Add in component: `const toast = useToast();`

At the end of `handleSave`, before `router.back()`:
```tsx
toast.show('Recipe saved!');
```

After AI `populateFromAI` call, add:
```tsx
toast.show('Recipe imported! Review and save.', 'info');
```

(Add this inside the `try` blocks of `handleAiText`, `handleAiUrl`, and `processPhotoResult`, right after `populateFromAI(...)`)

**Step 2: Recipe detail — toast after add to list**

In `src/app/(tabs)/recipes/[id].tsx`:

Add import: `import { useToast } from '@/lib/toast';`
Add in component: `const toast = useToast();`

Replace `Alert.alert('Done', ...)` in `addIngredientsToList` with:
```tsx
toast.show(`Added ${recipe.ingredients.length} items to ${list.name}`);
```

**Step 3: Change password — toast after success**

In `src/app/(tabs)/settings/change-password.tsx`:

Add import: `import { useToast } from '@/lib/toast';`
Add in component: `const toast = useToast();`

Replace the success Alert.alert with:
```tsx
toast.show('Password changed successfully!');
router.back();
```

**Step 4: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/recipes/create.tsx src/app/\(tabs\)/recipes/\[id\].tsx src/app/\(tabs\)/settings/change-password.tsx
git commit -m "feat: replace blocking Alert.alert with toast for success messages"
```

---

### Task 13: Recipe detail — list picker empty text and loading state

**Files:**
- Modify: `src/app/(tabs)/recipes/[id].tsx`

**Step 1: Add empty text in list picker modal**

In the modal content, before the `availableLists.map(...)`, add:
```tsx
{availableLists.length === 0 && !showNewListInput && (
  <Text style={[styles.modalEmptyText, { color: colors.textTertiary }]}>
    You don't have any lists yet. Create one below!
  </Text>
)}
```

Add style:
```tsx
modalEmptyText: { fontSize: 15, textAlign: 'center', paddingVertical: 12 },
```

**Step 2: Add loading state to add-to-list**

Add state: `const [addingToList, setAddingToList] = useState(false);`

In `addIngredientsToList`, wrap the async operation:
```tsx
const addIngredientsToList = async (list: ListOption) => {
  if (!recipe || addingToList) return;
  setAddingToList(true);
  setListPickerVisible(false);
  // ... existing code ...
  setAddingToList(false);
};
```

Add `disabled={addingToList}` and opacity to the "Add to Shopping List" button:
```tsx
<TouchableOpacity
  onPress={handleAddToList}
  disabled={addingToList}
  style={[styles.addToListButton, { backgroundColor: colors.addToListBg, borderColor: colors.addToListBorder }, addingToList && { opacity: 0.6 }]}
  ...
```

**Step 3: Commit**

```bash
git add src/app/\(tabs\)/recipes/\[id\].tsx
git commit -m "feat: improve list picker with empty state text and loading state"
```

---

### Task 14: Animated settings theme toggle

**Files:**
- Modify: `src/app/(tabs)/settings/index.tsx`

**Step 1: Add animated sliding indicator**

Add imports:
```tsx
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
```

Inside the component, calculate the indicator position:
```tsx
const themeIndex = THEME_OPTIONS.findIndex((o) => o.value === preference);
```

Add animated style:
```tsx
const indicatorStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: withTiming(themeIndex * segmentWidth, { duration: 200 }) }],
}));
```

You'll need to measure the segment width. Use a simple approach with fixed layout:

Replace the segment control content to include an animated indicator behind the buttons:
```tsx
<View style={[styles.segmentControl, { backgroundColor: colors.backgroundSecondary }]}>
  <Animated.View
    style={[
      styles.segmentIndicator,
      { backgroundColor: colors.card },
      indicatorStyle,
    ]}
  />
  {THEME_OPTIONS.map((option) => {
    const selected = preference === option.value;
    return (
      <TouchableOpacity
        key={option.value}
        style={styles.segmentButton}
        onPress={() => setPreference(option.value)}
        accessibilityLabel={`Theme: ${option.label}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Text
          style={[
            styles.segmentText,
            { color: colors.textSecondary },
            selected && { color: colors.text, fontWeight: '600' },
          ]}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>
```

Add constant: `const segmentWidth = 56;` (matches paddingHorizontal 14 * 2 + rough text width).

Actually, a simpler approach: each segment button has equal flex, so the indicator width = 1/3 of the control. Use `onLayout` to measure:

Simpler: use a percentage-based approach. Each button is `flex: 1` inside the segmentControl. The indicator is `width: '33.33%'` and translates by `index * 33.33%`.

Update styles:
```tsx
segmentControl: {
  flexDirection: 'row',
  borderRadius: 8,
  padding: 2,
  position: 'relative',
},
segmentIndicator: {
  position: 'absolute',
  top: 2,
  bottom: 2,
  left: 2,
  width: '32%',
  borderRadius: 6,
  ...shadow(1, 2, 0.1),
},
segmentButton: {
  flex: 1,
  paddingVertical: 6,
  borderRadius: 6,
  alignItems: 'center',
},
```

Remove `segmentSelected` style (no longer needed).

Update the animated style to use percentage:
```tsx
const indicatorStyle = useAnimatedStyle(() => {
  const controlWidth = 3; // 3 options
  return {
    left: withTiming(2 + (themeIndex * (100 - 4) / controlWidth) * 0.01 * 200, { duration: 200 }),
  };
});
```

Actually this is getting complex. Simplest reliable approach — use `left` as a fraction:

```tsx
const SEGMENT_COUNT = THEME_OPTIONS.length;

const indicatorStyle = useAnimatedStyle(() => ({
  left: withTiming(2 + themeIndex * (1 / SEGMENT_COUNT) * 100, { duration: 200 }),
}));
```

This won't work well with absolute values. Let me use the simplest approach:

Use `useSharedValue` and calculate width via `onLayout`:

```tsx
import { useSharedValue } from 'react-native-reanimated';

const [controlWidth, setControlWidth] = useState(0);

const indicatorStyle = useAnimatedStyle(() => {
  if (controlWidth === 0) return {};
  const segWidth = (controlWidth - 4) / THEME_OPTIONS.length;
  return {
    width: segWidth,
    transform: [{ translateX: withTiming(themeIndex * segWidth, { duration: 200 }) }],
  };
});
```

On the segmentControl View, add:
```tsx
onLayout={(e) => setControlWidth(e.nativeEvent.layout.width)}
```

**Step 2: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/settings/index.tsx
git commit -m "feat: add animated sliding indicator to theme segment control"
```

---

### Task 15: Dirty state detection for create recipe

**Files:**
- Modify: `src/app/(tabs)/recipes/create.tsx`

**Step 1: Add dirty state tracking with navigation guard**

Add import:
```tsx
import { useNavigation } from 'expo-router';
```

Inside the component, add:
```tsx
const navigation = useNavigation();
const isDirty = useRef(false);

// Track dirty state
useEffect(() => {
  isDirty.current = title.trim() !== '' || ingredients.some(i => i.name.trim() !== '') || steps.some(s => s.instruction.trim() !== '');
}, [title, ingredients, steps]);

// Navigation guard
useEffect(() => {
  const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
    if (!isDirty.current || saving) return;
    e.preventDefault();
    Alert.alert('Discard changes?', 'You have unsaved changes. Are you sure you want to leave?', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
    ]);
  });
  return unsubscribe;
}, [navigation, saving]);
```

At the end of `handleSave`, before `router.back()`, reset dirty:
```tsx
isDirty.current = false;
router.back();
```

**Step 2: Run tests & commit**

Run: `npm test`

```bash
git add src/app/\(tabs\)/recipes/create.tsx
git commit -m "feat: add unsaved changes warning to create recipe screen"
```

---

### Task 16: Delete dead Expo template files

**Files:**
- Delete: `src/components/hello-wave.tsx`
- Delete: `src/components/parallax-scroll-view.tsx`
- Delete: `src/components/themed-text.tsx`
- Delete: `src/components/themed-view.tsx`
- Delete: `src/components/ui/collapsible.tsx`
- Delete: `src/components/ui/icon-symbol.tsx`
- Delete: `src/components/ui/icon-symbol.ios.tsx`
- Delete: `src/components/external-link.tsx`
- Delete: `src/hooks/use-color-scheme.ts`
- Delete: `src/hooks/use-color-scheme.web.ts`
- Delete: `src/hooks/use-theme-color.ts`

**Step 1: Verify no imports reference these files**

Run: `grep -r "hello-wave\|parallax-scroll-view\|themed-text\|themed-view\|collapsible\|icon-symbol\|external-link\|use-color-scheme\|use-theme-color" src/app/ src/lib/ --include="*.tsx" --include="*.ts"`

Expected: No results (these are only referenced by each other or not at all)

**Step 2: Delete files**

```bash
rm src/components/hello-wave.tsx \
   src/components/parallax-scroll-view.tsx \
   src/components/themed-text.tsx \
   src/components/themed-view.tsx \
   src/components/external-link.tsx
rm src/components/ui/collapsible.tsx \
   src/components/ui/icon-symbol.tsx \
   src/components/ui/icon-symbol.ios.tsx
rm src/hooks/use-color-scheme.ts \
   src/hooks/use-color-scheme.web.ts \
   src/hooks/use-theme-color.ts
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused Expo template boilerplate files"
```

---

### Task 17: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Visual verification**

Run: `npm start` — open on web/simulator and verify:
- [ ] Empty recipes screen shows cookbook illustration + CTA
- [ ] Empty lists screen shows shopping bag illustration + CTA
- [ ] Login has password toggle and keyboard flows
- [ ] AI buttons are blue (not purple)
- [ ] Tab bar has haptic feedback (iOS only)
- [ ] FABs don't overlap home indicator
- [ ] Recipe cards have uniform height
- [ ] Toast appears after saving a recipe
- [ ] Settings theme toggle slides smoothly
- [ ] Dark mode: no white flashes on loading states
