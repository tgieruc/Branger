import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { parseRecipeFromText, parseRecipeFromUrl, parseRecipeFromPhoto } from '@/lib/ai';

type Ingredient = { name: string; description: string };
type Step = { instruction: string };
type Mode = 'manual' | 'text' | 'url' | 'photo';

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'manual', label: 'Manual', icon: 'create-outline' },
  { key: 'text', label: 'Text', icon: 'document-text-outline' },
  { key: 'url', label: 'URL', icon: 'link-outline' },
  { key: 'photo', label: 'Photo', icon: 'camera-outline' },
];

export default function CreateRecipeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>('manual');
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', description: '' }]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '' }]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // AI input state
  const [aiText, setAiText] = useState('');
  const [aiUrl, setAiUrl] = useState('');

  // Track which mode created the recipe for source_type
  const [sourceMode, setSourceMode] = useState<Mode>('manual');
  const keyboardHeight = useKeyboardHeight();

  const sourceTypeMap: Record<Mode, string> = {
    manual: 'manual',
    text: 'text_ai',
    url: 'url_ai',
    photo: 'photo_ai',
  };

  const populateFromAI = (result: { title: string; ingredients: { name: string; description: string }[]; steps: string[] }, fromMode: Mode) => {
    setTitle(result.title);
    setIngredients(
      result.ingredients.length > 0
        ? result.ingredients
        : [{ name: '', description: '' }]
    );
    setSteps(
      result.steps.length > 0
        ? result.steps.map((s) => ({ instruction: s }))
        : [{ instruction: '' }]
    );
    setSourceMode(fromMode);
    setMode('manual'); // Switch to form for review
  };

  const handleAiText = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseRecipeFromText(aiText);
      populateFromAI(result, 'text');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
  };

  const handleAiUrl = async () => {
    if (!aiUrl.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseRecipeFromUrl(aiUrl);
      populateFromAI(result, 'url');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
  };

  const processPhotoResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0] || !user) return;

    setAiLoading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('recipe-photos')
        .upload(fileName, blob, { contentType: asset.mimeType || 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('recipe-photos')
        .getPublicUrl(fileName);

      const parsed = await parseRecipeFromPhoto(publicUrl);
      populateFromAI(parsed, 'photo');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAiLoading(false);
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
    processPhotoResult(result);
  };

  const launchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    processPhotoResult(result);
  };

  const handleAiPhoto = () => {
    Alert.alert('Add Recipe Photo', 'Choose a photo source', [
      { text: 'Take Photo', onPress: launchCamera },
      { text: 'Choose from Library', onPress: launchLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({
        title: title.trim(),
        user_id: user.id,
        source_type: sourceTypeMap[sourceMode],
        source_url: sourceMode === 'url' ? aiUrl : null,
      })
      .select()
      .single();

    if (error || !recipe) {
      Alert.alert('Error', error?.message ?? 'Failed'); setSaving(false); return;
    }

    if (validIngs.length > 0) {
      const { error: ingError } = await supabase.from('recipe_ingredients').insert(
        validIngs.map((ing, i) => ({
          recipe_id: recipe.id, name: ing.name.trim(),
          description: ing.description.trim(), position: i,
        }))
      );
      if (ingError) {
        Alert.alert('Warning', 'Recipe saved but some ingredients may be missing.');
        setSaving(false);
        router.back();
        return;
      }
    }

    if (validSteps.length > 0) {
      const { error: stepError } = await supabase.from('recipe_steps').insert(
        validSteps.map((s, i) => ({
          recipe_id: recipe.id, step_number: i + 1, instruction: s.instruction.trim(),
        }))
      );
      if (stepError) {
        Alert.alert('Warning', 'Recipe saved but some steps may be missing.');
      }
    }

    setSaving(false);
    router.back();
  };

  return (
    <View style={styles.flex}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: 48 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Mode selector */}
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeButton, mode === m.key && styles.modeActive]}
                onPress={() => setMode(m.key)}
              >
                <Ionicons name={m.icon as any} size={18} color={mode === m.key ? '#fff' : '#007AFF'} />
                <Text style={[styles.modeText, mode === m.key && styles.modeTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {aiLoading && (
            <View style={styles.aiLoading}>
              <ActivityIndicator size="large" />
              <Text style={styles.aiLoadingText}>Parsing recipe...</Text>
            </View>
          )}

          {/* AI input areas */}
          {mode === 'text' && !aiLoading && (
            <View>
              <Text style={styles.label}>Paste recipe text</Text>
              <TextInput
                style={[styles.input, { height: 160, textAlignVertical: 'top' }]}
                placeholder="Paste a recipe here..."
                value={aiText}
                onChangeText={setAiText}
                multiline
              />
              <TouchableOpacity style={styles.aiButton} onPress={handleAiText}>
                <Text style={styles.aiButtonText}>Generate Recipe</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'url' && !aiLoading && (
            <View>
              <Text style={styles.label}>Recipe URL</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com/recipe"
                value={aiUrl}
                onChangeText={setAiUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity style={styles.aiButton} onPress={handleAiUrl}>
                <Text style={styles.aiButtonText}>Import Recipe</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'photo' && !aiLoading && (
            <View>
              <TouchableOpacity style={styles.photoButton} onPress={handleAiPhoto}>
                <Ionicons name="camera-outline" size={32} color="#007AFF" />
                <Text style={styles.photoText}>Take or choose a photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Manual form (always shown for manual mode, shown after AI populates) */}
          {(mode === 'manual') && !aiLoading && (
            <>
              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} placeholder="Recipe title" value={title} onChangeText={setTitle} />

              <Text style={styles.label}>Ingredients</Text>
              {ingredients.map((ing, i) => (
                <View key={i} style={styles.row}>
                  <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Item" value={ing.name} onChangeText={(v) => updateIngredient(i, 'name', v)} />
                  <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Amount" value={ing.description} onChangeText={(v) => updateIngredient(i, 'description', v)} />
                  <TouchableOpacity onPress={() => removeIngredient(i)}>
                    <Ionicons name="close-circle" size={24} color="#ff3b30" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={addIngredient} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                <Text style={styles.addText}>Add ingredient</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Steps</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.stepNumber}>{i + 1}.</Text>
                  <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Instruction" value={step.instruction} onChangeText={(v) => updateStep(i, v)} multiline />
                  <TouchableOpacity onPress={() => removeStep(i)}>
                    <Ionicons name="close-circle" size={24} color="#ff3b30" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={addStep} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                <Text style={styles.addText}>Add step</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Recipe'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#007AFF',
  },
  modeActive: { backgroundColor: '#007AFF' },
  modeText: { fontSize: 13, color: '#007AFF' },
  modeTextActive: { color: '#fff' },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addText: { color: '#007AFF', marginLeft: 6 },
  saveButton: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aiButton: {
    backgroundColor: '#5856D6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12,
  },
  aiButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aiLoading: { alignItems: 'center', paddingVertical: 48 },
  aiLoadingText: { marginTop: 12, color: '#888', fontSize: 16 },
  photoButton: {
    alignItems: 'center', paddingVertical: 48, borderWidth: 2,
    borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 12, marginTop: 8,
  },
  photoText: { marginTop: 8, color: '#007AFF', fontSize: 16 },
});
