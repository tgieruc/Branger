# OAuth 2.1 for MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Supabase's built-in OAuth 2.1 server so Claude Cowork (and any OAuth-capable MCP client) can authenticate against the Branger MCP server.

**Architecture:** Supabase Auth acts as the OAuth 2.1 Authorization Server. We build a consent screen as an Expo Web route. The MCP server accepts both `brg_` API tokens (existing) and Supabase JWTs (new, from OAuth flow). JWT users are identified via the `sub` claim and use the same service role + manual filtering approach.

**Tech Stack:** Supabase OAuth 2.1 (beta), `@supabase/supabase-js` (may need update for `supabase.auth.oauth.*` methods), jose JWKS verification in the MCP edge function, Expo Router web route for consent UI.

---

### Task 1: Enable OAuth 2.1 in Supabase Dashboard (manual)

**No code — dashboard configuration only.**

**Step 1: Enable OAuth 2.1 server**

1. Go to Supabase Dashboard → Authentication → OAuth Server
2. Toggle "Enable OAuth 2.1 server capabilities" ON
3. Note the endpoints:
   - Authorization: `https://jeboglcuuutpwymxcejn.supabase.co/auth/v1/oauth/authorize`
   - Token: `https://jeboglcuuutpwymxcejn.supabase.co/auth/v1/oauth/token`
   - Discovery: `https://jeboglcuuutpwymxcejn.supabase.co/.well-known/oauth-authorization-server/auth/v1`

**Step 2: Enable Dynamic Client Registration**

1. Same page → enable Dynamic Client Registration
2. This allows Claude Cowork to auto-register as an OAuth client

**Step 3: Set Authorization Path**

1. Set the Authorization Path to: `/oauth/consent`
2. Ensure the Site URL (Authentication → URL Configuration) is set to your app's web URL (e.g., `https://branger.app` or your current web deploy URL)

**Step 4: Verify discovery endpoint**

```bash
curl -s https://jeboglcuuutpwymxcejn.supabase.co/.well-known/oauth-authorization-server/auth/v1 | python3 -m json.tool
```

Expected: JSON with `authorization_endpoint`, `token_endpoint`, `jwks_uri`, etc.

---

### Task 2: Update `@supabase/supabase-js` if needed

**Files:**
- Modify: `package.json`

The `supabase.auth.oauth.*` methods (`getAuthorizationDetails`, `approveAuthorization`, `denyAuthorization`) may require a newer version of `@supabase/supabase-js`. Current version is `^2.95.3`.

**Step 1: Check if `supabase.auth.oauth` exists**

```bash
node -e "const { createClient } = require('@supabase/supabase-js'); const c = createClient('http://x', 'x'); console.log(typeof c.auth.oauth)"
```

If `undefined`, update:

```bash
npm install @supabase/supabase-js@latest
```

**Step 2: Run tests to verify no regressions**

```bash
npm test
```

**Step 3: Commit if updated**

```bash
git add package.json package-lock.json
git commit -m "chore: update @supabase/supabase-js for OAuth 2.1 support"
```

---

### Task 3: Add OAuth consent route to AuthGuard

**Files:**
- Modify: `src/app/_layout.tsx`

The `AuthGuard` in `_layout.tsx` redirects users away from non-tab routes. We need to allowlist the `oauth` route so both authenticated and unauthenticated users can reach the consent screen.

**Step 1: Update AuthGuard**

In `src/app/_layout.tsx`, find the `AuthGuard` component. Add `'oauth'` to the public route check:

```typescript
// Before:
const inPublicRoute = segments[0] === 'share';

// After:
const inPublicRoute = segments[0] === 'share' || segments[0] === 'oauth';
```

Also update the redirect condition to not redirect authenticated users away from the oauth route:

The existing logic already handles this via `inPublicRoute` — if `inPublicRoute` is true, the `else if` branch (which redirects auth'd users to `/recipes`) won't fire.

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: allowlist oauth route in AuthGuard"
```

---

### Task 4: Build OAuth consent screen

**Files:**
- Create: `src/app/oauth/consent.tsx`

This is the consent screen that Supabase redirects to during the OAuth flow. It:
1. Extracts `authorization_id` from the URL query params
2. Checks if the user is logged in — if not, redirects to login
3. Fetches authorization details (client name, scopes)
4. Shows an "Approve / Deny" UI
5. Calls `supabase.auth.oauth.approveAuthorization()` or `.denyAuthorization()`
6. Redirects to the returned URL

**Step 1: Create the consent screen**

Create `src/app/oauth/consent.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';

type AuthorizationDetails = {
  client: { name: string; redirect_uri: string };
  scope: string;
};

export default function OAuthConsentScreen() {
  const { authorization_id } = useLocalSearchParams<{ authorization_id: string }>();
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!authorization_id) {
      setError('Missing authorization_id parameter');
      setLoading(false);
      return;
    }

    if (!session) {
      // Redirect to login, preserving the authorization_id
      // After login, AuthGuard will send them back here
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Store in sessionStorage so we can return after login
        window.sessionStorage.setItem('oauth_return_url', window.location.href);
      }
      router.replace('/login');
      return;
    }

    // Fetch authorization details
    fetchDetails();
  }, [session, authLoading, authorization_id]);

  async function fetchDetails() {
    try {
      const { data, error: fetchError } = await supabase.auth.oauth
        .getAuthorizationDetails(authorization_id!);
      if (fetchError) throw fetchError;
      setDetails(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load authorization details');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setSubmitting(true);
    try {
      const { data, error: approveError } = await supabase.auth.oauth
        .approveAuthorization(authorization_id!);
      if (approveError) throw approveError;
      if (data?.redirect_to && Platform.OS === 'web') {
        window.location.href = data.redirect_to;
      }
    } catch (e: any) {
      setError(e.message || 'Failed to approve authorization');
      setSubmitting(false);
    }
  }

  async function handleDeny() {
    setSubmitting(true);
    try {
      const { data, error: denyError } = await supabase.auth.oauth
        .denyAuthorization(authorization_id!);
      if (denyError) throw denyError;
      if (data?.redirect_to && Platform.OS === 'web') {
        window.location.href = data.redirect_to;
      }
    } catch (e: any) {
      setError(e.message || 'Failed to deny authorization');
      setSubmitting(false);
    }
  }

  const scopes = details?.scope?.split(' ').filter(Boolean) ?? [];

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      maxWidth: 600,
      width: '100%',
      alignSelf: 'center' as const,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.inputBorder,
    },
    iconContainer: {
      alignItems: 'center' as const,
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.text,
      textAlign: 'center' as const,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      marginBottom: 24,
    },
    scopeLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      textTransform: 'uppercase' as const,
      marginBottom: 8,
    },
    scopeList: {
      marginBottom: 24,
    },
    scopeItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 6,
    },
    scopeText: {
      fontSize: 15,
      color: colors.text,
      marginLeft: 8,
    },
    buttonRow: {
      flexDirection: 'row' as const,
      gap: 12,
    },
    approveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center' as const,
    },
    denyButton: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center' as const,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.inputBorder,
    },
    approveText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600' as const,
    },
    denyText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600' as const,
    },
    errorText: {
      color: colors.danger,
      fontSize: 15,
      textAlign: 'center' as const,
    },
  });

  if (authLoading || loading) {
    return (
      <View style={[styles.container, styles.content]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.content]}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name="alert-circle" size={48} color={colors.danger} />
          </View>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="key-outline" size={48} color={colors.primary} />
        </View>

        <Text style={styles.title}>Authorize {details?.client?.name ?? 'Application'}</Text>
        <Text style={styles.subtitle}>
          wants to access your Branger account
        </Text>

        {scopes.length > 0 && (
          <View style={styles.scopeList}>
            <Text style={styles.scopeLabel}>Permissions requested</Text>
            {scopes.map((scope) => (
              <View key={scope} style={styles.scopeItem}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.scopeText}>{scope}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.denyButton}
            onPress={handleDeny}
            disabled={submitting}
            accessibilityLabel="Deny authorization"
            accessibilityRole="button"
          >
            <Text style={styles.denyText}>Deny</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleApprove}
            disabled={submitting}
            accessibilityLabel="Approve authorization"
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.approveText}>Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
```

**Step 2: Verify it renders on web**

```bash
npm start -- --web
```

Navigate to `http://localhost:8081/oauth/consent` — should show error state ("Missing authorization_id parameter"). This is expected.

**Step 3: Commit**

```bash
git add src/app/oauth/consent.tsx
git commit -m "feat: add OAuth consent screen for MCP authentication"
```

---

### Task 5: Handle post-login redirect back to consent

**Files:**
- Modify: `src/app/_layout.tsx`

When an unauthenticated user hits the consent screen, they're sent to `/login`. After login, the `AuthGuard` currently sends them to `/(tabs)/recipes`. We need to redirect back to the consent URL instead.

**Step 1: Update AuthGuard to check for OAuth return URL**

In the `AuthGuard` `else if` branch (when session exists and user is on a non-tab route), add a check for the stored OAuth return URL:

```typescript
} else if (session && !inAuthGroup && !inPublicRoute && !inListJoin && !inResetFlow) {
  // Check for OAuth return URL first (web only)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const oauthReturn = window.sessionStorage.getItem('oauth_return_url');
    if (oauthReturn) {
      window.sessionStorage.removeItem('oauth_return_url');
      window.location.href = oauthReturn;
      return;
    }
  }

  AsyncStorage.getItem('pendingListJoin').then((pendingId) => {
    // ... existing logic
  });
}
```

Add the `Platform` import if not already present.

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: redirect back to OAuth consent after login"
```

---

### Task 6: Update MCP server to accept Supabase JWTs

**Files:**
- Modify: `supabase/functions/mcp-server/index.ts`

The MCP server currently only accepts `brg_` API tokens. When Claude Cowork uses OAuth, it will send a standard Supabase JWT as the bearer token. We need to accept both.

**Step 1: Add jose import and JWKS setup**

At the top of `supabase/functions/mcp-server/index.ts`, add:

```typescript
import * as jose from "jsr:@panva/jose@6";

const SUPABASE_JWT_ISSUER = SUPABASE_URL + "/auth/v1";
const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(SUPABASE_URL + "/auth/v1/.well-known/jwks.json"),
);
```

**Step 2: Add JWT validation function**

After `validateToken`, add:

```typescript
async function validateJwt(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, SUPABASE_JWT_KEYS, {
      issuer: SUPABASE_JWT_ISSUER,
      audience: "authenticated",
    });
    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
```

**Step 3: Update the main handler auth section**

Replace the auth section in the main handler. Currently it only checks for `brg_` tokens. Change it to try both:

```typescript
    // --- Auth: validate API token or OAuth JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const bearerToken = authHeader.replace("Bearer ", "");

    let userId: string;

    if (bearerToken.startsWith("brg_")) {
      // API token auth
      const tokenResult = await validateToken(bearerToken);
      if (!tokenResult) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired API token" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = tokenResult.userId;

      // Update last_used_at (fire-and-forget)
      supabaseAdmin
        .rpc("update_token_last_used", { p_token_id: tokenResult.tokenId })
        .then(null, (err: unknown) => console.error("Failed to update token last_used_at:", err));
    } else {
      // OAuth JWT auth
      const jwtResult = await validateJwt(bearerToken);
      if (!jwtResult) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = jwtResult.userId;
    }
```

And update the `dispatchTool` call and `tools/call` case to use `userId` directly (it already does — just remove the old `tokenResult.userId` reference).

**Step 4: Deploy and test**

```bash
npx supabase functions deploy mcp-server --no-verify-jwt
```

Test with existing API token (should still work):

```bash
curl -s -X POST "https://jeboglcuuutpwymxcejn.supabase.co/functions/v1/mcp-server" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer brg_<your-token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

**Step 5: Commit**

```bash
git add supabase/functions/mcp-server/index.ts
git commit -m "feat: accept OAuth JWTs in MCP server alongside API tokens"
```

---

### Task 7: Deploy consent screen & end-to-end test

**Step 1: Deploy the Expo web app**

Deploy the app with the new consent screen route to your web hosting (however you currently deploy the web version).

**Step 2: Verify the discovery endpoint**

```bash
curl -s https://jeboglcuuutpwymxcejn.supabase.co/.well-known/oauth-authorization-server/auth/v1 | python3 -m json.tool
```

**Step 3: Test with Claude Cowork**

1. Go to Claude.ai / Claude Cowork
2. Add a remote MCP server with URL: `https://jeboglcuuutpwymxcejn.supabase.co/functions/v1/mcp-server`
3. Claude should discover the OAuth endpoints automatically
4. You'll be redirected to your consent screen
5. Log in and approve
6. Claude should now have access to all 14 tools

**Step 4: Commit everything**

```bash
git add -A
git commit -m "feat: complete OAuth 2.1 integration for MCP server"
```

---

## Notes

- **`supabase.auth.oauth` API**: This is a new API surface. If `@supabase/supabase-js@^2.95.3` doesn't have it, update to latest. If the API shape differs from what's in this plan, check the [Supabase OAuth 2.1 docs](https://supabase.com/docs/guides/auth/oauth-server/getting-started).
- **Existing brg_ tokens keep working**: This is additive — no breaking changes to the existing API token flow.
- **RLS**: OAuth JWTs go through the same service role path as API tokens. No RLS changes needed.
- **Rate limiting**: Consider adding rate limiting for OAuth users in the future (they bypass the API token system's `last_used_at` tracking).
