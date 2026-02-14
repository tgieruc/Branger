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
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { RecipeWithDetails } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';

type ListOption = { id: string; name: string };

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const [availableLists, setAvailableLists] = useState<ListOption[]>([]);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id!).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', id!).order('position'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', id!).order('step_number'),
    ]);

    if (!recipeRes.data) {
      setLoading(false);
      return;
    }

    setRecipe({
      ...recipeRes.data,
      ingredients: ingredientsRes.data ?? [],
      steps: stepsRes.data ?? [],
    });
    setLoading(false);
  };

  const handleDelete = () => {
    setDeleteConfirmVisible(true);
  };

  const confirmDelete = async () => {
    setDeleteConfirmVisible(false);
    await supabase.from('recipes').delete().eq('id', id!);
    router.back();
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
    if (!recipe || !user) return;

    const { data: memberships } = await supabase
      .from('list_members')
      .select('list_id, shopping_lists(id, name)')
      .eq('user_id', user.id);

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

    setAvailableLists(lists);
    setListPickerVisible(true);
  };

  const addIngredientsToList = async (list: ListOption) => {
    if (!recipe) return;
    setListPickerVisible(false);

    const { error } = await supabase.rpc('add_items_to_list', {
      p_list_id: list.id,
      p_items: recipe.ingredients.map((ing) => ({
        name: ing.name,
        description: ing.description || null,
        recipe_id: recipe.id,
      })),
    });

    if (error) {
      Alert.alert('Error', 'Failed to add ingredients to list.');
      return;
    }

    Alert.alert('Done', `Added ${recipe.ingredients.length} items to ${list.name}`);
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
      <Stack.Screen
        options={{
          title: recipe.title,
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
                <Ionicons name="share-outline" size={22} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={22} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {recipe.photo_url && (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        )}

        <TouchableOpacity onPress={handleAddToList} style={styles.addToListButton}>
          <Ionicons name="cart-outline" size={20} color="#007AFF" />
          <Text style={styles.addToListText}>Add to Shopping List</Text>
        </TouchableOpacity>

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

      <Modal
        visible={listPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setListPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setListPickerVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add to List</Text>
            {availableLists.map((list) => (
              <TouchableOpacity
                key={list.id}
                style={styles.modalOption}
                onPress={() => addIngredientsToList(list)}
              >
                <Ionicons name="list-outline" size={20} color="#007AFF" />
                <Text style={styles.modalOptionText}>{list.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setListPickerVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title="Delete Recipe"
        message="Are you sure you want to delete this recipe?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 16, marginRight: 4 },
  headerBtn: { padding: 4 },
  image: { width: '100%', height: 200 },
  addToListButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 10, backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#d0e4ff',
  },
  addToListText: { color: '#007AFF', fontSize: 15, fontWeight: '500' },
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center',
    alignItems: 'center', padding: 32,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%',
    maxWidth: 360,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  modalOptionText: { fontSize: 16 },
  modalCancel: { paddingVertical: 14, marginTop: 4 },
  modalCancelText: { fontSize: 16, color: '#888', textAlign: 'center' },
});
