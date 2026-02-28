import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { RecipeCard } from '@/components/RecipeCard';
import { getCachedRecipeList, setCachedRecipeList } from '@/lib/cache';
import { useColors } from '@/hooks/useColors';
import { shadow } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { EmptyCookbook } from '@/components/illustrations/EmptyCookbook';
import type { Recipe } from '@/lib/types';

const PAGE_SIZE = 20;

export default function RecipesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const recipesRef = useRef<Recipe[]>([]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    recipesRef.current = recipes;
  }, [recipes]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchRecipes = useCallback(
    async (reset: boolean) => {
      if (!reset && !hasMoreRef.current) return;

      const currentRecipes = recipesRef.current;
      const lastRecipe = reset ? null : currentRecipes[currentRecipes.length - 1];
      const { data } = await supabase.rpc('search_recipes', {
        p_query: debouncedQuery,
        p_limit: PAGE_SIZE,
        p_cursor_time: lastRecipe?.created_at ?? null,
        p_cursor_id: lastRecipe?.id ?? null,
      });

      if (data) {
        if (reset) {
          setRecipes(data);
          recipesRef.current = data;
          if (debouncedQuery === '') {
            setCachedRecipeList(data);
          }
        } else {
          setRecipes((prev) => {
            const next = [...prev, ...data];
            recipesRef.current = next;
            return next;
          });
        }
        const more = data.length === PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [debouncedQuery],
  );

  useEffect(() => {
    setRecipes([]);
    recipesRef.current = [];
    setHasMore(true);
    hasMoreRef.current = true;
    setLoading(true);
    fetchRecipes(true);
  }, [fetchRecipes]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        if (recipesRef.current.length === 0) {
          const cached = await getCachedRecipeList();
          if (cached && cached.length > 0) {
            setRecipes(cached);
            recipesRef.current = cached;
            setLoading(false);
          }
        }
        setHasMore(true);
        hasMoreRef.current = true;
        fetchRecipes(true);
      };
      load();
    }, [fetchRecipes]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setHasMore(true);
    hasMoreRef.current = true;
    await fetchRecipes(true);
    setRefreshing(false);
  }, [fetchRecipes]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.searchContainer, { backgroundColor: colors.searchBarBg, borderColor: colors.inputBorder }]}>
        <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search recipes..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={() => {
          if (!loadingMore && hasMore) {
            setLoadingMore(true);
            fetchRecipes(false);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} /> : null}
        ListEmptyComponent={
          searchQuery.length > 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              No recipes match your search.
            </Text>
          ) : (
            <EmptyState
              illustration={<EmptyCookbook />}
              title="Your cookbook is empty"
              subtitle="Import a recipe from a URL, photo, or add one manually"
              actionLabel="Add Your First Recipe"
              onAction={() => router.push('/(tabs)/recipes/create')}
            />
          )
        }
      />
      <Link href="/(tabs)/recipes/create" asChild>
        <TouchableOpacity
          style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.primary, bottom: Math.max(24, insets.bottom + 8) }])}
          accessibilityLabel="Create new recipe"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={28} color={colors.buttonText} />
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  list: { paddingVertical: 8, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow(2, 4, 0.25),
  },
});
