import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RecipesScreen from '@/app/(tabs)/recipes/index';
import type { Recipe } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('@/lib/cache', () => ({
  getCachedRecipeList: jest.fn().mockResolvedValue(null),
  setCachedRecipeList: jest.fn(),
}));
jest.mock('expo-router', () => ({
  Link: jest.fn().mockImplementation(({ children }) => children),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { cb(); }, []);
  },
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/RecipeCard', () => ({
  RecipeCard: ({ recipe }: { recipe: Recipe }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return <Text>{recipe.title}</Text>;
  },
}));

const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    title: 'Pasta Carbonara',
    photo_url: null,
    source_type: 'text',
    source_url: null,
    share_token: null,
    servings: null,
    prep_time: null,
    cook_time: null,
    created_at: '2025-06-15T12:00:00Z',
    updated_at: '2025-06-15T12:00:00Z',
  },
  {
    id: 'r2',
    title: 'Caesar Salad',
    photo_url: 'https://example.com/salad.jpg',
    source_type: 'url',
    source_url: 'https://example.com/recipe',
    share_token: null,
    servings: null,
    prep_time: null,
    cook_time: null,
    created_at: '2025-06-14T12:00:00Z',
    updated_at: '2025-06-14T12:00:00Z',
  },
];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiJson } = require('@/lib/api');

describe('RecipesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    apiJson.mockReturnValue(new Promise(() => {}));

    const { UNSAFE_getByType } = render(<RecipesScreen />);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders recipe list after fetch', async () => {
    apiJson.mockResolvedValue({ data: { recipes: mockRecipes, has_more: false }, error: null, status: 200 });

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('Pasta Carbonara')).toBeTruthy();
      expect(getByText('Caesar Salad')).toBeTruthy();
    });
  });

  it('shows empty state when no recipes', async () => {
    apiJson.mockResolvedValue({ data: { recipes: [], has_more: false }, error: null, status: 200 });

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('Your cookbook is empty')).toBeTruthy();
    });
  });

  it('calls apiJson to fetch recipes on mount', async () => {
    apiJson.mockResolvedValue({ data: { recipes: mockRecipes, has_more: false }, error: null, status: 200 });

    render(<RecipesScreen />);

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/recipes/'),
      );
    });
  });
});
