import { supabase } from '@/lib/supabase';
import type { AIRecipeResult } from '@/lib/types';

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
