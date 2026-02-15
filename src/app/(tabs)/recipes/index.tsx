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
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { RecipeCard } from '@/components/RecipeCard';
import { getCachedRecipeList, setCachedRecipeList } from '@/lib/cache';
import type { Recipe } from '@/lib/types';

const PAGE_SIZE = 20;

export default function RecipesScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#888" />
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
          <Text style={styles.empty}>
            {searchQuery.length > 0
              ? 'No recipes match your search.'
              : 'No recipes yet. Tap + to create one.'}
          </Text>
        }
      />
      <Link href="/(tabs)/recipes/create" asChild>
        <TouchableOpacity
          style={styles.fab}
          accessibilityLabel="Create new recipe"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  list: { paddingVertical: 8, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
