import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson, apiCall } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useColors } from '@/hooks/useColors';
import { shadow } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { EmptyShoppingBag } from '@/components/illustrations/EmptyShoppingBag';

type ListSummary = {
  id: string;
  name: string;
  item_count: number;
  unchecked_count: number;
};

export default function ListsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  const fetchLists = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data, error } = await apiJson<ListSummary[]>('/api/lists/');

    if (error || !data) {
      setLists([]);
      setLoading(false);
      return;
    }

    setLists(data);
    setLoading(false);
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLists();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    fetchLists();
  }, [fetchLists]));

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const { error } = await apiJson('/api/lists/', {
      method: 'POST',
      body: JSON.stringify({ name: newName.trim() }),
    });

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    setNewName('');
    setShowCreate(false);
    fetchLists();
  };

  const confirmDeleteList = async () => {
    if (!deleteListId || !user) return;
    await apiCall(`/api/lists/${deleteListId}`, { method: 'DELETE' });
    setDeleteListId(null);
    fetchLists();
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cardRow}>
            <Link href={`/(tabs)/lists/${item.id}`} asChild style={{ flex: 1 }}>
              <TouchableOpacity style={StyleSheet.flatten([styles.card, { backgroundColor: colors.card }])}>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.cardSub, { color: colors.textTertiary }]}>
                    {item.unchecked_count} remaining / {item.item_count} total
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
              </TouchableOpacity>
            </Link>
            <TouchableOpacity
              style={styles.cardDelete}
              onPress={() => setDeleteListId(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Delete list"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            illustration={<EmptyShoppingBag />}
            title="No shopping lists yet"
            subtitle="Create a list and add ingredients from your recipes"
            actionLabel="Create a List"
            onAction={() => setShowCreate(true)}
          />
        }
      />

      {showCreate ? (
        <View style={[styles.createRow, { marginBottom: keyboardHeight, backgroundColor: colors.background, borderTopColor: colors.borderLight }]}>
          <TouchableOpacity onPress={() => { setShowCreate(false); setNewName(''); }}>
            <Ionicons name="close-circle" size={32} color={colors.placeholder} />
          </TouchableOpacity>
          <TextInput
            style={[styles.createInput, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]}
            placeholder="List name"
            placeholderTextColor={colors.placeholder}
            value={newName}
            onChangeText={setNewName}
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <TouchableOpacity onPress={handleCreate}>
            <Ionicons name="checkmark-circle" size={32} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, bottom: Math.max(24, insets.bottom + 8) }]}
          onPress={() => setShowCreate(true)}
          accessibilityLabel="Create new list"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={28} color={colors.buttonText} />
        </TouchableOpacity>
      )}

      <ConfirmDialog
        visible={deleteListId !== null}
        title="Delete List"
        message="Are you sure you want to delete this list and all its items?"
        onConfirm={confirmDeleteList}
        onCancel={() => setDeleteListId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6,
  },
  card: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 12,
    ...shadow(1, 4, 0.1),
  },
  cardDelete: { padding: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 4 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderTopWidth: 1,
  },
  createInput: {
    flex: 1, borderWidth: 1, borderRadius: 8,
    padding: 10, fontSize: 15, marginHorizontal: 8,
  },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, justifyContent: 'center',
    alignItems: 'center',
    ...shadow(2, 4, 0.25),
  },
});
