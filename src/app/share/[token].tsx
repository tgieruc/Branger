import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiJson } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { RecipeWithDetails } from '@/lib/types';
import { useColors } from '@/hooks/useColors';
import { EmptyState } from '@/components/EmptyState';
import { NotFound } from '@/components/illustrations/NotFound';

export default function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSharedRecipe = useCallback(async () => {
    const { data, error } = await apiJson<RecipeWithDetails>(`/api/share/${token}`, {}, false);

    if (error || !data) {
      setLoading(false);
      return;
    }

    setRecipe({
      ...data,
      ingredients: data.ingredients ?? [],
      steps: data.steps ?? [],
    });
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

    const { error } = await apiJson('/api/recipes/', {
      method: 'POST',
      body: JSON.stringify({
        title: recipe.title,
        ingredients: recipe.ingredients.map((ing: any, i: number) => ({
          name: ing.name,
          description: ing.description || '',
          position: i,
        })),
        steps: recipe.steps.map((step: any, i: number) => ({
          step_number: i + 1,
          instruction: step.instruction,
        })),
        photo_url: recipe.photo_url,
        source_type: recipe.source_type || 'manual',
      }),
    });

    if (error) {
      Alert.alert('Error', 'Failed to save recipe');
      return;
    }

    Alert.alert('Saved!', 'Recipe saved to your collection.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/recipes') },
    ]);
  };

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" /></View>;
  }

  if (!recipe) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          illustration={<NotFound />}
          title="Recipe not found"
          subtitle="This recipe may have been deleted or the link has expired"
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </View>
    );
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
