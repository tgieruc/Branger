import { supabase } from '@/lib/supabase';
import type { AIRecipeResult } from '@/lib/types';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(
  functionName: string,
  body: Record<string, string>
): Promise<AIRecipeResult> {
  // Get current session, refresh only if token expires within 60s
  let { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const expiresAt = session.expires_at ?? 0;
    const nowSecs = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSecs < 60) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }
  }

  if (!session) {
    throw new Error('You must be signed in to use AI features');
  }

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `AI parsing failed (${response.status})`);
  }

  return await response.json() as AIRecipeResult;
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
