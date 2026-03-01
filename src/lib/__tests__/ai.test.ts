import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto, parseRecipeFromPhotos } from '@/lib/ai';

jest.mock('@/lib/api');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiJson } = require('@/lib/api');

const mockRecipeResult = {
  title: 'Test Recipe',
  ingredients: [{ name: 'Flour', description: '2 cups' }],
  steps: ['Mix ingredients', 'Bake at 350F'],
};

beforeEach(() => {
  jest.clearAllMocks();
  apiJson.mockResolvedValue({ data: mockRecipeResult, error: null, status: 200 });
});

describe('parseRecipeFromText', () => {
  it('calls apiJson with correct endpoint and body', async () => {
    const result = await parseRecipeFromText('My recipe text');

    expect(apiJson).toHaveBeenCalledWith(
      '/api/recipes/parse/text',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'My recipe text' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });

  it('throws when apiJson returns an error', async () => {
    apiJson.mockResolvedValue({ data: null, error: 'text is required', status: 400 });

    await expect(parseRecipeFromText('')).rejects.toThrow('text is required');
  });

  it('throws default message when data is null with no error', async () => {
    apiJson.mockResolvedValue({ data: null, error: null, status: 500 });

    await expect(parseRecipeFromText('text')).rejects.toThrow('AI parsing failed');
  });
});

describe('parseRecipeFromUrl', () => {
  it('calls apiJson with correct endpoint', async () => {
    const result = await parseRecipeFromUrl('https://example.com/recipe');

    expect(apiJson).toHaveBeenCalledWith(
      '/api/recipes/parse/url',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/recipe' }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });
});

describe('parseRecipeFromPhoto', () => {
  it('calls apiJson with correct endpoint and wraps single URL in array', async () => {
    const result = await parseRecipeFromPhoto('https://example.com/photo.jpg');

    expect(apiJson).toHaveBeenCalledWith(
      '/api/recipes/parse/photo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ image_urls: ['https://example.com/photo.jpg'] }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });
});

describe('parseRecipeFromPhotos', () => {
  it('calls apiJson with image_urls array', async () => {
    const urls = ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'];
    const result = await parseRecipeFromPhotos(urls);

    expect(apiJson).toHaveBeenCalledWith(
      '/api/recipes/parse/photo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ image_urls: urls }),
      }),
    );
    expect(result).toEqual(mockRecipeResult);
  });

  it('sends to same endpoint as single photo', async () => {
    await parseRecipeFromPhotos(['https://example.com/photo1.jpg']);

    expect(apiJson).toHaveBeenCalledWith(
      '/api/recipes/parse/photo',
      expect.anything(),
    );
  });
});
