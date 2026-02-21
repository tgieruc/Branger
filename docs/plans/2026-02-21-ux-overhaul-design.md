# UX Overhaul Design - Branger App

**Date:** 2026-02-21
**Status:** Approved
**Style direction:** Warm & friendly (rounded cards, soft colors, SVG illustrations)
**Animation library:** React Native Reanimated

---

## Problem Statement

The current UI is functional but feels bare-bones:
- Empty states show plain gray text on vast white backgrounds
- No animations, transitions, or micro-interactions anywhere
- Only feedback mechanism is blocking `Alert.alert()` dialogs
- Login/Register forms miss basic UX conventions (password toggle, keyboard flow)
- Inconsistent colors (blue vs purple buttons), dark mode white flashes
- Dead Expo template code cluttering the codebase

## Design Principles

1. **Warm first impression** — Empty states should feel inviting, not barren
2. **Non-blocking feedback** — Toast for success, Alert only for errors/destructive actions
3. **Smooth motion** — Reanimated for list transitions, FAB interactions, modals
4. **Platform-native feel** — iOS AutoFill, haptic feedback, safe area awareness
5. **Consistency** — Unified color usage, standardized loading/error states

---

## Tier 1: First Impressions & Empty States

### 1.1 SVG Empty State Illustrations

Create custom SVG components in `src/components/illustrations/`:

| Screen | Illustration | Title | Subtitle | CTA |
|--------|-------------|-------|----------|-----|
| Recipes (empty) | Open cookbook with steam/sparkles | "Your cookbook is empty" | "Import a recipe from a URL, photo, or add one manually" | "Add Your First Recipe" → create |
| Lists (empty) | Shopping bag with checklist | "No shopping lists yet" | "Create a list and add ingredients from your recipes" | "Create a List" |
| List detail (no items) | Small empty checklist | "This list is empty" | "Add items below!" | (none, input is visible) |
| Recipe not found | Question mark on plate | "Recipe not found" | "This recipe may have been deleted" | "Go Back" |
| Shared recipe error | Same as above | "Recipe not found" | — | "Go Back" |

Each SVG uses theme colors via `useColors()` so they adapt to light/dark mode.

### 1.2 Login/Register Polish

- **Password visibility toggle**: Eye/eye-off icon button inside password fields
- **Keyboard flow**: `returnKeyType="next"` on email → focuses password field; `returnKeyType="done"` on password → submits
- **iOS AutoFill**: `textContentType="emailAddress"`, `textContentType="password"`, `textContentType="newPassword"` on register
- **Register**: Password strength hint ("At least 6 characters") below password field
- **Post-register**: Navigate to login screen + toast "Check your email to confirm your account"

### 1.3 Color Consistency

- Unify all primary action buttons to `#007AFF` (the existing `colors.primary`)
- Remove the purple color from "Generate Recipe" and "Import Recipe" buttons
- Replace all hardcoded `color: '#fff'` in button text with `colors.buttonText`

---

## Tier 2: Polish & Micro-Interactions

### 2.1 React Native Reanimated

**Install:** `npx expo install react-native-reanimated`

**Animations to add:**
- `FadeInDown` / `FadeOutUp` on FlatList items (recipes, list items)
- `Layout` animation for smooth reordering when items are added/removed
- FAB: `withSpring` scale-down on press, subtle entrance bounce
- Modal content: `SlideInUp` for ConfirmDialog and list picker modal
- Settings theme toggle: sliding indicator with `withTiming`

### 2.2 Toast System

New component: `src/components/Toast.tsx`
New context: `src/lib/toast.tsx` providing `useToast()` hook

```
useToast().show("Recipe saved!", "success")
useToast().show("Failed to save", "error")
```

- Slides in from top, auto-dismisses after 3 seconds
- Color-coded: green for success, red for error, blue for info
- Replace `Alert.alert()` for all non-blocking success messages

**Screens affected:** create recipe save, edit recipe save, add to list, delete item, share recipe, register success, change password success

### 2.3 Haptic Feedback

- Wire existing `src/components/haptic-tab.tsx` into tab bar via `tabBarButton: HapticTab`
- Add `Haptics.impactAsync(ImpactFeedbackStyle.Light)` on: list item check/uncheck, save recipe, add ingredient/step
- Add `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` on: delete confirmations

### 2.4 Loading State Fixes

- All `styles.center` patterns get `backgroundColor: colors.background`
- Skeleton loading for recipe cards: gray pulsing rectangles matching card layout
- Image loading: gray placeholder that cross-fades to actual image using Reanimated

---

## Tier 3: Form UX & Flow Improvements

### 3.1 Create/Edit Recipe

- **Dirty state tracking**: Track changes via a `isDirty` ref, intercept back navigation with `beforeRemove` event
- **Stable keys**: Replace `key={i}` with UUID-based keys (`crypto.randomUUID()` on add)
- **AI import feedback**: Toast "Recipe imported! Review and save." after AI fills the form
- **Photo preview**: Show selected photo in the Photo mode before triggering AI processing, with a "Process" button
- **URL validation**: Basic URL format check before submit, inline error message

### 3.2 Recipe Detail

- List picker modal: Show "You don't have any lists yet" text when `availableLists` is empty
- Add loading state to "Add to List" action (disable button while processing)
- Image: Add `resizeMode="cover"` explicitly + loading placeholder

### 3.3 List Detail

- Empty state when list has no items (small inline illustration + text)
- `clearChecked`: Add ConfirmDialog before bulk delete
- Add `RefreshControl` for pull-to-refresh as Realtime fallback

### 3.4 Settings

- Animated segment control: Sliding background indicator using `Animated.View` with `withTiming`

### 3.5 Misc Fixes

- FABs: Use `useSafeAreaInsets().bottom` for position offset
- ConfirmDialog: Add `destructive?: boolean` prop. Red confirm button when `destructive=true`, primary blue when `false`
- Recipe card: Uniform height with placeholder for cards without photos
- Fix `handleShare` to use web URLs for sharing (not `branger://` deep links)

### 3.6 Dead Code Cleanup

Delete unused Expo template files:
- `src/components/hello-wave.tsx`
- `src/components/parallax-scroll-view.tsx`
- `src/components/themed-text.tsx`
- `src/components/themed-view.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/icon-symbol.tsx` + `.ios.tsx`
- `src/components/external-link.tsx`
- `src/hooks/use-color-scheme.ts` + `.web.ts`
- `src/hooks/use-theme-color.ts`

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/illustrations/EmptyCookbook.tsx` | SVG for recipes empty state |
| `src/components/illustrations/EmptyShoppingBag.tsx` | SVG for lists empty state |
| `src/components/illustrations/EmptyChecklist.tsx` | SVG for list detail empty state |
| `src/components/illustrations/NotFound.tsx` | SVG for error states |
| `src/components/Toast.tsx` | Toast notification component |
| `src/lib/toast.tsx` | Toast context + useToast hook |
| `src/components/EmptyState.tsx` | Reusable empty state wrapper (illustration + title + subtitle + CTA) |
| `src/components/SkeletonCard.tsx` | Skeleton loading placeholder for recipe cards |

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/_layout.tsx` | Add ToastProvider, add Reanimated config |
| `src/app/login.tsx` | Password toggle, keyboard flow, textContentType |
| `src/app/register.tsx` | Same + password hint + post-register navigation |
| `src/app/(tabs)/_layout.tsx` | Wire HapticTab into tab bar |
| `src/app/(tabs)/recipes/index.tsx` | Empty state component, skeleton loading, FAB safe area, item animations |
| `src/app/(tabs)/recipes/[id].tsx` | Image placeholder, list picker empty text, loading states |
| `src/app/(tabs)/recipes/create.tsx` | Color fix, stable keys, dirty state, AI feedback toast, photo preview, URL validation |
| `src/app/(tabs)/recipes/edit/[id].tsx` | Same as create + photo upload state |
| `src/app/(tabs)/lists/index.tsx` | Empty state, FAB safe area, item animations |
| `src/app/(tabs)/lists/[id].tsx` | Empty state, clear-checked confirm, pull-to-refresh, haptics |
| `src/app/(tabs)/settings/index.tsx` | Animated theme toggle |
| `src/app/(tabs)/settings/change-password.tsx` | Password toggle, toast on success |
| `src/app/share/[token].tsx` | Error empty state, loading background |
| `src/components/ConfirmDialog.tsx` | Add destructive prop, modal animation |
| `src/components/RecipeCard.tsx` | Uniform height, image placeholder |

## Files to Delete

- `src/components/hello-wave.tsx`
- `src/components/parallax-scroll-view.tsx`
- `src/components/themed-text.tsx`
- `src/components/themed-view.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/icon-symbol.tsx`
- `src/components/ui/icon-symbol.ios.tsx`
- `src/components/external-link.tsx`
- `src/hooks/use-color-scheme.ts`
- `src/hooks/use-color-scheme.web.ts`
- `src/hooks/use-theme-color.ts`
