import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

type Ingredient = { name: string; description: string };
type Step = { instruction: string };

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', description: '' }]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '' }]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const fetchRecipe = useCallback(async () => {
    const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id!).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', id!).order('position'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', id!).order('step_number'),
    ]);

    if (!recipeRes.data) {
      Alert.alert('Error', 'Recipe not found');
      router.back();
      return;
    }

    setTitle(recipeRes.data.title);
    setPhotoUrl(recipeRes.data.photo_url);

    const ings = (ingredientsRes.data ?? []).map((i) => ({
      name: i.name,
      description: i.description ?? '',
    }));
    setIngredients(ings.length > 0 ? ings : [{ name: '', description: '' }]);

    const stps = (stepsRes.data ?? []).map((s) => ({
      instruction: s.instruction,
    }));
    setSteps(stps.length > 0 ? stps : [{ instruction: '' }]);

    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    fetchRecipe();
  }, [fetchRecipe]);

  // --- Photo helpers ---
  const processPhotoResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0] || !user) return;

    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: fileName.split('/').pop(),
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('recipe-photos')
        .upload(fileName, formData, { contentType: 'multipart/form-data' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('recipe-photos')
        .getPublicUrl(fileName);

      setPhotoUrl(publicUrl);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    await processPhotoResult(result);
  };

  const launchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    await processPhotoResult(result);
  };

  const handleChangePhoto = () => {
    Alert.alert('Change Photo', 'Choose a photo source', [
      { text: 'Take Photo', onPress: launchCamera },
      { text: 'Choose from Library', onPress: launchLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
  };

  // --- Ingredient/step helpers ---
  const addIngredient = () => setIngredients([...ingredients, { name: '', description: '' }]);
  const updateIngredient = (i: number, field: keyof Ingredient, value: string) => {
    const u = [...ingredients]; u[i][field] = value; setIngredients(u);
  };
  const removeIngredient = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));
  const addStep = () => setSteps([...steps, { instruction: '' }]);
  const updateStep = (i: number, v: string) => {
    const u = [...steps]; u[i].instruction = v; setSteps(u);
  };
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title'); return; }
    if (!user) return;

    const validIngs = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());
    setSaving(true);

    // Update recipe row
    const { error: recipeError } = await supabase
      .from('recipes')
      .update({ title: title.trim(), photo_url: photoUrl })
      .eq('id', id!);

    if (recipeError) {
      Alert.alert('Error', recipeError.message);
      setSaving(false);
      return;
    }

    // Delete existing ingredients, then insert new
    const { error: delIngError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', id!);

    if (delIngError) {
      Alert.alert('Error', 'Failed to update ingredients.');
      setSaving(false);
      return;
    }

    if (validIngs.length > 0) {
      const { error: ingError } = await supabase.from('recipe_ingredients').insert(
        validIngs.map((ing, i) => ({
          recipe_id: id!,
          name: ing.name.trim(),
          description: ing.description.trim(),
          position: i,
        }))
      );
      if (ingError) {
        Alert.alert('Warning', 'Recipe saved but some ingredients may be missing.');
        setSaving(false);
        router.back();
        return;
      }
    }

    // Delete existing steps, then insert new
    const { error: delStepError } = await supabase
      .from('recipe_steps')
      .delete()
      .eq('recipe_id', id!);

    if (delStepError) {
      Alert.alert('Error', 'Failed to update steps.');
      setSaving(false);
      return;
    }

    if (validSteps.length > 0) {
      const { error: stepError } = await supabase.from('recipe_steps').insert(
        validSteps.map((s, i) => ({
          recipe_id: id!,
          step_number: i + 1,
          instruction: s.instruction.trim(),
        }))
      );
      if (stepError) {
        Alert.alert('Warning', 'Recipe saved but some steps may be missing.');
      }
    }

    setSaving(false);
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Photo section */}
        {photoUrl ? (
          <View style={styles.photoSection}>
            <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={handleChangePhoto} style={styles.photoActionBtn} accessibilityLabel="Change photo" accessibilityRole="button">
                <Ionicons name="camera-outline" size={18} color={colors.primary} />
                <Text style={[styles.photoActionText, { color: colors.primary }]}>Change Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRemovePhoto} style={styles.photoActionBtn} accessibilityLabel="Remove photo" accessibilityRole="button">
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.photoActionText, { color: colors.danger }]}>Remove Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={handleChangePhoto} style={[styles.addPhotoButton, { borderColor: colors.inputBorder }]} accessibilityLabel="Add photo" accessibilityRole="button">
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
            <Text style={[styles.addPhotoText, { color: colors.primary }]}>Add Photo</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.label, { color: colors.text }]}>Title</Text>
        <TextInput style={[styles.input, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Recipe title" placeholderTextColor={colors.placeholder} value={title} onChangeText={setTitle} />

        <Text style={[styles.label, { color: colors.text }]}>Ingredients</Text>
        {ingredients.map((ing, i) => (
          <View key={i} style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Item" placeholderTextColor={colors.placeholder} value={ing.name} onChangeText={(v) => updateIngredient(i, 'name', v)} />
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Qty / notes" placeholderTextColor={colors.placeholder} value={ing.description} onChangeText={(v) => updateIngredient(i, 'description', v)} />
            <TouchableOpacity onPress={() => removeIngredient(i)} accessibilityLabel="Remove ingredient" accessibilityRole="button">
              <Ionicons name="close-circle" size={24} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addIngredient} style={styles.addRow} accessibilityLabel="Add ingredient" accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addText, { color: colors.primary }]}>Add ingredient</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.text }]}>Steps</Text>
        {steps.map((step, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{i + 1}.</Text>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Instruction" placeholderTextColor={colors.placeholder} value={step.instruction} onChangeText={(v) => updateStep(i, v)} multiline />
            <TouchableOpacity onPress={() => removeStep(i)} accessibilityLabel="Remove step" accessibilityRole="button">
              <Ionicons name="close-circle" size={24} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addStep} style={styles.addRow} accessibilityLabel="Add step" accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addText, { color: colors.primary }]}>Add step</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} accessibilityLabel="Save changes" accessibilityRole="button">
          <Text style={[styles.saveText, { color: colors.buttonText }]}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoSection: { marginBottom: 8 },
  photoPreview: { width: '100%', height: 200, borderRadius: 8 },
  photoActions: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8 },
  photoActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  photoActionText: { fontSize: 14, fontWeight: '500' },
  addPhotoButton: {
    alignItems: 'center', paddingVertical: 32, borderWidth: 2,
    borderStyle: 'dashed', borderRadius: 12, marginBottom: 8,
  },
  addPhotoText: { marginTop: 4, fontSize: 14 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addText: { marginLeft: 6 },
  saveButton: {
    borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
});
