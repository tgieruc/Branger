import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import ConfirmDialog from '@/components/ConfirmDialog';

type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

const MCP_ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mcp-server`;

export default function ApiTokensScreen() {
  const colors = useColors();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'endpoint' | null>(null);

  const fetchTokens = useCallback(async () => {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('id, name, token_prefix, last_used_at, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setTokens(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTokens();
    }, [fetchTokens])
  );

  const handleCreate = async () => {
    const name = newTokenName.trim() || 'API Token';
    const { data, error } = await supabase.rpc('create_api_token', { p_name: name });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNewTokenValue(data[0].token);
    setNewTokenName('');
    fetchTokens();
  };

  const handleDelete = async () => {
    if (!deleteTokenId) return;
    const { error } = await supabase.from('api_tokens').delete().eq('id', deleteTokenId);
    if (error) {
      Alert.alert('Error', error.message);
    }
    setDeleteTokenId(null);
    fetchTokens();
  };

  const copyToClipboard = async (text: string, type: 'token' | 'endpoint') => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(text);
      }
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'API Tokens' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* MCP Endpoint */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>MCP ENDPOINT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => copyToClipboard(MCP_ENDPOINT, 'endpoint')}
            accessibilityLabel="Copy MCP endpoint URL"
            accessibilityRole="button"
          >
            <Text style={[styles.endpointText, { color: colors.textSecondary }]} numberOfLines={1}>
              {MCP_ENDPOINT}
            </Text>
            <Ionicons
              name={copied === 'endpoint' ? 'checkmark' : 'copy-outline'}
              size={18}
              color={copied === 'endpoint' ? colors.success : colors.primary}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Use this URL to connect AI agents (Claude, etc.) to your Branger account via MCP.
        </Text>

        {/* Tokens List */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>TOKENS</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          {loading ? (
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary }}>Loading...</Text>
            </View>
          ) : tokens.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary }}>No tokens yet</Text>
            </View>
          ) : (
            tokens.map((token, index) => (
              <View key={token.id}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
                )}
                <View style={styles.tokenRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tokenName, { color: colors.text }]}>{token.name}</Text>
                    <Text style={[styles.tokenMeta, { color: colors.textSecondary }]}>
                      {token.token_prefix}... · Created {formatDate(token.created_at)}
                      {token.last_used_at ? ` · Last used ${formatDate(token.last_used_at)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDeleteTokenId(token.id)}
                    accessibilityLabel={`Revoke token ${token.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: colors.primary }]}
          onPress={() => setCreateModalVisible(true)}
          accessibilityLabel="Generate new API token"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.generateButtonText}>Generate Token</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Create Token Modal */}
      <Modal visible={createModalVisible && !newTokenValue} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Generate API Token</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}
              placeholder="Token name (optional)"
              placeholderTextColor={colors.textSecondary}
              value={newTokenName}
              onChangeText={setNewTokenName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.borderLight }]}
                onPress={() => { setCreateModalVisible(false); setNewTokenName(''); }}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreate}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Show Token Modal (shown once after creation) */}
      <Modal visible={!!newTokenValue} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Token Created</Text>
            <Text style={[styles.warningText, { color: colors.danger }]}>
              Copy this token now. It will not be shown again.
            </Text>
            <TouchableOpacity
              style={[styles.tokenDisplay, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}
              onPress={() => newTokenValue && copyToClipboard(newTokenValue, 'token')}
              accessibilityLabel="Copy token"
              accessibilityRole="button"
            >
              <Text style={[styles.tokenText, { color: colors.text }]} selectable>
                {newTokenValue}
              </Text>
              <Ionicons
                name={copied === 'token' ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copied === 'token' ? colors.success : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}
              onPress={() => { setNewTokenValue(null); setCreateModalVisible(false); }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        visible={!!deleteTokenId}
        title="Revoke Token"
        message="Any agent using this token will lose access. This cannot be undone."
        confirmLabel="Revoke"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTokenId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  hint: { fontSize: 13, marginBottom: 24, marginLeft: 16, marginRight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  endpointText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tokenName: { fontSize: 16, fontWeight: '500' },
  tokenMeta: { fontSize: 13, marginTop: 2 },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  warningText: { fontSize: 14, marginBottom: 12 },
  tokenDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  tokenText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
});
