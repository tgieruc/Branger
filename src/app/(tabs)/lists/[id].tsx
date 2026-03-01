import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
  Platform, Share, Alert, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiJson, apiCall, getWsUrl, getAccessToken, getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIsOnline } from '@/lib/net-info';
import { enqueue, replayQueue } from '@/lib/offline-queue';
import type { ListItem } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useColors } from '@/hooks/useColors';
import { EmptyChecklist } from '@/components/illustrations/EmptyChecklist';

type ListDetailOut = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  items: ListItem[];
  members: { user_id: string; email: string; joined_at: string }[];
};

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const isOnline = useIsOnline();
  const wasOnlineRef = useRef(isOnline);
  const [listName, setListName] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteListVisible, setDeleteListVisible] = useState(false);
  const [clearCheckedVisible, setClearCheckedVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const wsRef = useRef<WebSocket | null>(null);

  const fetchData = useCallback(async () => {
    const { data, error } = await apiJson<ListDetailOut>(`/api/lists/${id}`);

    if (data && !error) {
      setListName(data.name);
      setItems(data.items);
      setMemberCount(data.members.length);
    }
    setLoading(false);
  }, [id]);

  // WebSocket connection for realtime updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    const connectWs = async () => {
      const wsBase = await getWsUrl();
      const token = await getAccessToken();
      if (!token || cancelled) return;

      ws = new WebSocket(`${wsBase}/ws/lists/${id}?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const { event: evt, record } = JSON.parse(event.data);
          switch (evt) {
            case 'INSERT':
              setItems((prev) => {
                if (prev.some(i => i.id === record.id)) return prev;
                return [...prev, record as ListItem];
              });
              break;
            case 'UPDATE':
              setItems((prev) => prev.map(i =>
                i.id === record.id ? (record as ListItem) : i
              ));
              break;
            case 'DELETE':
              setItems((prev) => prev.filter(i => i.id !== record.id));
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      if (!cancelled) {
        wsRef.current = ws;
      }
    };

    fetchData();
    connectWs();

    return () => {
      cancelled = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [id, fetchData]);

  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      replayQueue().then(({ failed }) => {
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
      enqueue({ type: 'toggle_item', payload: { itemId: item.id, list_id: id, checked: !item.checked } });
      return;
    }
    const resp = await apiCall(`/api/lists/${id}/items/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ checked: !item.checked }),
    });
    if (!resp.ok) {
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
      enqueue({ type: 'delete_item', payload: { itemId: idToDelete, list_id: id } });
      return;
    }
    const resp = await apiCall(`/api/lists/${id}/items/${idToDelete}`, { method: 'DELETE' });
    if (!resp.ok) {
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

    await apiJson(`/api/lists/${id}/items`, {
      method: 'POST',
      body: JSON.stringify([{
        name: newItemName.trim(),
        description: newItemDesc.trim() || null,
        recipe_id: null,
      }]),
    });

    setNewItemName('');
    setNewItemDesc('');
  };

  const confirmDeleteList = async () => {
    if (!user) return;
    setDeleteListVisible(false);
    await apiCall(`/api/lists/${id}`, { method: 'DELETE' });
    router.replace('/(tabs)/lists');
  };

  const handleShareList = async () => {
    if (!listName) return;
    const serverUrl = await getServerUrl();
    const shareUrl = `${serverUrl}/list/${id}`;
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? `Join my shopping list "${listName}" on Branger`
          : `Join my shopping list "${listName}" on Branger\n${shareUrl}`,
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
        enqueue({ type: 'delete_item', payload: { itemId: item.id, list_id: id } });
      }
      return;
    }
    const checkedIds = checkedItems.map((i) => i.id);
    const resp = await apiCall(`/api/lists/${id}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ item_ids: checkedIds }),
    });
    if (!resp.ok) {
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
          title: listName ?? 'List',
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await fetchData();
            setRefreshing(false);
          }} />
        }
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
            <TouchableOpacity onPress={() => setClearCheckedVisible(true)} style={styles.clearChecked}>
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
        visible={clearCheckedVisible}
        title="Clear Checked Items"
        message={`Remove ${checkedCount} checked item${checkedCount !== 1 ? 's' : ''} from the list?`}
        confirmLabel="Clear"
        onConfirm={() => { setClearCheckedVisible(false); clearChecked(); }}
        onCancel={() => setClearCheckedVisible(false)}
      />

      <ConfirmDialog
        visible={deleteListVisible}
        title="Delete List"
        message={
          memberCount === 1
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
