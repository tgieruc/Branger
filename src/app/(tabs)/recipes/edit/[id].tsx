import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { apiJson, apiCall } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';

type Ingredient = { id: string; name: string; description: string };
type Step = { id: string; instruction: string };

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: Crypto.randomUUID(), name: '', description: '' }]);
  const [steps, setSteps] = useState<Step[]>([{ id: Crypto.randomUUID(), instruction: '' }]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const fetchRecipe = useCallback(async () => {
    const { data } = await apiJson<{
      title: string;
      photo_url: string | null;
      ingredients: { name: string; description: string | null }[];
      steps: { instruction: string }[];
    }>(`/api/recipes/${id}`);

    if (!data) {
      Alert.alert('Error', 'Recipe not found');
      router.back();
      return;
    }

    setTitle(data.title);
    setPhotoUrl(data.photo_url);

    const ings = (data.ingredients ?? []).map((i) => ({
      id: Crypto.randomUUID(),
      name: i.name,
      description: i.description ?? '',
    }));
    setIngredients(ings.length > 0 ? ings : [{ id: Crypto.randomUUID(), name: '', description: '' }]);

    const stps = (data.steps ?? []).map((s) => ({
      id: Crypto.randomUUID(),
      instruction: s.instruction,
    }));
    setSteps(stps.length > 0 ? stps : [{ id: Crypto.randomUUID(), instruction: '' }]);

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
      const fileName = `${Date.now()}.${ext}`;

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const resp = await apiCall('/api/photos/upload', { method: 'POST', body: formData });
      if (!resp.ok) throw new Error('Photo upload failed');
      const uploadData = await resp.json();
      setPhotoUrl(uploadData.url);
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
  const addIngredient = () => setIngredients([...ingredients, { id: Crypto.randomUUID(), name: '', description: '' }]);
  const updateIngredient = (i: number, field: 'name' | 'description', value: string) => {
    const u = [...ingredients]; u[i][field] = value; setIngredients(u);
  };
  const removeIngredient = (id: string) => setIngredients(ingredients.filter((ing) => ing.id !== id));
  const addStep = () => setSteps([...steps, { id: Crypto.randomUUID(), instruction: '' }]);
  const updateStep = (i: number, v: string) => {
    const u = [...steps]; u[i].instruction = v; setSteps(u);
  };
  const removeStep = (id: string) => setSteps(steps.filter((s) => s.id !== id));

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title'); return; }
    if (!user) return;

    const validIngs = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());
    setSaving(true);

    const { error } = await apiJson(`/api/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: title.trim(),
        photo_url: photoUrl,
        ingredients: validIngs.map((ing, i) => ({
          name: ing.name.trim(),
          description: ing.description.trim(),
          position: i,
        })),
        steps: validSteps.map((s, i) => ({
          step_number: i + 1,
          instruction: s.instruction.trim(),
        })),
      }),
    });

    if (error) {
      Alert.alert('Error', error);
      setSaving(false);
      return;
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
          <View key={ing.id} style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Item" placeholderTextColor={colors.placeholder} value={ing.name} onChangeText={(v) => updateIngredient(i, 'name', v)} />
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Qty / notes" placeholderTextColor={colors.placeholder} value={ing.description} onChangeText={(v) => updateIngredient(i, 'description', v)} />
            <TouchableOpacity onPress={() => removeIngredient(ing.id)} accessibilityLabel="Remove ingredient" accessibilityRole="button">
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
          <View key={step.id} style={styles.row}>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{i + 1}.</Text>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]} placeholder="Instruction" placeholderTextColor={colors.placeholder} value={step.instruction} onChangeText={(v) => updateStep(i, v)} multiline />
            <TouchableOpacity onPress={() => removeStep(step.id)} accessibilityLabel="Remove step" accessibilityRole="button">
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
