import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto } from '@/lib/ai';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase');

const mockSession = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'test-user' },
};

const mockRecipeResult = {
  title: 'Test Recipe',
  ingredients: [{ name: 'Flour', description: '2 cups' }],
  steps: ['Mix ingredients', 'Bake at 350F'],
};

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();

  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: mockSession },
  });
  (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
    data: { session: mockSession },
  });

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockRecipeResult),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('parseRecipeFromText', () => {
  it('calls fetch with correct endpoint and headers', async () => {
    const result = await parseRecipeFromText('My recipe text');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/parse-recipe-text'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockSession.access_token}`,
        }),
        body: JSON.stringify({ text: 'My recipe text' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });

  it('throws when not signed in', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });

    await expect(parseRecipeFromText('text')).rejects.toThrow(
      'You must be signed in to use AI features',
    );
  });

  it('throws when session refresh fails', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });

    await expect(parseRecipeFromText('text')).rejects.toThrow(
      'You must be signed in to use AI features',
    );
  });

  it('throws with error message from API response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'text is required' }),
    });

    await expect(parseRecipeFromText('')).rejects.toThrow('text is required');
  });

  it('throws default message when error response has no body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('no body')),
    });

    await expect(parseRecipeFromText('text')).rejects.toThrow('AI parsing failed (500)');
  });
});

describe('parseRecipeFromUrl', () => {
  it('calls fetch with correct endpoint', async () => {
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
  it('calls fetch with correct endpoint', async () => {
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
