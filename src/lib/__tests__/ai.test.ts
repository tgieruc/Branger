import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto } from '@/lib/ai';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase');

const mockSession = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  user: { id: 'user-1' },
};

const mockRecipeResult = {
  title: 'Test Recipe',
  ingredients: [{ name: 'Flour', description: '2 cups' }],
  steps: ['Mix ingredients', 'Bake at 350F'],
};

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: mockSession },
    error: null,
  });
  global.fetch = jest.fn();
});

describe('parseRecipeFromText', () => {
  it('calls the parse-recipe-text edge function with the text body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRecipeResult),
    });

    const result = await parseRecipeFromText('My recipe text');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/parse-recipe-text'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockSession.access_token}`,
        }),
        body: JSON.stringify({ text: 'My recipe text' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });

  it('throws when the response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Parse failed' }),
    });

    await expect(parseRecipeFromText('bad text')).rejects.toThrow('Parse failed');
  });

  it('throws a default message when error response has no error field', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    await expect(parseRecipeFromText('bad text')).rejects.toThrow('AI parsing failed');
  });
});

describe('parseRecipeFromUrl', () => {
  it('calls the parse-recipe-url edge function with the url body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRecipeResult),
    });

    const result = await parseRecipeFromUrl('https://example.com/recipe');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/parse-recipe-url'),
      expect.objectContaining({
        body: JSON.stringify({ url: 'https://example.com/recipe' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });
});

describe('parseRecipeFromPhoto', () => {
  it('calls the parse-recipe-photo edge function with the image_url body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRecipeResult),
    });

    const result = await parseRecipeFromPhoto('https://example.com/photo.jpg');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/parse-recipe-photo'),
      expect.objectContaining({
        body: JSON.stringify({ image_url: 'https://example.com/photo.jpg' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });
});
