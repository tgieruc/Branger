import React from 'react';
import { render } from '@testing-library/react-native';
import { RecipeCard } from '@/components/RecipeCard';
import type { Recipe } from '@/lib/types';

jest.mock('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
});

const baseRecipe: Recipe = {
  id: 'recipe-1',
  title: 'Chocolate Cake',
  photo_url: 'https://example.com/cake.jpg',
  source_type: 'text',
  source_url: null,
  share_token: null,
  user_id: 'user-1',
  created_at: '2025-06-15T12:00:00Z',
  updated_at: '2025-06-15T12:00:00Z',
};

describe('RecipeCard', () => {
  it('renders recipe title', () => {
    const { getByText } = render(<RecipeCard recipe={baseRecipe} />);
    expect(getByText('Chocolate Cake')).toBeTruthy();
  });

  it('renders recipe date', () => {
    const { getByText } = render(<RecipeCard recipe={baseRecipe} />);
    const formattedDate = new Date('2025-06-15T12:00:00Z').toLocaleDateString();
    expect(getByText(formattedDate)).toBeTruthy();
  });

  it('renders image when photo_url exists', () => {
    const { UNSAFE_getByType } = render(<RecipeCard recipe={baseRecipe} />);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native');
    const image = UNSAFE_getByType(Image);
    expect(image.props.source.uri).toBe('https://example.com/cake.jpg');
  });

  it('does not render image when photo_url is null', () => {
    const recipeNoPhoto = { ...baseRecipe, photo_url: null };
    const { UNSAFE_queryAllByType } = render(<RecipeCard recipe={recipeNoPhoto} />);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native');
    const images = UNSAFE_queryAllByType(Image);
    expect(images).toHaveLength(0);
  });

  it('is wrapped in a Link for navigation', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Link } = require('expo-router');
    render(<RecipeCard recipe={baseRecipe} />);
    const linkCall = Link.mock.calls.find(
      (call: any[]) => call[0]?.href === '/(tabs)/recipes/recipe-1',
    );
    expect(linkCall).toBeTruthy();
    expect(linkCall[0].asChild).toBe(true);
  });
});
