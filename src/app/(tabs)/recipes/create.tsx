import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type Ingredient = { name: string; description: string };
type Step = { instruction: string };

export default function CreateRecipeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', description: '' },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '' }]);
  const [saving, setSaving] = useState(false);

  // --- AI state (will be wired in Task 15) ---
  const [mode, setMode] = useState<'manual' | 'text' | 'url' | 'photo'>('manual');

  const addIngredient = () =>
    setIngredients([...ingredients, { name: '', description: '' }]);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const removeIngredient = (index: number) =>
    setIngredients(ingredients.filter((_, i) => i !== index));

  const addStep = () => setSteps([...steps, { instruction: '' }]);

  const updateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index].instruction = value;
    setSteps(updated);
  };

  const removeStep = (index: number) =>
    setSteps(steps.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }

    const validIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());

    setSaving(true);

    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({ title: title.trim(), user_id: user!.id, source_type: 'manual' })
      .select()
      .single();

    if (error || !recipe) {
      Alert.alert('Error', error?.message ?? 'Failed to create recipe');
      setSaving(false);
      return;
    }

    if (validIngredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        validIngredients.map((ing, i) => ({
          recipe_id: recipe.id,
          name: ing.name.trim(),
          description: ing.description.trim(),
          position: i,
        }))
      );
    }

    if (validSteps.length > 0) {
      await supabase.from('recipe_steps').insert(
        validSteps.map((step, i) => ({
          recipe_id: recipe.id,
          step_number: i + 1,
          instruction: step.instruction.trim(),
        }))
      );
    }

    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="Recipe title"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Ingredients</Text>
      {ingredients.map((ing, i) => (
        <View key={i} style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Item (e.g. tomato)"
            value={ing.name}
            onChangeText={(v) => updateIngredient(i, 'name', v)}
          />
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Amount (e.g. 1 can)"
            value={ing.description}
            onChangeText={(v) => updateIngredient(i, 'description', v)}
          />
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
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Instruction"
            value={step.instruction}
            onChangeText={(v) => updateStep(i, v)}
            multiline
          />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNumber: { fontSize: 15, fontWeight: '600', marginRight: 8, width: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  addText: { color: '#007AFF', marginLeft: 6 },
  saveButton: {
    backgroundColor: '#007AFF', borderRadius: 8, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
