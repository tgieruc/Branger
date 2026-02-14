import { supabase } from '@/lib/supabase';
import type { AIRecipeResult } from '@/lib/types';

async function callEdgeFunction(
  functionName: string,
  body: Record<string, string>
): Promise<AIRecipeResult> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(error.message || 'AI parsing failed');
  }

  return data as AIRecipeResult;
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
