import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type ListSummary = {
  id: string;
  name: string;
  item_count: number;
  unchecked_count: number;
};

export default function ListsScreen() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchLists = async () => {
    const { data: memberships } = await supabase
      .from('list_members')
      .select('list_id')
      .eq('user_id', user!.id);

    if (!memberships || memberships.length === 0) {
      setLists([]);
      setLoading(false);
      return;
    }

    const listIds = memberships.map((m) => m.list_id);

    const { data: listsData } = await supabase
      .from('shopping_lists')
      .select('id, name')
      .in('id', listIds)
      .order('updated_at', { ascending: false });

    if (!listsData) {
      setLists([]);
      setLoading(false);
      return;
    }

    // Get item counts for each list
    const summaries: ListSummary[] = [];
    for (const list of listsData) {
      const { count: totalCount } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      const { count: uncheckedCount } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id)
        .eq('checked', false);

      summaries.push({
        id: list.id,
        name: list.name,
        item_count: totalCount ?? 0,
        unchecked_count: uncheckedCount ?? 0,
      });
    }

    setLists(summaries);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLists();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    fetchLists();
  }, []));

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase.rpc('create_list_with_member', {
      list_name: newName.trim(),
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNewName('');
    setShowCreate(false);
    fetchLists();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link href={`/(tabs)/lists/${item.id}`} asChild>
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>
                  {item.unchecked_count} remaining / {item.item_count} total
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          </Link>
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No lists yet. Tap + to create one.</Text>
        }
      />

      {showCreate && (
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            placeholder="List name"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <TouchableOpacity onPress={handleCreate}>
            <Ionicons name="checkmark-circle" size={32} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, showCreate && styles.fabShifted]}
        onPress={() => setShowCreate(!showCreate)}
      >
        <Ionicons name={showCreate ? 'close' : 'add'} size={28} color="#fff" />
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8, paddingBottom: 80 },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#888', marginTop: 4 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: '#fff', borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  createInput: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 15, marginRight: 8,
  },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#007AFF', justifyContent: 'center',
    alignItems: 'center', elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabShifted: {
    bottom: 80,
  },
});
