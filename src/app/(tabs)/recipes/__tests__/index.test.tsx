import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RecipesScreen from '@/app/(tabs)/recipes/index';
import { supabase } from '@/lib/supabase';
import type { Recipe } from '@/lib/types';

jest.mock('@/lib/supabase', () => {
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
  return {
    supabase: {
      rpc,
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
      },
    },
  };
});
jest.mock('@/lib/cache', () => ({
  getCachedRecipeList: jest.fn().mockResolvedValue(null),
  setCachedRecipeList: jest.fn(),
}));
jest.mock('expo-router', () => ({
  Link: jest.fn().mockImplementation(({ children }) => children),
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
    user_id: 'user-1',
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
    user_id: 'user-1',
    created_at: '2025-06-14T12:00:00Z',
    updated_at: '2025-06-14T12:00:00Z',
  },
];

const rpcMock = supabase.rpc as jest.Mock;

describe('RecipesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    rpcMock.mockReturnValue(new Promise(() => {}));

    const { UNSAFE_getByType } = render(<RecipesScreen />);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders recipe list after fetch', async () => {
    rpcMock.mockResolvedValue({ data: mockRecipes, error: null });

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('Pasta Carbonara')).toBeTruthy();
      expect(getByText('Caesar Salad')).toBeTruthy();
    });
  });

  it('shows empty state when no recipes', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('No recipes yet. Tap + to create one.')).toBeTruthy();
    });
  });

  it('calls supabase rpc to search recipes on mount', async () => {
    rpcMock.mockResolvedValue({ data: mockRecipes, error: null });

    render(<RecipesScreen />);

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('search_recipes', expect.objectContaining({
        p_query: '',
        p_limit: 20,
      }));
    });
  });
});
