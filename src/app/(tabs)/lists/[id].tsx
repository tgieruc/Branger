import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator,
  Platform, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { ShoppingList, ListItem, ListMember } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const keyboardHeight = useKeyboardHeight();

  const fetchData = async () => {
    const [listRes, itemsRes, membersRes] = await Promise.all([
      supabase.from('shopping_lists').select('*').eq('id', id).single(),
      supabase.from('list_items').select('*').eq('list_id', id).order('position'),
      supabase.from('list_members').select('*').eq('list_id', id),
    ]);

    if (listRes.data) setList(listRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for items
    const channel = supabase
      .channel(`list-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'list_items',
        filter: `list_id=eq.${id}`,
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const toggleItem = async (item: ListItem) => {
    await supabase
      .from('list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);
  };

  const deleteItem = async (itemId: string) => {
    Alert.alert('Delete Item', 'Remove this item from the list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('list_items').delete().eq('id', itemId);
        },
      },
    ]);
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;

    const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) : -1;

    await supabase.from('list_items').insert({
      list_id: id,
      name: newItemName.trim(),
      description: newItemDesc.trim() || null,
      position: maxPos + 1,
    });

    setNewItemName('');
    setNewItemDesc('');
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave List',
      members.length === 1
        ? 'You are the last member. The list will be deleted.'
        : 'Are you sure you want to leave this list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('list_members')
              .delete()
              .eq('list_id', id)
              .eq('user_id', user!.id);
            router.back();
          },
        },
      ]
    );
  };

  const handleShareList = async () => {
    if (!list) return;
    const shareUrl = `branger://list/${id}`;
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? `Join my shopping list "${list.name}" on Branger`
          : `Join my shopping list "${list.name}" on Branger\n${shareUrl}`,
        url: Platform.OS === 'ios' ? shareUrl : undefined,
      });
    } catch {
      // User cancelled share sheet
    }
  };

  const clearChecked = async () => {
    const checkedIds = items.filter((i) => i.checked).map((i) => i.id);
    if (checkedIds.length === 0) return;

    await supabase.from('list_items').delete().in('id', checkedIds);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Sort: unchecked first, then checked
  const sortedItems = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.position - b.position;
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: list?.name ?? 'List' }} />
      <View style={styles.header}>
        <Text style={styles.title}>{list?.name}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShareList} style={styles.headerButton}>
            <Ionicons name="share-outline" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearChecked} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeave} style={styles.headerButton}>
            <Ionicons name="exit-outline" size={20} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => toggleItem(item)}
          >
            <Ionicons
              name={item.checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={item.checked ? '#34c759' : '#ccc'}
            />
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, item.checked && styles.checkedText]}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={[styles.itemDesc, item.checked && styles.checkedText]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => deleteItem(item.id)}
              style={styles.deleteButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={20} color="#ccc" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <View style={[styles.addRow, { marginBottom: keyboardHeight }]}>
        <TextInput
          style={[styles.addInput, { flex: 2 }]}
          placeholder="Item name"
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={addItem}
        />
        <TextInput
          style={[styles.addInput, { flex: 1, marginLeft: 8 }]}
          placeholder="Amount"
          value={newItemDesc}
          onChangeText={setNewItemDesc}
          onSubmitEditing={addItem}
        />
        <TouchableOpacity onPress={addItem} style={styles.addButton}>
          <Ionicons name="add-circle" size={36} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerButton: { padding: 4 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  itemInfo: { marginLeft: 12, flex: 1 },
  itemName: { fontSize: 16 },
  itemDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  checkedText: { textDecorationLine: 'line-through', color: '#bbb' },
  deleteButton: { padding: 4 },
  addRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fafafa',
  },
  addInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15,
  },
  addButton: { marginLeft: 8 },
});
