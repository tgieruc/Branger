import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { RecipeWithDetails } from '@/lib/types';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id!)
      .single();

    if (!recipeData) {
      setLoading(false);
      return;
    }

    const { data: ingredients } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', id!)
      .order('position');

    const { data: steps } = await supabase
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', id!)
      .order('step_number');

    setRecipe({
      ...recipeData,
      ingredients: ingredients ?? [],
      steps: steps ?? [],
    });
    setLoading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('recipes').delete().eq('id', id!);
          router.back();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!recipe) return;
    let token = recipe.share_token;
    if (!token) {
      token = globalThis.crypto.randomUUID();
      await supabase.from('recipes').update({ share_token: token }).eq('id', id!);
      setRecipe({ ...recipe, share_token: token });
    }
    const shareUrl = `branger://share/${token}`;
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? `Check out this recipe: ${recipe.title}`
          : `Check out this recipe: ${recipe.title}\n${shareUrl}`,
        url: Platform.OS === 'ios' ? shareUrl : undefined,
      });
    } catch {
      // User cancelled share sheet
    }
  };

  const handleAddToList = async () => {
    if (!recipe) return;

    const { data: memberships } = await supabase
      .from('list_members')
      .select('list_id, shopping_lists(id, name)')
      .eq('user_id', user!.id);

    const lists = (memberships ?? [])
      .map((m: Record<string, unknown>) => m.shopping_lists as { id: string; name: string } | null)
      .filter((l): l is { id: string; name: string } => l !== null);

    if (lists.length === 0) {
      Alert.alert(
        'No Lists',
        'Create a shopping list first, then add recipe ingredients to it.',
      );
      return;
    }

    Alert.alert('Add to List', 'Select a list:', [
      ...lists.map((list) => ({
        text: list.name,
        onPress: async () => {
          const maxPos = await supabase
            .from('list_items')
            .select('position')
            .eq('list_id', list.id)
            .order('position', { ascending: false })
            .limit(1)
            .single();

          const startPos = (maxPos.data?.position ?? -1) + 1;

          await supabase.from('list_items').insert(
            recipe.ingredients.map((ing, i) => ({
              list_id: list.id,
              name: ing.name,
              description: ing.description || null,
              recipe_id: recipe.id,
              position: startPos + i,
            })),
          );
          Alert.alert(
            'Done',
            `Added ${recipe.ingredients.length} items to ${list.name}`,
          );
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text>Recipe not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: recipe.title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {recipe.photo_url && (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        )}
        <Text style={styles.title}>{recipe.title}</Text>

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
            <Ionicons name="share-outline" size={20} color="#007AFF" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAddToList} style={styles.actionButton}>
            <Ionicons name="cart-outline" size={20} color="#007AFF" />
            <Text style={styles.actionText}>Add to List</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={20} color="#ff3b30" />
            <Text style={[styles.actionText, { color: '#ff3b30' }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Ingredients</Text>
        {recipe.ingredients.map((ing) => (
          <View key={ing.id} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{ing.name}</Text>
            <Text style={styles.ingredientDesc}>{ing.description}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Steps</Text>
        {recipe.steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{step.step_number}.</Text>
            <Text style={styles.stepText}>{step.instruction}</Text>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: 200 },
  title: { fontSize: 24, fontWeight: 'bold', padding: 16, paddingBottom: 8 },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: '#007AFF', fontSize: 14 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  ingredientName: { fontSize: 15, fontWeight: '500', marginRight: 8 },
  ingredientDesc: { fontSize: 15, color: '#666' },
  stepRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
});
