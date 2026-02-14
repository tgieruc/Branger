import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto } from '@/lib/ai';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase');

const mockRecipeResult = {
  title: 'Test Recipe',
  ingredients: [{ name: 'Flour', description: '2 cups' }],
  steps: ['Mix ingredients', 'Bake at 350F'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseRecipeFromText', () => {
  it('calls supabase.functions.invoke with parse-recipe-text', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: mockRecipeResult,
      error: null,
    });

    const result = await parseRecipeFromText('My recipe text');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-recipe-text', {
      body: { text: 'My recipe text' },
    });
    expect(result).toEqual(mockRecipeResult);
  });

  it('throws when invoke returns an error', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Parse failed' },
    });

    await expect(parseRecipeFromText('bad text')).rejects.toThrow('Parse failed');
  });

  it('throws a default message when error has no message', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {},
    });

    await expect(parseRecipeFromText('bad text')).rejects.toThrow('AI parsing failed');
  });
});

describe('parseRecipeFromUrl', () => {
  it('calls supabase.functions.invoke with parse-recipe-url', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: mockRecipeResult,
      error: null,
    });

    const result = await parseRecipeFromUrl('https://example.com/recipe');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-recipe-url', {
      body: { url: 'https://example.com/recipe' },
    });
    expect(result).toEqual(mockRecipeResult);
  });
});

describe('parseRecipeFromPhoto', () => {
  it('calls supabase.functions.invoke with parse-recipe-photo', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: mockRecipeResult,
      error: null,
    });

    const result = await parseRecipeFromPhoto('https://example.com/photo.jpg');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-recipe-photo', {
      body: { image_url: 'https://example.com/photo.jpg' },
    });
    expect(result).toEqual(mockRecipeResult);
  });
});
