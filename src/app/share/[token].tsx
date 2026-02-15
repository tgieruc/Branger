import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { RecipeWithDetails } from '@/lib/types';
import { useColors } from '@/hooks/useColors';

export default function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSharedRecipe = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_shared_recipe', { p_token: token });

    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      setLoading(false);
      return;
    }

    const d = data as Record<string, any>;
    setRecipe({
      ...d,
      ingredients: d.ingredients ?? [],
      steps: d.steps ?? [],
    } as RecipeWithDetails);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchSharedRecipe();
  }, [fetchSharedRecipe]);

  const handleSaveCopy = async () => {
    if (!user || !recipe) {
      Alert.alert('Sign in', 'You need to sign in to save recipes.');
      return;
    }

    const { data: newRecipe, error } = await supabase
      .from('recipes')
      .insert({
        title: recipe.title,
        user_id: user.id,
        source_type: recipe.source_type,
        photo_url: recipe.photo_url,
      })
      .select()
      .single();

    if (error || !newRecipe) {
      Alert.alert('Error', 'Failed to save recipe');
      return;
    }

    if (recipe.ingredients.length > 0) {
      const { error: ingError } = await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map((ing: any, i: number) => ({
          recipe_id: newRecipe.id,
          name: ing.name,
          description: ing.description,
          position: i,
        }))
      );
      if (ingError) {
        Alert.alert('Warning', 'Recipe saved but some ingredients may be missing.');
      }
    }

    if (recipe.steps.length > 0) {
      const { error: stepError } = await supabase.from('recipe_steps').insert(
        recipe.steps.map((step: any, i: number) => ({
          recipe_id: newRecipe.id,
          step_number: i + 1,
          instruction: step.instruction,
        }))
      );
      if (stepError) {
        Alert.alert('Warning', 'Recipe saved but some steps may be missing.');
      }
    }

    Alert.alert('Saved!', 'Recipe saved to your collection.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/recipes') },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (!recipe) {
    return <View style={styles.center}><Text style={{ color: colors.text }}>Recipe not found or link expired.</Text></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>

      {user ? (
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.success }]} onPress={handleSaveCopy}>
          <Text style={[styles.saveText, { color: colors.buttonText }]}>Save to My Recipes</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.signInButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/login')}>
          <Text style={[styles.signInText, { color: colors.buttonText }]}>Sign in to save this recipe</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.section, { color: colors.text }]}>Ingredients</Text>
      {recipe.ingredients.map((ing) => (
        <View key={ing.id} style={styles.ingredientRow}>
          <Text style={[styles.ingredientName, { color: colors.text }]}>{ing.name}</Text>
          <Text style={[styles.ingredientDesc, { color: colors.textSecondary }]}>{ing.description}</Text>
        </View>
      ))}

      <Text style={[styles.section, { color: colors.text }]}>Steps</Text>
      {recipe.steps.map((step) => (
        <View key={step.id} style={styles.stepRow}>
          <Text style={[styles.stepNum, { color: colors.text }]}>{step.step_number}.</Text>
          <Text style={[styles.stepText, { color: colors.text }]}>{step.instruction}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  saveButton: {
    borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 24,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
  signInButton: {
    borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 24,
  },
  signInText: { fontSize: 16, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingVertical: 6 },
  ingredientName: { fontSize: 15, fontWeight: '500', marginRight: 8 },
  ingredientDesc: { fontSize: 15 },
  stepRow: { flexDirection: 'row', paddingVertical: 6 },
  stepNum: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
});
