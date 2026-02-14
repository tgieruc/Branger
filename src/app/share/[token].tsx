import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { RecipeWithDetails } from '@/lib/types';

export default function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSharedRecipe();
  }, [token]);

  const fetchSharedRecipe = async () => {
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*')
      .eq('share_token', token)
      .single();

    if (!recipeData) { setLoading(false); return; }

    const [ingRes, stepsRes] = await Promise.all([
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeData.id).order('position'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', recipeData.id).order('step_number'),
    ]);

    setRecipe({
      ...recipeData,
      ingredients: ingRes.data ?? [],
      steps: stepsRes.data ?? [],
    });
    setLoading(false);
  };

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
      await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map((ing, i) => ({
          recipe_id: newRecipe.id,
          name: ing.name,
          description: ing.description,
          position: i,
        }))
      );
    }

    if (recipe.steps.length > 0) {
      await supabase.from('recipe_steps').insert(
        recipe.steps.map((step, i) => ({
          recipe_id: newRecipe.id,
          step_number: i + 1,
          instruction: step.instruction,
        }))
      );
    }

    Alert.alert('Saved!', 'Recipe saved to your collection.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/recipes') },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (!recipe) {
    return <View style={styles.center}><Text>Recipe not found or link expired.</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{recipe.title}</Text>

      {user && (
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveCopy}>
          <Text style={styles.saveText}>Save to My Recipes</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>Ingredients</Text>
      {recipe.ingredients.map((ing) => (
        <View key={ing.id} style={styles.ingredientRow}>
          <Text style={styles.ingredientName}>{ing.name}</Text>
          <Text style={styles.ingredientDesc}>{ing.description}</Text>
        </View>
      ))}

      <Text style={styles.section}>Steps</Text>
      {recipe.steps.map((step) => (
        <View key={step.id} style={styles.stepRow}>
          <Text style={styles.stepNum}>{step.step_number}.</Text>
          <Text style={styles.stepText}>{step.instruction}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  saveButton: {
    backgroundColor: '#34c759', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingVertical: 6 },
  ingredientName: { fontSize: 15, fontWeight: '500', marginRight: 8 },
  ingredientDesc: { fontSize: 15, color: '#666' },
  stepRow: { flexDirection: 'row', paddingVertical: 6 },
  stepNum: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
});
