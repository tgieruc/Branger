import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RecipesScreen from '@/app/(tabs)/recipes/index';
import { supabase } from '@/lib/supabase';
import type { Recipe } from '@/lib/types';

jest.mock('@/lib/supabase');
jest.mock('expo-router', () => ({
  Link: jest.fn().mockImplementation(({ children }) => children),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => { cb(); }, []);
  },
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('@/components/RecipeCard', () => ({
  RecipeCard: ({ recipe }: { recipe: Recipe }) => {
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

function setupSupabaseMock(data: Recipe[] | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data, error: null }),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe('RecipesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValue(new Promise(() => {})),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const { UNSAFE_getByType } = render(<RecipesScreen />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders recipe list after fetch', async () => {
    setupSupabaseMock(mockRecipes);

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('Pasta Carbonara')).toBeTruthy();
      expect(getByText('Caesar Salad')).toBeTruthy();
    });
  });

  it('shows empty state when no recipes', async () => {
    setupSupabaseMock([]);

    const { getByText } = render(<RecipesScreen />);

    await waitFor(() => {
      expect(getByText('No recipes yet. Tap + to create one.')).toBeTruthy();
    });
  });

  it('calls supabase to fetch recipes on mount', async () => {
    const chain = setupSupabaseMock(mockRecipes);

    render(<RecipesScreen />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('recipes');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });
});
