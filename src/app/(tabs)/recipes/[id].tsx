import { useCallback, useEffect, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getCachedRecipeDetail, setCachedRecipeDetail } from '@/lib/cache';
import { useColors } from '@/hooks/useColors';
import type { RecipeWithDetails } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';

type ListOption = { id: string; name: string };

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const [recipe, setRecipe] = useState<RecipeWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const [availableLists, setAvailableLists] = useState<ListOption[]>([]);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [newListName, setNewListName] = useState('');

  const fetchRecipe = useCallback(async () => {
    // Show cached data immediately if available
    const cached = await getCachedRecipeDetail(id!);
    if (cached) {
      setRecipe(cached);
      setLoading(false);
    }

    // Fetch fresh data from network
    const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id!).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', id!).order('position'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', id!).order('step_number'),
    ]);

    if (!recipeRes.data) {
      setLoading(false);
      return;
    }

    const recipeWithDetails: RecipeWithDetails = {
      ...recipeRes.data,
      ingredients: ingredientsRes.data ?? [],
      steps: stepsRes.data ?? [],
    };
    setRecipe(recipeWithDetails);
    setCachedRecipeDetail(id!, recipeWithDetails);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchRecipe();
  }, [fetchRecipe]);

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

    setAvailableLists(lists);
    setShowNewListInput(false);
    setNewListName('');
    setListPickerVisible(true);
  };

  const createListAndAddIngredients = async () => {
    if (!newListName.trim() || !recipe) return;

    const { data: newListId, error: createError } = await supabase.rpc('create_list_with_member', {
      list_name: newListName.trim(),
    });

    if (createError || !newListId) {
      Alert.alert('Error', createError?.message ?? 'Failed to create list.');
      return;
    }

    await addIngredientsToList({ id: newListId, name: newListName.trim() });
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
              <TouchableOpacity onPress={handleShare} style={styles.headerBtn} accessibilityLabel="Share recipe" accessibilityRole="button">
                <Ionicons name="share-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push(`/(tabs)/recipes/edit/${id}`)} style={styles.headerBtn} accessibilityLabel="Edit recipe" accessibilityRole="button">
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerBtn} accessibilityLabel="Delete recipe" accessibilityRole="button">
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {recipe.photo_url && (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        )}

        <TouchableOpacity onPress={handleAddToList} style={[styles.addToListButton, { backgroundColor: colors.addToListBg, borderColor: colors.addToListBorder }]} accessibilityLabel="Add ingredients to shopping list" accessibilityRole="button">
          <Ionicons name="cart-outline" size={20} color={colors.primary} />
          <Text style={[styles.addToListText, { color: colors.primary }]}>Add to Shopping List</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredients</Text>
        {recipe.ingredients.map((ing) => (
          <View key={ing.id} style={styles.ingredientRow}>
            <Text style={[styles.ingredientName, { color: colors.text }]}>{ing.name}</Text>
            <Text style={[styles.ingredientDesc, { color: colors.textSecondary }]}>{ing.description}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Steps</Text>
        {recipe.steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{step.step_number}.</Text>
            <Text style={[styles.stepText, { color: colors.text }]}>{step.instruction}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={listPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setListPickerVisible(false)}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]} onPress={() => setListPickerVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.modalBackground }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add to List</Text>
            {availableLists.map((list) => (
              <TouchableOpacity
                key={list.id}
                style={[styles.modalOption, { borderBottomColor: colors.borderLight }]}
                onPress={() => addIngredientsToList(list)}
              >
                <Ionicons name="list-outline" size={20} color={colors.primary} />
                <Text style={[styles.modalOptionText, { color: colors.text }]}>{list.name}</Text>
              </TouchableOpacity>
            ))}
            {showNewListInput ? (
              <View style={[styles.newListRow, { borderBottomColor: colors.borderLight }]}>
                <TextInput
                  style={[styles.newListInput, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]}
                  placeholder="List name"
                  placeholderTextColor={colors.placeholder}
                  value={newListName}
                  onChangeText={setNewListName}
                  autoFocus
                  onSubmitEditing={createListAndAddIngredients}
                />
                <TouchableOpacity onPress={createListAndAddIngredients}>
                  <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: colors.borderLight }]}
                onPress={() => setShowNewListInput(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.success} />
                <Text style={[styles.modalOptionText, { color: colors.success }]}>Create New List</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setListPickerVisible(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textTertiary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
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
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 16, marginRight: 4 },
  headerBtn: { padding: 4 },
  image: { width: '100%', height: 200 },
  addToListButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1,
  },
  addToListText: { fontSize: 15, fontWeight: '500' },
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
  ingredientDesc: { fontSize: 15 },
  stepRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  stepText: { fontSize: 15, flex: 1 },
  modalOverlay: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', padding: 32,
  },
  modalContent: {
    borderRadius: 16, padding: 20, width: '100%',
    maxWidth: 360,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: { fontSize: 16 },
  newListRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newListInput: {
    flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15,
  },
  modalCancel: { paddingVertical: 14, marginTop: 4 },
  modalCancelText: { fontSize: 16, textAlign: 'center' },
});
