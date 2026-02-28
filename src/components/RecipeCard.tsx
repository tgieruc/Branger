import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@/lib/types';
import { useColors } from '@/hooks/useColors';
import { shadow } from '@/constants/theme';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const colors = useColors();

  return (
    <Link href={`/(tabs)/recipes/${recipe.id}`} asChild>
      <TouchableOpacity style={StyleSheet.flatten([styles.card, { backgroundColor: colors.card }])}>
        {recipe.photo_url ? (
          <Image source={{ uri: recipe.photo_url }} style={styles.image} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="restaurant-outline" size={28} color={colors.textTertiary} />
          </View>
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
    ...shadow(1, 4, 0.1),
  },
  image: { width: 80, height: 80 },
  imagePlaceholder: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  date: { fontSize: 12, marginTop: 4 },
});
