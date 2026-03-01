import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '@/lib/api';

const QUEUE_KEY = '@offline_queue';

export type QueueEntry = {
  id: string;
  type: 'add_item' | 'delete_item' | 'toggle_item';
  payload: Record<string, unknown>;
  timestamp: number;
};

export async function enqueue(entry: Omit<QueueEntry, 'id' | 'timestamp'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<QueueEntry[]> {
  const data = await AsyncStorage.getItem(QUEUE_KEY);
  return data ? JSON.parse(data) : [];
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function replayQueue(): Promise<{ success: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  const failedEntries: QueueEntry[] = [];

  for (const entry of queue) {
    let ok = false;

    // Skip toggle/delete for temp IDs — the add_item will create the real row
    if ((entry.type === 'delete_item' || entry.type === 'toggle_item') &&
        typeof entry.payload.itemId === 'string' &&
        entry.payload.itemId.startsWith('temp_')) {
      // Temp items don't exist server-side yet, skip silently
      continue;
    }

    try {
      switch (entry.type) {
        case 'add_item': {
          const listId = entry.payload.list_id as string;
          const resp = await apiCall(`/api/lists/${listId}/items`, {
            method: 'POST',
            body: JSON.stringify([{
              name: entry.payload.name as string,
              description: (entry.payload.description as string | null) || null,
              recipe_id: null,
            }]),
          });
          ok = resp.ok;
          break;
        }
        case 'delete_item': {
          const listId = entry.payload.list_id as string;
          const itemId = entry.payload.itemId as string;
          const resp = await apiCall(`/api/lists/${listId}/items/${itemId}`, {
            method: 'DELETE',
          });
          ok = resp.ok;
          break;
        }
        case 'toggle_item': {
          const listId = entry.payload.list_id as string;
          const itemId = entry.payload.itemId as string;
          const resp = await apiCall(`/api/lists/${listId}/items/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ checked: entry.payload.checked as boolean }),
          });
          ok = resp.ok;
          break;
        }
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      failed++;
      failedEntries.push(entry);
    } else {
      success++;
    }
  }

  // Only clear successful entries; keep failed ones for retry
  if (failedEntries.length > 0) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedEntries));
  } else {
    await clearQueue();
  }
  return { success, failed };
}
