import { apiJson } from '@/lib/api';
import type { AIRecipeResult } from '@/lib/types';

export async function parseRecipeFromText(text: string): Promise<AIRecipeResult> {
  const { data, error } = await apiJson<AIRecipeResult>('/api/recipes/parse/text', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (error || !data) throw new Error(error || 'AI parsing failed');
  return data;
}

export async function parseRecipeFromUrl(url: string): Promise<AIRecipeResult> {
  const { data, error } = await apiJson<AIRecipeResult>('/api/recipes/parse/url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (error || !data) throw new Error(error || 'AI parsing failed');
  return data;
}

export async function parseRecipeFromPhoto(imageUrl: string): Promise<AIRecipeResult> {
  const { data, error } = await apiJson<AIRecipeResult>('/api/recipes/parse/photo', {
    method: 'POST',
    body: JSON.stringify({ image_urls: [imageUrl] }),
  });
  if (error || !data) throw new Error(error || 'AI parsing failed');
  return data;
}

export async function parseRecipeFromPhotos(imageUrls: string[]): Promise<AIRecipeResult> {
  const { data, error } = await apiJson<AIRecipeResult>('/api/recipes/parse/photo', {
    method: 'POST',
    body: JSON.stringify({ image_urls: imageUrls }),
  });
  if (error || !data) throw new Error(error || 'AI parsing failed');
  return data;
}
