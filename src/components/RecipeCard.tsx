import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import type { Recipe } from '@/lib/types';
import { useColors } from '@/hooks/useColors';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const colors = useColors();

  return (
    <Link href={`/(tabs)/recipes/${recipe.id}`} asChild>
      <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
        {recipe.photo_url && (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        )}
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>
          <Text style={[styles.date, { color: colors.textTertiary }]}>
            {new Date(recipe.created_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: 'hidden',
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  image: { width: 80, height: 80 },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  date: { fontSize: 12, marginTop: 4 },
});
