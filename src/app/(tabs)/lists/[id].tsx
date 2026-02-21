import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
  Platform, Share, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useIsOnline } from '@/lib/net-info';
import { enqueue, replayQueue } from '@/lib/offline-queue';
import type { ShoppingList, ListItem, ListMember } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useColors } from '@/hooks/useColors';
import { EmptyChecklist } from '@/components/illustrations/EmptyChecklist';

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const isOnline = useIsOnline();
  const wasOnlineRef = useRef(isOnline);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteListVisible, setDeleteListVisible] = useState(false);
  const keyboardHeight = useKeyboardHeight();

  const fetchData = useCallback(async () => {
    const [listRes, itemsRes, membersRes] = await Promise.all([
      supabase.from('shopping_lists').select('*').eq('id', id).single(),
      supabase.from('list_items').select('*').eq('list_id', id).order('position'),
      supabase.from('list_members').select('*').eq('list_id', id),
    ]);

    if (listRes.data) setList(listRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`list-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'list_items',
        filter: `list_id=eq.${id}`,
      }, (payload) => {
        setItems((prev) => {
          if (prev.some(i => i.id === payload.new.id)) return prev;
          return [...prev, payload.new as ListItem];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'list_items',
        filter: `list_id=eq.${id}`,
      }, (payload) => {
        setItems((prev) => prev.map(i =>
          i.id === payload.new.id ? (payload.new as ListItem) : i
        ));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'list_items',
        filter: `list_id=eq.${id}`,
      }, (payload) => {
        setItems((prev) => prev.filter(i => i.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      replayQueue(supabase).then(({ failed }) => {
        if (failed > 0) {
          Alert.alert('Sync Issue', `${failed} change(s) could not be synced. They will be retried next time.`);
        }
        fetchData();
      });
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, fetchData]);

  const toggleItem = async (item: ListItem) => {
    const previousItems = items;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, checked: !i.checked } : i));
    if (!isOnline) {
      enqueue({ type: 'toggle_item', payload: { itemId: item.id, checked: !item.checked } });
      return;
    }
    const { error } = await supabase
      .from('list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);
    if (error) {
      setItems(previousItems);
    }
  };

  const deleteItem = (itemId: string) => {
    setDeleteItemId(itemId);
  };

  const confirmDeleteItem = async () => {
    if (!deleteItemId) return;
    const previousItems = items;
    const idToDelete = deleteItemId;
    setItems((prev) => prev.filter((i) => i.id !== idToDelete));
    setDeleteItemId(null);
    if (!isOnline) {
      enqueue({ type: 'delete_item', payload: { itemId: idToDelete } });
      return;
    }
    const { error } = await supabase.from('list_items').delete().eq('id', idToDelete);
    if (error) {
      setItems(previousItems);
    }
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;

    const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) : -1;
    const itemData = {
      list_id: id,
      name: newItemName.trim(),
      description: newItemDesc.trim() || null,
      position: maxPos + 1,
    };

    if (!isOnline) {
      const tempId = `temp_${Date.now()}`;
      setItems((prev) => [...prev, { ...itemData, id: tempId, checked: false, recipe_id: null } as ListItem]);
      enqueue({ type: 'add_item', payload: itemData });
      setNewItemName('');
      setNewItemDesc('');
      return;
    }

    await supabase.from('list_items').insert(itemData);

    setNewItemName('');
    setNewItemDesc('');
  };

  const confirmDeleteList = async () => {
    if (!user) return;
    setDeleteListVisible(false);
    await supabase
      .from('list_members')
      .delete()
      .eq('list_id', id)
      .eq('user_id', user.id);
    router.back();
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
    const checkedItems = items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;
    const previousItems = items;
    setItems((prev) => prev.filter((i) => !i.checked));
    if (!isOnline) {
      for (const item of checkedItems) {
        enqueue({ type: 'delete_item', payload: { itemId: item.id } });
      }
      return;
    }
    const checkedIds = checkedItems.map((i) => i.id);
    const { error } = await supabase.from('list_items').delete().in('id', checkedIds);
    if (error) {
      setItems(previousItems);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const sortedItems = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.position - b.position;
  });

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: list?.name ?? 'List',
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleShareList} style={styles.headerBtn} accessibilityLabel="Share list" accessibilityRole="button">
                <Ionicons name="share-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDeleteListVisible(true)} style={styles.headerBtn} accessibilityLabel="Delete list" accessibilityRole="button">
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.offlineBannerBg }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.offlineBannerText} />
          <Text style={[styles.offlineBannerText, { color: colors.offlineBannerText }]}>
            You&apos;re offline. Changes will sync when reconnected.
          </Text>
        </View>
      )}

      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <EmptyChecklist />
            <Text style={[styles.emptyListText, { color: colors.textTertiary }]}>
              This list is empty. Add items below!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.itemRow, { borderBottomColor: colors.borderLight }]}
            onPress={() => toggleItem(item)}
          >
            <Ionicons
              name={item.checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={item.checked ? colors.success : colors.border}
            />
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: colors.text }, item.checked && { textDecorationLine: 'line-through', color: colors.checkedText }]}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={[styles.itemDesc, { color: colors.textTertiary }, item.checked && { textDecorationLine: 'line-through', color: colors.checkedText }]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => deleteItem(item.id)}
              style={styles.deleteButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.border} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          checkedCount > 0 ? (
            <TouchableOpacity onPress={clearChecked} style={styles.clearChecked}>
              <Text style={[styles.clearCheckedText, { color: colors.danger }]}>
                Clear {checkedCount} checked item{checkedCount !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <View style={[styles.addRow, { marginBottom: keyboardHeight, backgroundColor: colors.inputAreaBg, borderTopColor: colors.borderLight }]}>
        <TextInput
          style={[styles.addInput, { flex: 2, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]}
          placeholder="Item name"
          placeholderTextColor={colors.placeholder}
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={addItem}
        />
        <TextInput
          style={[styles.addInput, { flex: 1, marginLeft: 8, borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBackground }]}
          placeholder="Amount"
          placeholderTextColor={colors.placeholder}
          value={newItemDesc}
          onChangeText={setNewItemDesc}
          onSubmitEditing={addItem}
        />
        <TouchableOpacity onPress={addItem} style={styles.addButton}>
          <Ionicons name="add-circle" size={36} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={deleteItemId !== null}
        title="Delete Item"
        message="Remove this item from the list?"
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteItemId(null)}
      />

      <ConfirmDialog
        visible={deleteListVisible}
        title="Delete List"
        message={
          members.length === 1
            ? 'This will permanently delete the list and all its items.'
            : 'You will be removed from this list.'
        }
        onConfirm={confirmDeleteList}
        onCancel={() => setDeleteListVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 16, marginRight: 4 },
  headerBtn: { padding: 4 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemInfo: { marginLeft: 12, flex: 1 },
  itemName: { fontSize: 16 },
  itemDesc: { fontSize: 13, marginTop: 2 },
  deleteButton: { padding: 4 },
  clearChecked: { paddingVertical: 14, alignItems: 'center' },
  clearCheckedText: { fontSize: 14 },
  addRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderTopWidth: 1,
  },
  addInput: {
    borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15,
  },
  addButton: { marginLeft: 8 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 16, gap: 8,
  },
  offlineBannerText: { fontSize: 13 },
  emptyList: { alignItems: 'center', paddingTop: 64 },
  emptyListText: { fontSize: 15, marginTop: 16, textAlign: 'center' },
});
